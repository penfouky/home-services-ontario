# TeddyCloud fork — encoder fixes for Crew's Tonie Cloud

Patches to TeddyCloud, to be applied to a fork of `toniebox-reverse-engineering/teddycloud`.
They fix three real defects and add two improvements. All were built and tested here against
upstream commit `78c3b38` (see `patches/BASE_COMMIT.txt`).

The web app, rebuilt as **CrewCloud**, has its own patch series in [`web/`](web/README.md).

## What's fixed

**1. One frame per 4 KB block was starved of quality.** The box reads audio in 4 KB blocks;
TeddyCloud gave the last frame in each block only the leftover space, so the same frame was
squeezed every block. The fix plans each block up front and splits the space evenly. File size and
block count are unchanged.
- Worst-frame quality hit at 96 kbps: **−7.8 dB → −2.0 dB**. At 128/256 kbps it was far worse
  (−21 dB / −35 dB) and is largely eliminated. Measured per-frame against the same libopus encoder
  run without the cap.

**2. Jumping to a chapter replayed the end of the previous one.** Chapter marks pointed into a
block still holding the previous track, so skipping to a chapter played ~180 ms of the one before.
The fix starts every chapter on a fresh block (≤60 ms of silence). Measured jump-to-chapter bleed:
**180 ms → 0 ms**.

**3. Loudness leveling.** Server-side conversion now runs ffmpeg `loudnorm` (EBU R128) so tonies
don't jump between quiet and loud. Inputs from −34 to −10 LUFS all came out at **−16.0 LUFS**.
Setting `encode.normalize` (default on), filter `encode.normalize_filter`.

**4. ffmpeg is run without a shell.** Conversion used to build a shell command string from the file
path (injection risk). It now fork/exec's ffmpeg with an argument vector. Verified: a filename
containing `" ; touch INJECTED ; $(id)` runs safely and creates no injected file.

**5. Uploads over 32 KB could stall forever.** When a request arrived in one burst larger than
the server's 32 KB receive buffer (headers plus the start of the file), the socket layer returned
the whole buffer as the first header "line". The server then waited for headers that had already
gone by, and the upload never answered. Whether it hit depended on timing, so large uploads
through a proxy could hang at random. The fix keeps the line break it found
(`src/platform/platform_linux.c`, same in `platform_windows.c`). Verified: burst uploads of
20 KB–3 MB went from no response to answering in milliseconds; files arrive byte-identical;
paced uploads unchanged.

**Evaluated, not adopted — unconstrained VBR.** Measured at 96 kbps with the even-split fix it was
slightly *worse* (mean seg-SNR 14.24 vs 14.74 dB, same size): the fixed 4 KB-block format makes
aggressive VBR a wash. Left unchanged.

## Files

```
patches/0001-...-server.patch   src/toniefile.c, include/settings.h, src/settings.c
patches/0002-...-wasm.patch      wasm/taf_encoder_minimal.c (the browser encoder)
patches/0003-...-stall.patch     src/platform/platform_{linux,windows}.c (uploads over 32 KB)
patches/BASE_COMMIT.txt          the upstream commit the patches apply onto
wasm-prebuilt/                    taf_encoder.js / .wasm rebuilt from patch 0002 (emscripten)
```

Fixes 1 & 2 are in **both** encoders (the C server encoder and the browser/WASM encoder) so they
apply whichever path is used. Fixes 3 & 4 are in the server's ffmpeg conversion. With the CrewCloud
web app, uploads from the Add audio page are levelled in the browser to the same −16 LUFS target,
so "Even out the volume" covers every path.

## How to build & deploy the fork (for Codex)

The important detail: for these to take effect you must run the fork's **backend** image (the
current deploy uses the stock ghcr backend, so a web-only rebuild would NOT include fixes 1–4). And
for the browser path to carry fixes 1–2, the web image must ship the rebuilt WASM.

1. Fork `toniebox-reverse-engineering/teddycloud`, check out `78c3b38` (or `develop`; the patches
   are small and should rebase cleanly), and apply:
   ```bash
   git apply patches/0001-*.patch patches/0002-*.patch patches/0003-*.patch
   ```
2. Regenerate the browser WASM from the patched source, or use the prebuilt one:
   - `make wasm` (needs the emsdk submodule; the Makefile installs emscripten), **or**
   - copy `wasm-prebuilt/taf_encoder.{js,wasm}` into `teddycloud_web/public/wasm/`.
3. Build the **backend** image from the fork (this carries fixes 1–5) and the **web** image from
   the CrewCloud web patches plus the rebuilt WASM (see [`web/README.md`](web/README.md)). Point
   `compose.private.yml` at your fork's backend image tag (pin it, not `:latest`; see
   `../ops/compose.override.example.yml`).
4. **Settings: keep the defaults.** `encode.normalize=true` and `encode.use_frontend=true`
   (convert in the browser). An earlier version of this note said to set `use_frontend=false`.
   Don't: that sends raw PCM, about 16 times bigger than the finished file, which is slow on
   mobile data. The browser path has fixes 1–2 and now the levelling too. If it was set to
   `false`, the setup guide's "Use recommended settings" button flips it back.

## How it was tested here

- Built the real server binary (`make build`) and the WASM (`make wasm`) from the patched tree.
- WASM even-split output is **byte-identical** to the validated prototype; 0 misaligned blocks;
  decodes clean; size unchanged.
- Server `--encode` (single, multi-chapter, odd-length, TAF-reencode): 0 misaligned blocks, clean
  decode, chapter files exact multiples of 4096, 0 ms chapter bleed.
- Loudness convergence and shell-injection safety verified as above.
- What needs your host: building the images and deploying — that's Codex's job.
