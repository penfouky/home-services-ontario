# Teddy for Apple Silicon Macs

[Teddy](https://github.com/toniebox-reverse-engineering/teddy) reads and creates the audio
files a Toniebox keeps on its SD card. Its releases are Windows-only: TeddyBench and the
`Teddy.exe` command-line tool target .NET Framework 4.8. This folder rebuilds the
command-line tool from the v1.7.0 sources as a native Apple Silicon (M1–M4) program.

- **Download:** `teddy-1.7.0-macos-arm64.zip`, the artifact of the same name on the
  [workflow runs](https://github.com/penfouky/home-services-ontario/actions/workflows/teddy-macos.yml),
  or build it yourself (below).
- **Requires** macOS 12 or newer. It's self-contained, so there's nothing else to install.

## First run

The binary is ad-hoc signed but not notarized by Apple, so macOS quarantines it after download.
Clear that once, then run it:

```sh
cd ~/Downloads/teddy-1.7.0-macos-arm64
xattr -d com.apple.quarantine teddy
./teddy --help
sudo mv teddy /usr/local/bin/   # optional: makes `teddy` available everywhere
```

## Using it

```sh
# tonie file from a folder of MP3/Ogg files (ordered by ID3 track number, else file name)
teddy -m encode -o ~/Desktop/500304E0 ~/Music/MyStory

# back up or listen to a tonie: one .ogg file per chapter (play with VLC or IINA)
teddy -m decode -o ~/Desktop /Volumes/SDCARD/CONTENT/F218E91E/500304E0

# header details: audio id, chapters, checksum
teddy -m info /Volumes/SDCARD/CONTENT/F218E91E/500304E0
```

Each tag has one file on the SD card, `CONTENT/<UID bytes 8..5>/<UID bytes 4..1>`. Tag UID
`E0:04:03:50:1E:E9:18:F2` is `CONTENT/F218E91E/500304E0`, the same mapping TeddyBench uses.
Encoding straight to the card replaces what's there, so back that file up first:

```sh
mkdir -p /Volumes/SDCARD/CONTENT/F218E91E
teddy -m encode -o /Volumes/SDCARD/CONTENT/F218E91E/500304E0 ~/Music/MyStory
```

Keep the default 96 kbps. At 48 kbps, TeddyBench's default, teddy squeezes the last audio
frame of every 4 KiB block to make it fit. That causes a short glitch about every 0.7 s. This
comes from upstream code, and the macOS changes don't affect it (see *Verification*).

## What about TeddyBench, the GUI?

TeddyBench is a Windows Forms application. Windows Forms doesn't exist on macOS, so it can't
simply be recompiled. It would need a new user interface. Its audio work (creating, dumping
and inspecting tonie files) lives in the same library this command-line tool uses. The
command-line tool doesn't have TeddyBench's RFID reader features (Proxmark3, PN5180). For
those, run the original TeddyBench in a Windows 11 virtual machine (Parallels, VMware
Fusion, UTM).

## What the patch changes

[`patches/teddy-v1.7.0-macos.patch`](patches/teddy-v1.7.0-macos.patch) applies to upstream
tag `v1.7.0` (`ca062fe`). On Windows the audio path is unchanged: it still uses the ACM MP3
codec and Media Foundation.

| Change | Why |
|---|---|
| `Teddy.csproj` also targets .NET 10. The WinForms settings are kept for `net48` only | .NET Framework only runs on Windows |
| MP3 decoding with [NLayer](https://github.com/naudio/NLayer), fully managed code | NAudio's `Mp3FileReader` needs the Windows ACM codec |
| Resampling to 48 kHz with the Speex resampler that ships in Concentus (quality 5) | `MediaFoundationResampler` is Windows-only |
| Reference `NAudio.Core`/`WinMM`/`Wasapi` instead of the `NAudio` package | The meta package pulls in `NAudio.WinForms`, which blocks macOS builds |
| `Trim` → `TrimEnd` on input paths | Trimming the leading `/` turned every absolute path into a relative one |
| Skip `._*` files | macOS leaves these AppleDouble files on FAT/exFAT drives, and they broke folder encodes |
| Pass the sample rate, not the bit rate, to the Opus decoder for `.ogg` input | Upstream bug: `.ogg` input failed at the command line's default 96 kbps |
| Help text says `teddy`, `--license` lists NLayer (MIT) | |

## Verification

- **Resampler:** output is bit-identical for any read size, has the exact expected length and
  zero delay, measures about 78 dB SNR against sox's very-high-quality resampler, and is flat
  to 18 kHz.
- **End to end** ([`tests/e2e.sh`](tests/e2e.sh)): the test encodes generated MP3s (22.05 to
  48 kHz, mono and stereo, CBR and VBR, album art, deliberately unsorted file names, an
  AppleDouble decoy), an Ogg Opus file and prefix files. It validates the result with
  libopus's `opusinfo`, decodes it with `opusdec`, and checks each tone's frequency per
  channel, its length to 10 ms, its level and any broadband clicks. It also checks the
  header, checksum, chapters and `decode` output.
- **On Apple Silicon:** the [workflow](../.github/workflows/teddy-macos.yml) builds natively
  on a GitHub macOS runner and runs the tests there against that build and against the zip
  cross-built on Linux.
- The 48 kbps glitch shows up the same way when encoding a 48 kHz Ogg file, which skips all
  the new decoding and resampling code.

## Build it yourself

```sh
brew install --cask dotnet-sdk     # .NET 10 SDK
./build.sh                         # -> dist/teddy-1.7.0-macos-arm64.zip
./build.sh osx-x64                 # Intel Macs; any .NET runtime identifier works

brew install sox lame opus-tools && pip3 install numpy   # test tools
tests/e2e.sh build/publish-osx-arm64/teddy
```

`build.sh` clones upstream `v1.7.0`, checks that it is still commit `ca062fe`, applies the
patch and publishes a self-contained single-file binary. The .NET SDK ad-hoc signs it,
including when you build on Linux. Apple Silicon only runs signed code.

Teddy is © g3gg0.de and the Teddy contributors. Run `teddy --license` for its licenses and
disclaimer.
