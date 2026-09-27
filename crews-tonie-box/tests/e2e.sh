#!/usr/bin/env bash
# End-to-end test of a teddy binary: makes test audio, encodes it into tonie files and checks
# the results with independent tools (libopus' opusinfo/opusdec, validate_tonie.py) and a
# signal analysis.
#
#   tests/e2e.sh path/to/teddy
#
# Needs sox, lame, opus-tools and python3 with numpy. FLAC/M4A input is tested when ffmpeg is
# installed or on a Mac.
set -euo pipefail

teddy=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
tests=$(cd "$(dirname "$0")" && pwd)
analyze="python3 $tests/analyze_stream.py"
validate="python3 $tests/validate_tonie.py --ours"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"

failed=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; failed=$((failed + 1)); }
teddy() { "$teddy" -j none "$@"; }  # -j none: no tonies.json download

# tone <out.wav> <seconds> <rate> <freqL> [freqR]; without freqR the file is mono
# (sox -R: repeatable, no random dither, so every run tests the same audio)
tone() {
    if [ $# -eq 4 ]; then
        sox -R -n -r "$3" -b 16 -c 1 "$1" synth "$2" sine "$4" vol 0.5
    else
        sox -R -n -r "$3" -b 16 -c 1 l.wav synth "$2" sine "$4" vol 0.5
        sox -R -n -r "$3" -b 16 -c 1 r.wav synth "$2" sine "$5" vol 0.5
        sox -R -M l.wav r.wav "$1" && rm l.wav r.wav
    fi
}

# check_stream <file.taf> <expected tones> <description> [analyzer options]: check the tonie
# layout, validate the Ogg stream, decode it with libopus and analyze the audio
check_stream() {
    if ! $validate "$1"; then
        fail "$3: the tonie file breaks the Toniebox layout"
        return
    fi
    tail -c +4097 "$1" > "$1.ogg"
    if opusinfo "$1.ogg" 2>&1 | grep -iE 'warning|error'; then
        fail "$3: opusinfo reports problems"
        return
    fi
    opusdec --quiet --rate 48000 "$1.ogg" "$1.wav"
    if $analyze "${@:4}" "$1.wav" "$2"; then pass "$3"; else fail "$3"; fi
}

echo "== Test audio"
python3 - <<'EOF'
import struct, zlib  # 64x64 PNG as album art
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
raw = b''.join(b'\0' + b'\xff\x80\x00' * 64 for _ in range(64))
open('cover.png', 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0))
                              + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
EOF
mkdir album prefix
# file names deliberately not in track order: teddy must sort by the ID3 track number
tone t.wav 8 44100 440 1000 && lame --quiet -b 192 --tt "One" --tn 1 --ti cover.png t.wav "album/b first.mp3"
tone t.wav 5 22050 2000 && lame --quiet -m m -b 64 --tt "Two" --tn 2 t.wav "album/a second.mp3"
tone t.wav 6 48000 700 700 && lame --quiet -b 256 --tt "Three" --tn 3 t.wav "album/c third.mp3"
tone t.wav 4 32000 3000 3000 && lame --quiet -V 2 --tt "Four" --tn 4 t.wav "album/d fourth.mp3"
head -c 4096 /dev/urandom > "album/._b first.mp3"  # AppleDouble junk as macOS leaves on FAT drives
tone t.wav 5 48000 880 880 && opusenc --quiet --bitrate 128 t.wav extra.ogg
i=1
for f in 1600 3500 1300 1800; do  # prefix tones, neighbouring tones are >= 400 Hz apart
    tone t.wav 0.5 44100 $f && lame --quiet -b 128 t.wav prefix/000$i.mp3 && i=$((i + 1))
done
rm t.wav

echo "== Version"
if teddy --help | grep -q "(build 1.7.0-crews+ca062fe)"; then pass "version label"; else fail "version label: $(teddy --help | grep build)"; fi

echo "== Encode a folder (absolute path with trailing slash, 22.05-48 kHz, mono/stereo, CBR/VBR, album art)"
if teddy -m encode -i 0x12340001 -o "$work/A.taf" "$work/album/"; then
    check_stream A.taf "8:440/1000,5:2000,6:700,4:3000" "folder encode: order, pitch, channels, duration, no glitches"
else
    fail "folder encode"
fi

echo "== Encode single files including Ogg Opus at the default bit rate"
if teddy -m encode -i 0x12340002 -o B.taf "album/a second.mp3" extra.ogg; then
    check_stream B.taf "5:2000,5:880" "mp3 + ogg encode"
else
    fail "mp3 + ogg encode"
fi

