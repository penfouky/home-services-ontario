"""Makes a fake Toniebox SD card for testing the app, with every kind of tonie the app tells apart.

usage: fixtures.py <teddy> <sd folder> [tonies.json]
Prints a JSON description of the tags. Needs only python3 (and the teddy command-line tool).

  custom     made by teddy (audio id below 0x50000000), 3 chapters
  custom2    made by teddy, 1 chapter
  mystery    audio id of a real tonie format, in no list
  official   the audio id of an entry in tonies.json (only with a tonies.json)
  incomplete a download the box did not finish (file cut short)
  broken     not a tonie file at all
plus the AppleDouble junk a Mac leaves on FAT cards.
"""
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import wave


def tone(path, seconds, freq_left, freq_right, rate=44100):
    frames = bytearray()
    for i in range(int(seconds * rate)):
        t = i / rate
        frames += struct.pack('<hh', int(12000 * math.sin(2 * math.pi * freq_left * t)),
                              int(12000 * math.sin(2 * math.pi * freq_right * t)))
    with wave.open(path, 'wb') as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(bytes(frames))


def content_path(sd, uid):
    """tag E0:04:03:50:1E:E9:18:F2 -> CONTENT/F218E91E/500304E0"""
    raw = bytes.fromhex(uid)[::-1].hex().upper()
    return os.path.join(sd, 'CONTENT', raw[:8], raw[8:])


def encode(teddy, out, audio_id, inputs):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run([teddy, '-j', 'none', '-m', 'encode', '-i', hex(audio_id), '-o', out, *inputs],
                   check=True, stdout=subprocess.DEVNULL)


def official_audio_id(tonies_json):
    articles = json.load(open(tonies_json, encoding='utf-8'))
    for article in articles:
        for item in article.get('data', []):
            if item.get('category', '').lower() in ('creative tonie', 'system') or not item.get('series'):
                continue
            for entry in item.get('ids', []):
                if entry.get('audio-id'):
                    return int(entry['audio-id']), item['series']
    return None, None


def main(teddy, sd, tonies_json=None):
    tags = {
        'custom': 'E00403501EE918F2',
        'custom2': 'E0040350AABBCCDD',
        'mystery': 'E004035011223344',
        'official': 'E004035055667788',
        'incomplete': 'E004035099999999',
        'broken': 'E004035012121212',
    }
    work = tempfile.mkdtemp()
    try:
        names = []
        for i, (seconds, left, right) in enumerate([(3, 440, 660), (2, 880, 880), (2.5, 1200, 1500)]):
            names.append(os.path.join(work, f'{i + 1:02d} Track {i + 1}.wav'))
            tone(names[-1], seconds, left, right)
        encode(teddy, content_path(sd, tags['custom']), 0x12340001, names)
        encode(teddy, content_path(sd, tags['custom2']), 0x12340002, names[1:2])
        encode(teddy, content_path(sd, tags['mystery']), 0x5F123456, names[:2])

        info = {'tags': tags, 'official_title': None}
        audio_id, title = official_audio_id(tonies_json) if tonies_json else (None, None)
        if audio_id:
            encode(teddy, content_path(sd, tags['official']), audio_id, names[2:])
            info['official_title'] = title
        else:
            del tags['official']

        incomplete = content_path(sd, tags['incomplete'])
        os.makedirs(os.path.dirname(incomplete), exist_ok=True)
        data = open(content_path(sd, tags['custom']), 'rb').read()
        open(incomplete, 'wb').write(data[:len(data) * 2 // 3])

        broken = content_path(sd, tags['broken'])
        os.makedirs(os.path.dirname(broken), exist_ok=True)
        open(broken, 'wb').write(b'this is not a tonie' * 100)

        # what a Mac leaves behind on FAT cards
        open(os.path.join(sd, '._CONTENT'), 'wb').write(b'\0' * 4096)
        custom = content_path(sd, tags['custom'])
        open(os.path.join(os.path.dirname(custom), '._' + os.path.basename(custom)), 'wb').write(b'\0' * 4096)
        print(json.dumps(info))
    finally:
        shutil.rmtree(work)


if __name__ == '__main__':
    main(*sys.argv[1:4])
