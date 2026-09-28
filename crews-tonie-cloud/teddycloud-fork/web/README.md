# CrewCloud web app (teddycloud_web patches)

The admin web app, rebuilt as **CrewCloud**: mobile-first, task-first, and renamed. Three
patches against `toniebox-reverse-engineering/teddycloud_web` at `e2f40c2`
(`patches/BASE_COMMIT.txt`). They replace the old Colada CSS/JS overlay in `../../theme/`,
which must no longer be injected (see "Deploy" below).

```
patches/0001-CrewCloud-mobile-first-look-navigation-home-and-setu.patch
patches/0002-Add-audio-even-out-the-volume-simpler-form-give-it-t.patch
patches/0003-Rename-TeddyCloud-to-CrewCloud-in-the-UI-new-app-ico.patch
crewcloud-rebrand.py   regenerates the renamed translations (re-run after upstream updates)
```

## What changed for the person using it

**Phones first.** 16 px text (no zoom-on-focus), 44 px+ touch targets, a bottom tab bar
(Home, Tonies, **Add audio**, Boxes, More), a compact section bar with a "Pages" sheet instead
of nested drawers, toasts above the tab bar, safe areas for the notch and home indicator, and
an app icon and name when added to the home screen. Desktop keeps a top menu plus an
"Add audio" button. Light and dark themes in the CrewCloud pink-purple.

**Home is a to-do list, not a manual.** Setup progress, one big "Add audio to a tonie"
button, tiles for tonies, library, boxes and the player, then your tonies and boxes.

**Guided setup (`/setup`).** Five steps checked against the real server: server running, box
connected, a tonie seen, audio in the library, a tonie playing your audio. The "let a new box
register" switch sits in the box step. Recommended settings (even out the volume, convert in
the browser) with a one-tap "Use recommended settings".

**Add audio in three taps.** Pick files, check the name, tap *Add to library*, then pick the
tonie that should play it. That sets the tonie's source, blocks the cloud for it and turns off
live mode, in one tap. Jargon is gone (".taf", "encoder", "server-side encoding" moved under
*More options*).

**Even out the volume, for every upload.** Loudness levelling now runs in the browser
(ITU-R BS.1770 / EBU R128 to −16 LUFS, the same target as the server's ffmpeg `loudnorm`,
with a look-ahead peak limiter at −1.5 dBFS and at most +18 dB of boost). Before, the
`encode.normalize` setting only affected server-side conversion of files already in the
library, not the Add audio page. It follows `encode.normalize`, and can be switched per upload.

**Renamed.** "TeddyCloud" becomes "CrewCloud" in en/de/fr/es, except where the text is about
the upstream project (community, wiki, forum, contributors, sponsoring, releases, support
requests). TeddyCloud is GPL-2.0 and credited in the More sheet and footer.

## How it was verified

- `tsc --noEmit`, Prettier and `npm run build` pass. The series applies with `git am` on a
  pristine `e2f40c2`, and that tree type-checks.
- Driven in Chromium at phone (390×844) and desktop sizes, light and dark, against a real
  backend: no horizontal overflow, no page errors.
- Add audio end to end on a phone viewport, both conversion paths:
  −30.4 LUFS → **−16.0**, −15.6 LUFS → **−16.0**; a −43.5 LUFS file gets the +18 dB cap.
  The tonie ends up with `source=lib://<name>.taf`, `nocloud=true`, `live=false`.
- Loudness meter matches ffmpeg `ebur128` within 0.05 LU. K-weighting coefficients match the
  BS.1770 48 kHz table. The limiter never exceeds the ceiling, including a spike at sample 0.
  10 minutes of stereo audio levels in ~2–3 s.

## Deploy (for Codex)

1. Check out `teddycloud_web` at `e2f40c2` (or the web version your backend release pins) and
   apply the three patches: `git am crews-tonie-cloud/teddycloud-fork/web/patches/*.patch`.
   `0003` contains binary icons, so use `git am`/`git apply`, not `patch`.
2. Copy the fixed encoder WASM over the stock one:
   `cp ../wasm-prebuilt/taf_encoder.{js,wasm} public/wasm/`.
3. `npm ci && npm run build`, then build the web image from that.
4. **Remove the Colada overlay:** don't inject `theme/web/theme.css` / `brand.js` into this
   image, and drop any `/colada/*` handling. `brand.js` would retitle the page "Colada Builds"
   and fight the new styles.
5. Build the backend from the fork with `../patches/0001`–`0003` (0003 fixes uploads larger
   than 32 KB stalling; see `../README.md`).
6. No settings are required. Defaults are right: `encode.normalize=true`,
   `encode.use_frontend=true`.

After deploying, open the site once on a phone and pull to refresh. The page reloads itself
when the web version changes.

## Re-running the rename after an upstream update

```bash
python3 crewcloud-rebrand.py <teddycloud_web>/public/translations
```

It's idempotent and keeps the files' formatting. It prints how many values were renamed and
how many upstream references were deliberately kept.
