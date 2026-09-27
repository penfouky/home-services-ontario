# Crew's Tonie Cloud

Run your **own** tonies cloud on a VPS, so your Toniebox streams the stories *you* put
there instead of the official cloud — and reach the admin behind a **branded password
screen**. It wraps [TeddyCloud](https://github.com/toniebox-reverse-engineering/teddycloud),
the community's self-hosted tonies server, in a ready-to-run Docker stack with HTTPS and a
login gate.

This is the **network** half of the project. The Mac app in [`../crews-tonie-box`](../crews-tonie-box)
prepares the audio (it writes valid `.taf` tonie files); this serves it to the box over the
internet and lets you assign any tag to any content from a web UI — no SD-card juggling.

---

## Read this first — who runs what

I (Claude) built this bundle, but I can't reach your VPS from where I run, and you should
never paste server credentials into a chat. So **you** run it: clone this folder onto the
VPS and run one script. It comes up in a couple of minutes.

The only step nobody can do for you remotely is the **one-time hardware step on the box**
(reading its certificate and pointing it at your server), because that needs a physical
connection to the box. It's written out below for your exact box.

> **Only put audio on tonies that you're allowed to use** — your own recordings, your own
> music, public-domain stories. This self-hosts *your* content; it is not for copying or
> redistributing the official tonies audio.

---

## Your box

From the base of your box — Model **10003**, "Made in China", MAC starting **`F0:F5:BD`** —
this is the newest **ESP32 (v4)** generation (that MAC range belongs to Espressif, the ESP32
maker). Good news: the ESP32 is the **simplest** box for TeddyCloud and needs **no
desoldering** — its certificate is read over a serial connection, and you can flash it to
point straight at your server. (If you ever get a different box, the CC3200/CC3235 models
need chip-level work; see the wiki links at the end.)

---

## How it fits together

```
                 internet
   Toniebox ───────────────►  VPS :443    →  teddycloud     (mutual TLS, the box's cert)
   You (browser) ──────────►  VPS :8443   →  caddy → gate → teddycloud web UI  (password)
                              VPS :80      →  caddy          (Let's Encrypt + redirect)
```

- **:443** is the box's endpoint. TeddyCloud must own it directly — it speaks mutual TLS
  with the box, so it can't sit behind a proxy or a password.
- **:8443** is *your* door: a real HTTPS certificate, the branded login screen, then the
  full TeddyCloud admin UI. TeddyCloud's own web UI is never published to the internet —
  only Caddy reaches it, over the private Docker network.

Files here: `docker-compose.yml` (the three services), `Caddyfile` (HTTPS + the gate),
`gate/` (the branded login service, in Go, ~200 lines, no dependencies), `.env.example`
(your settings), `deploy.sh` (bring-up).

---

## 1. What you need

- A VPS with a public IP, Docker, and the Docker Compose plugin
  ([install docs](https://docs.docker.com/engine/install/)).
- A domain or subdomain you control — your "colada builds" URL. Point its **A record**
  (and **AAAA** if you have IPv6) at the VPS. This project uses `tonie.coladabuilds.com`.
- Ports **80, 443, 8443** open to the internet on the VPS firewall; keep everything else
  closed.

## 2. Bring it up

```sh
# on the VPS
git clone https://github.com/penfouky/home-services-ontario.git
cd home-services-ontario/crews-tonie-cloud

./deploy.sh                     # first run writes .env and a random cookie secret
nano .env                       # set TC_DOMAIN, ACME_EMAIL, GATE_PASSWORD
./deploy.sh                     # second run builds + starts everything
```

Give Caddy a minute on first start to fetch the Let's Encrypt certificate (it needs the
DNS record and port 80 already reachable). Then open **`https://<TC_DOMAIN>:8443`** — you
should get the branded **Colada Builds** login screen, and your password lets you into
TeddyCloud.

Change the wording any time with `GATE_BRAND` / `GATE_TAGLINE` in `.env`, then
`docker compose up -d`.

## 3. Point your box at it (the one-time hardware step)

The box needs two things: to **trust your server's certificate**, and to **know your
hostname**. For the ESP32 that's done by reading the box over serial and flashing a patched
firmware back. Do this on a **local computer** where you can physically connect the box —
not on the VPS — then copy the box's certificate up to the VPS.

1. **Get your server's CA.** In the admin UI (or from the `certs` volume) grab
   `certs/server/ca.der` — this is what the box must trust.
2. **Open the box and connect the ESP32** to a USB-to-serial (3.3 V) adapter (TX/RX/GND,
   and IO0 to enter flashing). The wiki has the pinout and photos.
3. **Read, patch and flash** using TeddyCloud's built-in **"ESP32 box flashing"** tool
   (run a TeddyCloud instance locally for this, or use the same one via the serial device):
   it backs up the box ("Read ESP32"), injects your `ca.der`, sets your hostname
   (`<TC_DOMAIN>`), and writes it back.
4. **Extract the box's client certificate** from the backup and place it on the VPS so
   TeddyCloud recognises your box:
   ```sh
   teddycloud --esp32-extract data/firmware/ESP32_<mac>.bin --destination certs/client/<mac>
   ```
5. Put the box back together. Next time it wakes on Wi-Fi it connects to
   `https://<TC_DOMAIN>:443` — your cloud. The admin UI shows it under **Boxes**.

Follow the current, step-by-step wiki for your firmware version (screens change): the
**ESP32 dump-certs** and **flash-CA** pages are linked at the end. Nothing here touches the
official cloud servers.

## 4. Use it (all the features)

Once the box is talking to your server, from the admin UI you can:

- **Upload your own audio** — drop in `.taf` files made by the Mac app (or let TeddyCloud
  encode ordinary audio), and organise them in the **Library**.
- **Assign any content to any tag** — this is the thing the SD-card app can't do: because
  *your* server answers "what does this tag play?", you map a figurine's tag to any story
  and change it whenever you like, no re-writing the card.
- **Live download / streaming** to the box, **content overriding**, per-tag settings, and
  the box settings TeddyCloud exposes (volume limits, LED, etc.).
- **Custom cover art** via the `custom_img` volume.

## 5. Keep it safe

- Only 80/443/8443 should be open. Everything else stays firewalled.
- Also turn on **TeddyCloud's own web-UI authentication** (Settings → the auth options) as
  a second lock behind the branded gate — the box's `:443` endpoint is internet-facing.
- Use a long `GATE_PASSWORD`. The login cookie is signed with `GATE_SECRET`
  (`openssl rand -hex 32`); keep it out of version control (`.env` is git-ignored).
- Back up the `certs`, `config`, `content` and `library` Docker volumes.

## Optional: one clean URL on 443

By default the admin UI is on `:8443` because the box owns `:443`. If you'd rather have
both on plain `443` under two subdomains (e.g. `box.` for the box and the bare domain for
the admin), put an SNI-splitting TCP proxy in front (nginx `stream` with `ssl_preread`, or
Caddy's `layer4`) that passes the box hostname through to TeddyCloud untouched and hands the
admin hostname to Caddy. The `:8443` setup here is the simpler, sturdier default.

## Sources

- [TeddyCloud](https://github.com/toniebox-reverse-engineering/teddycloud) and its
  [docker-compose](https://github.com/toniebox-reverse-engineering/teddycloud/blob/master/docker/docker-compose.yaml)
- Setup, ports and box connection: [Toniebox Hacking wiki — TeddyCloud setup](https://tonies-wiki.revvox.de/docs/tools/teddycloud/setup/)
- ESP32 certificate dump & CA flashing: [dump-certs/esp32](https://tonies-wiki.revvox.de/docs/tools/teddycloud/setup/dump-certs/esp32/),
  [flash-ca/esp32](https://tonies-wiki.revvox.de/docs/tools/teddycloud/setup/flash-ca/esp32/)
- Public-server + Let's Encrypt notes: [mlohr.com](https://mlohr.com/blog/2025/01/teddycloud-on-a-public-server-ip-with-letsencrypt/)
