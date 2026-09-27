"""Check decoded tonie audio against the expected sequence of test tones.

usage: analyze_stream.py [--settle SECONDS] <stream.wav> <spec>
spec: comma separated segments "seconds:freqL[/freqR]" in playback order, e.g. "8:440/1000,5:660"
--settle: skip the level and broadband checks for the first SECONDS of the stream, where an
          encoder may still be settling (libopus at low bit rates on synthetic stereo tones)

The audio is segmented by its dominant frequency per channel. For every expected segment:
  - a segment exists, in order, with the expected frequency in each channel
    (catches wrong speed/pitch from resampling and swapped channels)
  - the tone lasts as long as in the source, +-40 ms (measured on 10 ms frames, so neighbouring
    test tones must be >= 400 Hz apart)
  - inside it the level stays within 1.5 dB and no 10 ms frame carries broadband energy
    (catches clicks, dropouts and discontinuities)
Exit code 1 on any failure. Needs numpy only.
"""
import struct
import sys

import numpy as np


def read_wav(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'RIFF' and data[8:12] == b'WAVE', 'not a WAV file'
    pos, channels, rate, pcm = 12, None, None, None
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack_from('<I', data, pos + 4)[0]
        if cid == b'fmt ':
            _, channels, rate, _, _, bits = struct.unpack_from('<HHIIHH', data, pos + 8)
            assert bits == 16, '16 bit PCM expected'
        elif cid == b'data':
            pcm = np.frombuffer(data[pos + 8:pos + 8 + size], dtype='<i2')
        pos += 8 + size + (size & 1)
    x = pcm[:len(pcm) // channels * channels].reshape(-1, channels).astype(np.float64) / 32768
    return rate, (np.repeat(x, 2, axis=1) if channels == 1 else x[:, :2])


def blackman_harris(n):
    k = 2 * np.pi * np.arange(n) / n
    return 0.35875 - 0.48829 * np.cos(k) + 0.14128 * np.cos(2 * k) - 0.01168 * np.cos(3 * k)


args = sys.argv[1:]
settle = 0.0
if args[0] == '--settle':
    settle = float(args[1])
    args = args[2:]
path, spec = args[0], args[1]
fs, x = read_wav(path)

expected = []
for part in spec.split(','):
    dur, f = part.split(':')
    fl, fr = f.split('/') if '/' in f else (f, f)
    expected.append((float(dur), float(fl), float(fr)))

# dominant frequency per channel on 80 ms windows, 10 ms hop
hop, win = int(0.010 * fs), int(0.080 * fs)
w = blackman_harris(win)
freqs = np.fft.rfftfreq(win, 1 / fs)
labels = []
for i in range(0, len(x) - win, hop):
    s = x[i:i + win]
    if np.sqrt(np.mean(s ** 2, axis=0)).min() < 10 ** (-50 / 20):
        labels.append(None)
        continue
    mags = np.abs(np.fft.rfft(s * w[:, None], axis=0))
    labels.append(tuple(int(round(freqs[k] / 20) * 20) for k in np.argmax(mags, axis=0)))  # 20 Hz buckets

# run-length segments, ignoring blips shorter than 100 ms at transitions
segs, start = [], 0
for i in range(1, len(labels) + 1):
    if i == len(labels) or labels[i] != labels[start]:
        if labels[start] is not None and (i - start) * hop >= 0.1 * fs:
            segs.append((labels[start], (start * hop + win / 2) / fs, (i * hop + win / 2) / fs))
        start = i

ok = len(segs) == len(expected)
out = [f'{path.split("/")[-1]}: {len(x) / fs:.2f} s, {len(segs)} tone segments (expected {len(expected)})']
if not ok:
    out.append('  found: ' + ', '.join(f'{l[0]}/{l[1]} Hz {a:.2f}-{b:.2f}s' for l, a, b in segs))

n = hop
wn = blackman_harris(n)
ff = np.fft.rfftfreq(n, 1 / fs)


def tone_duration(ch, f, a, b):
    """time the tone is present around segment [a, b]: 10 ms frames holding at least half its power"""
    lo, hi = max(0, int((a - 0.1) * fs)), min(len(x), int((b + 0.1) * fs))
    frames = x[lo:lo + (hi - lo) // n * n, ch].reshape(-1, n)
    band = (np.abs(np.fft.rfft(frames, axis=1)) ** 2)[:, np.abs(ff - f) <= 200].sum(axis=1)
    return np.count_nonzero(band >= np.median(band) / 2) * n / fs


for (dur, fl, fr), (lab, a, b) in zip(expected, segs):
    freq_ok = abs(lab[0] - fl) <= 20 and abs(lab[1] - fr) <= 20
    found = [tone_duration(0, fl, a, b), tone_duration(1, fr, a, b)]
    dur_ok = max(abs(d - dur) for d in found) <= 0.040
    ia, ib = int((max(a, settle) + 0.04) * fs), int((b - 0.04) * fs)
    level_dev, broadband = 0.0, -200.0
    for ch, f in ((0, fl), (1, fr)):
        frames = x[ia:ia + (ib - ia) // n * n, ch].reshape(-1, n)
        rms_db = 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1)) + 1e-12)
        level_dev = max(level_dev, np.max(np.abs(rms_db - np.median(rms_db))))
        power = np.abs(np.fft.rfft(frames * wn, axis=1)) ** 2
        inband = np.abs(ff - f) <= 450  # the window's main lobe is +-4 bins of 100 Hz
        ratio = power[:, ~inband].sum(axis=1) / power[:, inband].sum(axis=1)
        broadband = max(broadband, 10 * np.log10(ratio.max() + 1e-15))
    seg_ok = freq_ok and dur_ok and level_dev <= 1.5 and broadband <= -30
    ok &= seg_ok
    out.append(f'  {a:6.2f}-{b:6.2f}s  {lab[0]:>5}/{lab[1]:<5} Hz (want {fl:.0f}/{fr:.0f})  {found[0]:5.2f}s (want {dur:.2f})  '
               f'level +-{level_dev:4.2f} dB  broadband {broadband:6.1f} dB  {"ok" if seg_ok else "FAIL"}')

print('\n'.join(out))
sys.exit(0 if ok else 1)