echo "== 48 kbps (TeddyBench's default), CBR: upstream glitched at every 4 KiB page (every 0.68 s)"
# libopus itself needs about 0.4 s to settle on the unusual 440/1000 Hz stereo tone at this rate
if teddy -m encode -b 48 -i 0x12340005 -o G.taf album; then
    check_stream G.taf "8:440/1000,5:2000,6:700,4:3000" "48 kbps without page glitches" --settle 0.5
else
    fail "48 kbps encode"
fi

echo "== VBR and a high bit rate"
if teddy -m encode --vbr -b 160 -i 0x12340006 -o V.taf album; then
    check_stream V.taf "8:440/1000,5:2000,6:700,4:3000" "VBR 160 kbps"
else
    fail "VBR encode"
fi

echo "== WAV input, and FLAC/M4A when a converter is there"
tone wav1.wav 3 44100 1500 1500 && tone wav2.wav 3 48000 2500 2500
inputs=(wav1.wav) spec="3:1500"
if [ "$(uname -s)" = Darwin ]; then
    afconvert -f m4af -d aac -b 128000 wav2.wav m4a2.m4a && inputs+=(m4a2.m4a) spec="$spec,3:2500"
elif command -v ffmpeg >/dev/null; then
    ffmpeg -loglevel error -i wav2.wav flac2.flac && inputs+=(flac2.flac) spec="$spec,3:2500"
fi
if teddy -m encode -i 0x12340007 -o W.taf "${inputs[@]}"; then
    check_stream W.taf "$spec" "${inputs[*]} encode"
else
    fail "${inputs[*]} encode"
fi

echo "== Encode with prefix files"
if teddy -m encode -i 0x12340003 -p "$work/prefix" -o C.taf album; then
    check_stream C.taf "0.5:1600,8:440/1000,0.5:3500,5:2000,0.5:1300,6:700,0.5:1800,4:3000" "prefix encode"
else
    fail "prefix encode"
fi

if [ "$(uname -s)" = Darwin ]; then
    echo "== Upper-case .MP3 extension (file names are case-insensitive on macOS)"
    mkdir upper
    tone t.wav 2 44100 1200 1200 && lame --quiet --tn 1 t.wav upper/ONE.MP3
    tone t.wav 2 44100 2400 2400 && lame --quiet --tn 2 t.wav upper/two.mp3 && rm t.wav
    if teddy -m encode -i 0x12340004 -o U.taf upper; then
        check_stream U.taf "2:1200,2:2400" "upper-case extension"
    else
        fail "upper-case extension"
    fi
fi

echo "== Info"
info=$(teddy -m info A.taf)
echo "$info" | grep -E 'Header|Track #'
if echo "$info" | grep -q 'Length .*\[OK\]' && echo "$info" | grep -q 'AudioLen .*\[OK\]' &&
    echo "$info" | grep -q 'Checksum .*\[OK\]' && [ "$(echo "$info" | grep -c 'Track #')" = 4 ]; then
    pass "info: header, length and checksum OK, 4 chapters"
else
    fail "info"
fi

echo "== Decode"
mkdir dec
teddy -m decode -o dec A.taf > /dev/null
teddy -m decode -s -o dec A.taf > /dev/null
ls dec
chapters=(dec/*"Track #0"[1-4].ogg)
if [ ${#chapters[@]} = 4 ] && [ -s dec/A.taf-12340001.ogg ]; then
    pass "decode: 4 chapter files and a single file"
else
    fail "decode"
fi

# every chapter file on its own: accepted by libopus' tools and holding exactly its own tone,
# so the chapter marks sit where the tracks meet
expected=("8:440/1000" "5:2000" "6:700" "4:3000")
for i in 0 1 2 3; do
    file=${chapters[$i]:-missing}
    if [ -f "$file" ] && ! opusinfo "$file" 2>&1 | grep -iqE 'warning|error' &&
        opusdec --quiet --rate 48000 "$file" "chapter$i.wav" 2>/dev/null && $analyze "chapter$i.wav" "${expected[$i]}"; then
        pass "chapter $((i + 1)) decodes on its own and holds only its track"
    else
        fail "chapter $((i + 1)) on its own"
    fi
done

echo "== Speed"
sox -R -n -r 44100 -b 16 -c 2 long.wav synth 300 pinknoise vol 0.3 && lame --quiet -b 192 long.wav long.mp3 && rm long.wav
TIMEFORMAT=%R
secs=$({ time teddy -m encode -o long.taf long.mp3 > /dev/null; } 2>&1)
echo "encoded 300 s of audio in ${secs} s ($(python3 -c "print(round(300 / $secs))")x realtime)"

echo
if [ "$failed" = 0 ]; then echo "ALL TESTS PASSED"; else echo "$failed TEST(S) FAILED"; exit 1; fi
