teddy 1.7.0, Crew's Tonie Box edition, for macOS on Apple Silicon (M1 and newer)
===============================================================================

teddy creates and reads the audio files a Toniebox keeps on its SD card. It is the
command-line tool from https://github.com/toniebox-reverse-engineering/teddy (v1.7.0) with
the audio engine of Crew's Tonie Box: libopus 1.6.1, no more glitches at 48 kbps, exact
chapter marks, and many more input formats. Needs macOS 12 or newer, nothing else.
Keep libtonieopus.dylib next to teddy.

First run
---------
macOS blocks downloaded programs that are not notarized by Apple. In Terminal, in the
folder with this file:

    xattr -d com.apple.quarantine teddy libtonieopus.dylib
    ./teddy --help

Everyday use
------------
Make a tonie file from a folder of sound files (ordered by their track number tag, else
by file name). MP3, M4A/AAC, Apple Lossless, WAV, AIFF, FLAC, CAF, Ogg Vorbis and Opus work:

    ./teddy -m encode -o ~/Desktop/500304E0 ~/Music/MyStory

Save a tonie's chapters as .ogg files (play them with VLC or IINA), or all in one file with -s:

    ./teddy -m decode -o ~/Desktop /Volumes/SDCARD/CONTENT/F218E91E/500304E0

Show header details (audio id, chapters and their lengths, checksum):

    ./teddy -m info /Volumes/SDCARD/CONTENT/F218E91E/500304E0

Options: -b <kbps> bit rate (default 96, 24 to 192), --vbr, -i <audio id>, -p <folder of
prefix files>. Add "-j none" to skip downloading the old tonies list.

SD card layout
--------------
Each tag has one file, CONTENT/<UID bytes 8..5>/<UID bytes 4..1>, for example
tag UID E0:04:03:50:1E:E9:18:F2  ->  CONTENT/F218E91E/500304E0

Encoding straight onto the card replaces what is there, so back that file up first:

    mkdir -p /Volumes/SDCARD/CONTENT/F218E91E
    ./teddy -m encode -o /Volumes/SDCARD/CONTENT/F218E91E/500304E0 ~/Music/MyStory

(replace SDCARD with your card's name, see: ls /Volumes)

Crew's Tonie Box, the app, does all of this with a few clicks and keeps copies for you.

Licenses: Licenses.txt, and ./teddy --license
