"""Checks a tonie file against the layout the Toniebox expects. Independent of the C# code.

usage: validate_tonie.py [--ours] <file>...
  --ours: also check what our writer guarantees (20 ms packets <= 1275 bytes, chapters on page starts)
Prints a summary per file, exit code 1 if any file breaks a rule.
"""
import hashlib
import struct
import sys

BLOCK = 0x1000


def varint(buf, pos):
    value = shift = 0
    while True:
        byte = buf[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        shift += 7
        if byte < 0x80:
            return value, pos


def parse_header(proto):
    """protobuf: 1 hash, 2 audio length, 3 audio id, 4 chapter pages, 5 padding"""
    fields, pos = {}, 0
    while pos < len(proto):
        key, pos = varint(proto, pos)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, pos = varint(proto, pos)
            fields.setdefault(number, []).append(value)
        elif wire == 2:
            length, pos = varint(proto, pos)
            data = proto[pos:pos + length]
            pos += length
            if number == 4:  # packed chapter pages
                inner = 0
                while inner < len(data):
                    value, inner = varint(data, inner)
                    fields.setdefault(4, []).append(value)
            else:
                fields.setdefault(number, []).append(data)
        else:
            raise ValueError(f'unexpected wire type {wire}')
    return fields


CRC_TABLE = []
for i in range(256):
    r = i << 24
    for _ in range(8):
        r = ((r << 1) ^ 0x04C11DB7) & 0xFFFFFFFF if r & 0x80000000 else (r << 1) & 0xFFFFFFFF
    CRC_TABLE.append(r)


def ogg_crc(data):
    crc = 0
    for b in data:
        crc = ((crc << 8) & 0xFFFFFFFF) ^ CRC_TABLE[((crc >> 24) ^ b) & 0xFF]
    return crc


def packet_samples(packet):
    toc = packet[0]
    config = toc >> 3
    if config < 12:
        frame = (480, 960, 1920, 2880)[config & 3]
    elif config < 16:
        frame = 960 if config & 1 else 480
    else:
        frame = 120 << (config & 3)
    code = toc & 3
    return frame * (1 if code == 0 else 2 if code in (1, 2) else packet[1] & 0x3F)


def validate(path, ours):
    errors = []
    data = open(path, 'rb').read()
    header_length = struct.unpack('>I', data[:4])[0]
    if header_length != BLOCK - 4:
        errors.append(f'header length {header_length:#x}, expected 0xffc')
    fields = parse_header(data[4:4 + header_length])
    audio = data[BLOCK:]
    audio_hash, audio_length = fields.get(1, [b''])[0], fields.get(2, [0])[0]
    audio_id, chapters = fields.get(3, [0])[0], fields.get(4, [])
    if hashlib.sha1(audio).digest() != audio_hash:
        errors.append('SHA-1 of the audio does not match the header')
    if audio_length != len(audio):
        errors.append(f'audio length {audio_length} in header, file has {len(audio)}')
    if len(data) % BLOCK == 0:
        errors.append('file ends at a 4 KiB boundary')

    pos, pages, packets, serial, granule_prev = 0, [], [], None, -1
    while pos < len(audio):
        if audio[pos:pos + 4] != b'OggS':
            errors.append(f'no Ogg page at {pos:#x}')
            break
        version, flags, granule, ser, seq, crc, nseg = struct.unpack_from('<BBqIIIB', audio, pos + 4)
        lacing = audio[pos + 27:pos + 27 + nseg]
        size = 27 + nseg + sum(lacing)
        page = bytearray(audio[pos:pos + size])
        page[22:26] = b'\0\0\0\0'
        n = len(pages)
        if ogg_crc(page) != crc:
            errors.append(f'page {n}: bad CRC')
        if seq != n:
            errors.append(f'page {n}: sequence number {seq}')
        if serial is None:
            serial = ser
        elif ser != serial:
            errors.append(f'page {n}: serial {ser:#x} differs')
        if flags & 1:
            errors.append(f'page {n}: packet continued from the previous page')
        if (n == 0) != bool(flags & 2):
            errors.append(f'page {n}: wrong BOS flag')
        if granule < granule_prev:
            errors.append(f'page {n}: granule goes backwards')
        granule_prev = granule
        if pos // BLOCK != (pos + size - 1) // BLOCK:
            errors.append(f'page {n} at {pos:#x} crosses a 4 KiB block')
        start, seg_packets, current = pos + 27 + nseg, [], 0
        for lace in lacing:
            current += lace
            if lace < 255:
                seg_packets.append(audio[start:start + current])
                start += current
                current = 0
        if current:
            errors.append(f'page {n}: packet continues on the next page')
        pages.append((pos, size, flags, granule, len(packets)))
        packets.extend(seg_packets)
        pos += size

    if len(pages) < 3:
        errors.append('less than 3 pages')
        return errors, {}
    if pages[2][0] != 0x200:
        errors.append(f'first audio page at {pages[2][0]:#x}, expected 0x200')
    for n, (start, size, flags, granule, first) in enumerate(pages[2:-1], 2):
        if (start + size) % BLOCK:
            errors.append(f'page {n} ends at {start + size:#x}, not at a 4 KiB boundary')
    if not pages[-1][2] & 4:
        errors.append('last page has no EOS flag')
    if any(p[2] & 4 for p in pages[:-1]):
        errors.append('EOS flag before the last page')
    if packets[0][:8] != b'OpusHead' or packets[1][:8] != b'OpusTags':
        errors.append('missing OpusHead/OpusTags')

    samples = [packet_samples(p) for p in packets[2:]]
    total = 0
    for n, (start, size, flags, granule, first) in enumerate(pages):
        end_packet = pages[n + 1][4] if n + 1 < len(pages) else len(packets)
        total += sum(samples[max(0, i - 2)] for i in range(max(first, 2), end_packet))
        if n >= 2 and granule != total:
            errors.append(f'page {n}: granule {granule}, packets add up to {total}')
            break

    if not chapters or chapters[0] != 0:
        errors.append(f'first chapter is {chapters[:1]}, expected 0')
    if any(b <= a for a, b in zip(chapters, chapters[1:])):
        errors.append(f'chapter pages not increasing: {chapters}')
    if chapters and chapters[-1] >= len(pages):
        errors.append(f'chapter page {chapters[-1]} beyond the last page {len(pages) - 1}')

    if ours:
        big = [len(p) for p in packets[2:] if len(p) > 1275]
        if big:
            errors.append(f'{len(big)} packets larger than 1275 bytes (max {max(big)})')
        if any(s != 960 for s in samples):
            errors.append('packets other than 20 ms')

    info = {'pages': len(pages), 'packets': len(packets) - 2, 'chapters': chapters, 'seconds': total / 48000,
            'audio_id': audio_id, 'max_packet': max(len(p) for p in packets[2:])}
    return errors, info


def main():
    ours = '--ours' in sys.argv
    failed = False
    for path in [a for a in sys.argv[1:] if not a.startswith('--')]:
        errors, info = validate(path, ours)
        status = 'OK' if not errors else 'INVALID'
        print(f'{path}: {status} {info}')
        for error in errors[:20]:
            print('   ', error)
        failed |= bool(errors)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
