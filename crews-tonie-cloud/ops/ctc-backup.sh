#!/usr/bin/env bash
# Encrypted, off-server backup of TeddyCloud's irreplaceable data.
#
# WHY THIS MATTERS: the certs volume holds the CA that is flashed into your Toniebox. Lose it
# and a fresh TeddyCloud mints a new CA, the box stops trusting the server, and you have to open
# the box and re-flash. The firmware volume holds the only copy of your box's original firmware.
# TeddyCloud has no backup of its own, so this script is it.
#
# It finds the running TeddyCloud container, tars the important paths straight out of its volumes
# (so it does not care what the volumes are named in your compose file), encrypts the archive with
# a passphrase, copies it somewhere off the server, and prunes old copies.
#
#   ./ctc-backup.sh                 # run a backup now
#   ./ctc-backup.sh --list          # list backups at the destination
#   ./ctc-backup.sh --check         # verify config + that the container is reachable, then exit
#
# Configure with a .env next to this script (see ops/README.md). Nothing secret is ever passed on
# a command line. Exit code is non-zero on any failure, so a systemd timer / cron will surface it.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
[ -f "$here/.env" ] && set -a && . "$here/.env" && set +a

# ---- configuration (all overridable via ops/.env) --------------------------------------------
TC_CONTAINER="${TC_CONTAINER:-teddycloud}"                       # container name or id
BACKUP_PATHS="${BACKUP_PATHS:-/teddycloud/certs /teddycloud/config /teddycloud/data/firmware /teddycloud/data/library /teddycloud/data/content}"
BACKUP_PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-$here/backup.passphrase}"  # a file holding the passphrase
BACKUP_KEEP="${BACKUP_KEEP:-14}"                                 # how many archives to retain
BACKUP_DIR="${BACKUP_DIR:-}"                                     # local/mounted destination dir
RCLONE_REMOTE="${RCLONE_REMOTE:-}"                               # e.g. gdrive:tonie-backups (rclone)
EXTRA_BACKUP_DIR="${EXTRA_BACKUP_DIR:-$here}"                    # also archived: gate/.env/compose live here
HELPER_IMAGE="${HELPER_IMAGE:-alpine:3}"                         # tiny image used to tar the volumes

log() { printf '%s ctc-backup: %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not found"

have_dest() { [ -n "$BACKUP_DIR" ] || [ -n "$RCLONE_REMOTE" ]; }

preflight() {
  have_dest || die "set BACKUP_DIR and/or RCLONE_REMOTE in ops/.env"
  [ -s "$BACKUP_PASSPHRASE_FILE" ] || die "passphrase file missing/empty: $BACKUP_PASSPHRASE_FILE (put a long random passphrase in it, chmod 600)"
  docker inspect "$TC_CONTAINER" >/dev/null 2>&1 || die "container '$TC_CONTAINER' not found (set TC_CONTAINER)"
  if [ -n "$RCLONE_REMOTE" ]; then command -v rclone >/dev/null || die "RCLONE_REMOTE set but rclone not installed"; fi
  log "preflight OK (container=$TC_CONTAINER dest=${BACKUP_DIR:-}${BACKUP_DIR:+ }${RCLONE_REMOTE:-})"
}

list_backups() {
  if [ -n "$BACKUP_DIR" ]; then log "local backups in $BACKUP_DIR:"; ls -lh "$BACKUP_DIR"/teddycloud-*.tar.gz.enc 2>/dev/null || echo "  (none)"; fi
  if [ -n "$RCLONE_REMOTE" ]; then log "remote backups in $RCLONE_REMOTE:"; rclone lsl "$RCLONE_REMOTE" 2>/dev/null | grep -E 'teddycloud-.*\.tar\.gz\.enc' || echo "  (none)"; fi
}

case "${1:-}" in
  --check) preflight; exit 0 ;;
  --list)  list_backups; exit 0 ;;
  "" ) ;;
  * ) die "unknown option: $1 (use --check or --list)" ;;
esac

preflight

stamp="$(date -u +%Y%m%d-%H%M%S)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
archive="$work/teddycloud-$stamp.tar.gz"
enc="$archive.enc"

# 1) tar the important paths straight out of the container's volumes (name-agnostic).
#    A throwaway alpine container mounts the same volumes and writes the tar to our workdir.
log "archiving from $TC_CONTAINER: $BACKUP_PATHS"
# shellcheck disable=SC2086
docker run --rm \
  --volumes-from "$TC_CONTAINER":ro \
  -v "$work":/backup \
  "$HELPER_IMAGE" \
  tar czf "/backup/$(basename "$archive")" $BACKUP_PATHS 2>/dev/null \
  || die "tar from container volumes failed"

# also fold in the deployment config next to this script (compose file, gate/.env), if present
if [ -n "$EXTRA_BACKUP_DIR" ] && [ -d "$EXTRA_BACKUP_DIR" ]; then
  tar rf "${archive%.gz}" -C "$EXTRA_BACKUP_DIR" . 2>/dev/null || true  # best-effort; not fatal
fi

[ -s "$archive" ] || die "archive is empty — nothing was backed up"

# 2) encrypt at rest (AES-256, key derived from the passphrase with PBKDF2)
log "encrypting ($(du -h "$archive" | cut -f1))"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "$archive" -out "$enc" -pass "file:$BACKUP_PASSPHRASE_FILE" || die "encryption failed"
rm -f "$archive"

# 3) verify the archive round-trips (decrypt + gzip test) before we trust it
log "verifying"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$enc" -pass "file:$BACKUP_PASSPHRASE_FILE" 2>/dev/null \
  | gzip -t || die "verification failed — the backup would not restore"

# 4) ship it off-server
name="$(basename "$enc")"
if [ -n "$BACKUP_DIR" ]; then
  mkdir -p "$BACKUP_DIR"; cp "$enc" "$BACKUP_DIR/$name"; log "wrote $BACKUP_DIR/$name"
fi
if [ -n "$RCLONE_REMOTE" ]; then
  rclone copyto "$enc" "$RCLONE_REMOTE/$name" || die "rclone upload failed"; log "uploaded $RCLONE_REMOTE/$name"
fi

# 5) prune old copies, keeping the newest $BACKUP_KEEP
if [ -n "$BACKUP_DIR" ]; then
  # shellcheck disable=SC2012
  ls -1t "$BACKUP_DIR"/teddycloud-*.tar.gz.enc 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | while read -r old; do
    rm -f "$old"; log "pruned $(basename "$old")"
  done
fi
if [ -n "$RCLONE_REMOTE" ]; then
  rclone lsf "$RCLONE_REMOTE" 2>/dev/null | grep -E '^teddycloud-.*\.tar\.gz\.enc$' | sort -r | tail -n +$((BACKUP_KEEP + 1)) | while read -r old; do
    rclone deletefile "$RCLONE_REMOTE/$old" 2>/dev/null && log "pruned remote $old" || true
  done
fi

# leave a stamp so the watchdog can tell how fresh the last good backup is
: > "$here/.last-backup-ok" 2>/dev/null || true
log "done: $name"
