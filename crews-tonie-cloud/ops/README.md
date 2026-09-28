# Crew's Tonie Cloud — operations (backups, rate-limiting, monitoring)

Three hardening additions for the live deployment. They're written to fit the current setup
(`/opt/crews-tonie-cloud`, Apache → Unix socket → Caddy → gate → TeddyCloud) and to be
discovered from the running containers, so they don't depend on exact volume names.

Put this `ops/` folder on the VPS (e.g. `/opt/crews-tonie-cloud/ops`), then
`cp .env.example .env` and fill it in. `.env`, the passphrase file, and state files are
git-ignored.

## 1. Encrypted off-server backups  (the important one)

`ctc-backup.sh` tars TeddyCloud's certs, config, firmware, library and content straight out of the
running container's volumes, encrypts the archive (AES-256, PBKDF2) with your passphrase, verifies
it round-trips, copies it off-server, and prunes old copies. `ctc-restore.sh` brings one back.

**Why to do this before anything else:** the `certs` volume holds the CA flashed into your box.
Lose it and you must open the box and re-flash. TeddyCloud has no backup of its own.

Setup:
```bash
cd /opt/crews-tonie-cloud/ops
cp .env.example .env                 # set BACKUP_DIR and/or RCLONE_REMOTE
head -c 32 /dev/urandom | base64 > backup.passphrase && chmod 600 backup.passphrase
#   ^ also copy this passphrase into a password manager — without it a backup CANNOT be restored
./ctc-backup.sh --check              # verify config + container
./ctc-backup.sh                      # first backup
./ctc-restore.sh --inspect teddycloud-<stamp>.tar.gz.enc   # confirm it lists real files
```
Off-server destination: either a `BACKUP_DIR` on separate storage, or an `RCLONE_REMOTE`
(`rclone config` to set up Google Drive etc., then `RCLONE_REMOTE=gdrive:tonie-backups`). Set one
or both.

Automate with the systemd units (daily):
```bash
sudo cp systemd/ctc-backup.* /etc/systemd/system/
sudo systemctl enable --now ctc-backup.timer
```

Restore (overwrites live data, asks you to type RESTORE, stops the container first):
```bash
./ctc-restore.sh --list
./ctc-restore.sh teddycloud-<stamp>.tar.gz.enc
```

## 2. Login rate-limiting  (in the gate)

The gate (`../gate/`) now throttles password guessing: after a burst of failures it locks *all*
login attempts for a growing back-off (30 s, then doubling) and logs each failure with the client
IP. It's a global limit on purpose — a single-user gate behind proxies can't trust per-IP headers,
and a global limit can't be dodged by rotating IPs. Tunable via env on the gate container:
`GATE_MAX_FAILS` (default 10), `GATE_WINDOW` (15m), `GATE_LOCKOUT` (30s), `GATE_LOCKOUT_MAX` (15m).

This lives in the gate image, so it ships when you rebuild the gate. If your deployment fronts the
UI with Apache/Caddy basic-auth instead of this gate, add `fail2ban` on the Apache auth log or
Caddy's `rate_limit` instead — tell me and I'll write that config.

## 3. Log limits, health checks, alerts, version pin

- **`compose.override.example.yml`** — caps container logs (they grow unbounded by default and can
  fill the disk) and adds health checks. Layer it on:
  `docker compose -f compose.private.yml -f ops/compose.override.example.yml up -d`
- **Pin the TeddyCloud image** to a specific tag in that override (not `:latest`) so updates are
  deliberate.
- **`ctc-watchdog.sh`** — every 15 min checks the container, the admin site, TLS-cert expiry, disk
  space and backup freshness, and alerts on a webhook (ntfy/Slack/Discord/any) or email — once per
  problem, plus an all-clear on recovery. Enable:
  ```bash
  sudo cp systemd/ctc-watchdog.* /etc/systemd/system/
  sudo systemctl enable --now ctc-watchdog.timer
  ./ctc-watchdog.sh          # run once to test; set ALERT_WEBHOOK/ALERT_EMAIL in .env first
  ```

## Notes / what wasn't tested here

The scripts are shellcheck-clean and the backup's encrypt→verify→decrypt→restore round-trip was
tested (byte-identical). The `docker --volumes-from` step and the systemd timers need a live Docker
host, so run `./ctc-backup.sh --check` then a real `./ctc-backup.sh` on the VPS to confirm end to
end. Adjust service names in the compose override to match `compose.private.yml`.
