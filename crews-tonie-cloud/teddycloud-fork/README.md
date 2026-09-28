# TeddyCloud fork — encoder fixes for Crew's Tonie Cloud

Patches to the TeddyCloud audio encoder, to be applied to a fork of
`toniebox-reverse-engineering/teddycloud`. They fix two real defects and add three improvements.
All were built and tested here against upstream commit `78c3b38` (see `patches/BASE_COMMIT.txt`).

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

**Evaluated, not adopted — unconstrained VBR.** Measured at 96 kbps with the even-split fix it was
slightly *worse* (mean seg-SNR 14.24 vs 14.74 dB, same size): the fixed 4 KB-block format makes
aggressive VBR a wash. Left unchanged.

## Files

```
patches/0001-...-server.patch   src/toniefile.c, include/settings.h, src/settings.c
patches/0002-...-wasm.patch      wasm/taf_encoder_minimal.c (the browser encoder)
patches/BASE_COMMIT.txt          the upstream commit the patches apply onto
wasm-prebuilt/                    taf_encoder.js / .wasm rebuilt from patch 0002 (emscripten)
```

Fixes 1 & 2 are in **both** encoders (the C server encoder and the browser/WASM encoder) so they
apply whichever path is used. Fixes 3 & 4 are server-side (the browser path decodes in the browser,
not through ffmpeg).

## How to build & deploy the fork (for Codex)

The important detail: for these to take effect you must run the fork's **backend** image (the
current deploy uses the stock ghcr backend, so a web-only rebuild would NOT include fixes 1–4). And
for the browser path to carry fixes 1–2, the web image must ship the rebuilt WASM.

1. Fork `toniebox-reverse-engineering/teddycloud`, check out `78c3b38` (or `develop`; the patches
   are small and should rebase cleanly), and apply:
   ```bash
   git apply patches/0001-*.patch patches/0002-*.patch
   ```
2. Regenerate the browser WASM from the patched source, or use the prebuilt one:
   - `make wasm` (needs the emsdk submodule; the Makefile installs emscripten), **or**
   - copy `wasm-prebuilt/taf_encoder.{js,wasm}` into `teddycloud_web/public/wasm/`.
3. Build the **backend** image from the fork (this carries fixes 1–4) and the **web** image (theme +
   rebuilt WASM). Point `compose.private.yml` at your fork's backend image tag (pin it, not
   `:latest` — see `../ops/compose.override.example.yml`).
4. **Recommended:** set `encode.normalize=true` (default) and `encode.use_frontend=false` so uploads
   go through the server encoder, which has all four fixes plus loudness. (With browser encoding the
   two structural fixes still apply, but loudness does not.)

## How it was tested here

- Built the real server binary (`make build`) and the WASM (`make wasm`) from the patched tree.
- WASM even-split output is **byte-identical** to the validated prototype; 0 misaligned blocks;
  decodes clean; size unchanged.
- Server `--encode` (single, multi-chapter, odd-length, TAF-reencode): 0 misaligned blocks, clean
  decode, chapter files exact multiples of 4096, 0 ms chapter bleed.
- Loudness convergence and shell-injection safety verified as above.
- What needs your host: building the images and deploying — that's Codex's job.
