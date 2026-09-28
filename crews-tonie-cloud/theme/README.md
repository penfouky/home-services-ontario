> **Superseded.** The admin UI is now the native **CrewCloud** web app
> (`../teddycloud-fork/web/`), with its own theme, name and icons built in. Don't inject
> `theme.css` / `brand.js` into the new web image: `brand.js` would retitle it "Colada Builds"
> and clash with the new styles. This folder is kept for reference only.

# Colada Builds theme for the TeddyCloud admin UI

This makes the self-hosted TeddyCloud web interface at
`https://tonie.coladabuilds.com:8443` **look like Colada Builds** — the same
pink→purple palette, Fredoka/Nunito fonts, and teddy badge as the login gate and the
Mac app — instead of stock TeddyCloud blue.

It is **cosmetic only.** It recolours and re-labels TeddyCloud's own screens. It does
**not** add the Mac app's features (SD-card editing, the tonie library, imports) to the
server — those live in the "Crew's Tonie Box" desktop app. TeddyCloud is a different
program with its own feature set; this just dresses it in the brand.

## What's in here

```
theme/
├── web/
│   ├── theme.css   antd v6 token overrides + fonts + header/button/menu styling
│   ├── brand.js    renames "TeddyCloud" → "Colada Builds", swaps favicon/title (defensive, idempotent)
│   └── logo.svg    the teddy badge, used as the favicon
├── caddy.Dockerfile   official Caddy + the replace-response plugin (to inject the two tags)
└── README.md          this file
```

## How it's applied (no fork, works with the stock TeddyCloud image)

TeddyCloud's UI is a built React app served from inside the official image, and it has
**no custom-CSS hook**. So instead of modifying TeddyCloud, the **Caddy layer we already
run in front of it** injects one `<link>` and one `<script>` before `</head>` of the
page, and serves the three theme files at `/colada/*`. The browser then loads the theme
over the stock UI.

This is already wired into the bundle:

- **`docker-compose.yml`** — the `caddy` service now builds from `theme/caddy.Dockerfile`
  (official Caddy + the [`replace-response`](https://github.com/caddyserver/replace-response)
  plugin) and mounts `./theme/web` at `/srv/colada`.
- **`Caddyfile`** — on the admin site (`:8443`):
  - `handle /colada/*` serves the theme files (unauthenticated — they hold no secrets);
  - the main handler injects
    `<link rel="stylesheet" href="/colada/theme.css"><script defer src="/colada/brand.js"></script>`
    before `</head>`, and asks TeddyCloud for uncompressed HTML so the rewrite can see it.

The box's own endpoint on **:443 is untouched** — only the human admin UI is themed.

### Deploy (Codex runs this on the VPS)

From `crews-tonie-cloud/` on the VPS, after pulling this branch:

```bash
docker compose build caddy      # compiles Caddy with the plugin (needs internet; ~1–2 min)
docker compose up -d            # or: ./deploy.sh   (it runs `up -d --build`)
```

Nothing else changes — same domain, same password gate, same volumes.

### Verify

1. Open `https://tonie.coladabuilds.com:8443`, sign in.
2. Header bar is the pink→purple gradient; primary buttons, links, switches and the
   selected menu item are purple; body text is Nunito, headings Fredoka.
3. The browser tab reads **Colada Builds** with the teddy badge favicon.
4. Quick check from a shell:
   ```bash
   curl -sk https://tonie.coladabuilds.com:8443/colada/theme.css | head -1   # the CSS
   # (the injected tags only appear on the authenticated HTML, so check in the browser)
   ```
5. If a colour needs nudging, edit `theme/web/theme.css` and
   `docker compose restart caddy` (no rebuild needed — it's a mounted file). Hard-refresh
   the browser (Cmd-Shift-R) to bypass the cached CSS.

## Fallback if you don't want a custom Caddy build

Skip the plugin and bake the tags into a thin TeddyCloud-derived image instead: copy
`web/` into the image, and add the same `<link>`/`<script>` to its `index.html`. Less
tidy (rebuild on every TeddyCloud update), but no Caddy plugin. Ask and I'll write that
Dockerfile.

## The "proper" route, if this ever gets forked

If you fork [`teddycloud_web`](https://github.com/toniebox-reverse-engineering/teddycloud_web)
and build it yourself, do it natively instead of overriding: the app already wraps
everything in an antd `ConfigProvider` (in `src/App.tsx`) with no colour token set. Add
the brand tokens there and rebuild — cleaner than CSS overrides and no `!important`:

```tsx
<ConfigProvider
  theme={{
    algorithm,                    // keep the existing light/dark/matrix switch
    token: {
      colorPrimary: "#8b6df2",
      colorLink: "#8b6df2",
      colorInfo: "#8b6df2",
      borderRadius: 12,
      fontFamily: "'Nunito', ui-rounded, system-ui, sans-serif",
    },
    components: { /* ...the existing Slider/Popover overrides... */ },
  }}
>
```

## Notes

- I built and validated this in the sandbox (CSS/JS/SVG parse; the Caddyfile validates
  with real Caddy), but I **can't reach your VPS**, so I couldn't see it rendered against
  a live TeddyCloud. Expect maybe one small colour tweak once you look at it — step 5
  above is the one-line loop for that.
- Palette: pink `#ff8fab`, purple `#8b6df2`, deep purple `#6f54d6`, gold `#ffd166`,
  ink `#3a2f5b`. Fonts: Fredoka (display) + Nunito (body), from Google Fonts.
