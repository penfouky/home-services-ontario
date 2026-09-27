#!/usr/bin/env python3
"""Packs PNG files into a macOS .icns icon (what iconutil does, but runs anywhere).

    png2icns.py <out.icns> <png folder with icon_16.png, icon_32.png, ... icon_1024.png>
"""
import struct
import sys
from pathlib import Path

# icns entry types holding PNG data, and the pixel size each one wants
TYPES = [
    ('icp4', 16), ('ic11', 32),    # 16 pt, @1x and @2x
    ('icp5', 32), ('ic12', 64),    # 32 pt
    ('ic07', 128), ('ic13', 256),  # 128 pt
    ('ic08', 256), ('ic14', 512),  # 256 pt
    ('ic09', 512), ('ic10', 1024), # 512 pt
]


def png_size(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG file')
    return struct.unpack('>II', data[16:24])


def main(out, folder):
    entries = b''
    for kind, size in TYPES:
        data = (Path(folder) / f'icon_{size}.png').read_bytes()
        if png_size(data) != (size, size):
            raise ValueError(f'icon_{size}.png is {png_size(data)}, expected {size}x{size}')
        entries += kind.encode('ascii') + struct.pack('>I', 8 + len(data)) + data
    Path(out).write_bytes(b'icns' + struct.pack('>I', 8 + len(entries)) + entries)
    print(f'{out}: {len(TYPES)} images, {8 + len(entries)} bytes')


if __name__ == '__main__':
    main(*sys.argv[1:3])
