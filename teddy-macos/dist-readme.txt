teddy 1.7.0 for macOS on Apple Silicon (M1/M2/M3/M4)
=====================================================

teddy creates and reads the audio files a Toniebox keeps on its SD card. It is the
command-line tool from https://github.com/toniebox-reverse-engineering/teddy (v1.7.0),
rebuilt to run natively on Apple Silicon. Needs macOS 12 or newer, nothing else.

First run
---------
macOS blocks downloaded programs that are not notarized by Apple. In Terminal, in the
folder with this file:

    xattr -d com.apple.quarantine teddy
    ./teddy --help

Optional, to type just "teddy" anywhere:  sudo mv teddy /usr/local/bin/

Everyday use
------------
Make a tonie file from a folder of MP3/Ogg files (ordered by their track number tag,
else by file name):

    teddy -m encode -o ~/Desktop/500304E0 ~/Music/MyStory

Back up or listen to a tonie file (writes one .ogg file per chapter):

    teddy -m decode -o ~/Desktop /Volumes/SDCARD/CONTENT/F218E91E/500304E0

Show header details (audio id, chapters, checksum):

    teddy -m info /Volumes/SDCARD/CONTENT/F218E91E/500304E0

SD card layout
--------------
Each tag has one file, CONTENT/<UID bytes 8..5>/<UID bytes 4..1>, for example
tag UID E0:04:03:50:1E:E9:18:F2  ->  CONTENT/F218E91E/500304E0

Encoding straight onto the card overwrites what is there, so back up first:

    mkdir -p /Volumes/SDCARD/CONTENT/F218E91E
    teddy -m encode -o /Volumes/SDCARD/CONTENT/F218E91E/500304E0 ~/Music/MyStory

(replace SDCARD with your card's name, see: ls /Volumes)

Keep the default 96 kbps. At 48 kbps (TeddyBench's default) teddy squeezes the last
audio frame of every 4 KiB block, which can cause a short glitch about every 0.7 s.

Licenses and disclaimer: teddy --license
