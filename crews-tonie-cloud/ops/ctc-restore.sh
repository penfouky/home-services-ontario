#!/usr/bin/env bash
# Restore a TeddyCloud backup made by ctc-backup.sh.
#
#   ./ctc-restore.sh --list                      # show available backups
#   ./ctc-restore.sh --inspect <archive.enc>     # decrypt and list contents, change nothing
#   ./ctc-restore.sh <archive.enc>               # restore into the container's volumes (asks first)
#
# <archive.enc> may be a local path, a name in BACKUP_DIR, or a name in RCLONE_REMOTE (it will be
# fetched). Restoring OVERWRITES the live certs/config/firmware/library/content, so the script
# stops the container first, requires you to type RESTORE, and puts the box's trust at stake — read
# ops/README.md. Config from the same ops/.env as the backup script.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
[ -f "$here/.env" ] && set -a && . "$here/.env" && set +a

TC_CONTAINER="${TC_CONTAINER:-teddycloud}"
BACKUP_PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-$here/backup.passphrase}"
BACKUP_DIR="${BACKUP_DIR:-}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
HELPER_IMAGE="${HELPER_IMAGE:-alpine:3}"

log() { printf '%s ctc-restore: %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
command -v docker >/dev/null || die "docker not found"
[ -s "$BACKUP_PASSPHRASE_FILE" ] || die "passphrase file missing: $BACKUP_PASSPHRASE_FILE"

resolve() { # echo a local path to the requested archive, fetching from the remote if needed
  local a="$1"
  [ -f "$a" ] && { echo "$a"; return; }
  [ -n "$BACKUP_DIR" ] && [ -f "$BACKUP_DIR/$a" ] && { echo "$BACKUP_DIR/$a"; return; }
  if [ -n "$RCLONE_REMOTE" ]; then
    local tmp; tmp="$(mktemp -d)"; rclone copyto "$RCLONE_REMOTE/$a" "$tmp/$a" 2>/dev/null && { echo "$tmp/$a"; return; }
  fi
  return 1
}

case "${1:-}" in
  --list)
    if [ -n "$BACKUP_DIR" ]; then echo "local ($BACKUP_DIR):"; for f in "$BACKUP_DIR"/teddycloud-*.tar.gz.enc; do [ -e "$f" ] && basename "$f" || echo "  (none)"; done; fi
    [ -n "$RCLONE_REMOTE" ] && { echo "remote ($RCLONE_REMOTE):"; rclone lsf "$RCLONE_REMOTE" 2>/dev/null | grep -E 'teddycloud-.*enc$' | sort -r || echo "  (none)"; }
    exit 0 ;;
  --inspect)
    [ -n "${2:-}" ] || die "usage: --inspect <archive.enc>"
    src="$(resolve "$2")" || die "not found: $2"
    log "contents of $2:"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$src" -pass "file:$BACKUP_PASSPHRASE_FILE" 2>/dev/null | tar tzf - | head -50
    exit 0 ;;
  "" ) die "usage: ./ctc-restore.sh <archive.enc>  (or --list / --inspect)" ;;
esac

src="$(resolve "$1")" || die "not found: $1"
log "about to restore $1 into container '$TC_CONTAINER' volumes."
log "this OVERWRITES certs/config/firmware/library/content and may change what your box trusts."
printf 'Type RESTORE to proceed: '; read -r confirm
[ "$confirm" = "RESTORE" ] || die "aborted"

# verify it decrypts before touching anything
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$src" -pass "file:$BACKUP_PASSPHRASE_FILE" 2>/dev/null | gzip -t \
  || die "archive failed to decrypt/verify — wrong passphrase or corrupt file"

running=0; docker inspect -f '{{.State.Running}}' "$TC_CONTAINER" 2>/dev/null | grep -q true && running=1
if [ "$running" = 1 ]; then log "stopping $TC_CONTAINER"; docker stop "$TC_CONTAINER" >/dev/null; fi

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$src" -pass "file:$BACKUP_PASSPHRASE_FILE" 2>/dev/null > "$work/archive.tar.gz"

# extract back into the same container paths. The archive stores absolute paths like
# /teddycloud/certs, so extracting at / inside a container sharing those volumes restores them.
log "restoring files into volumes"
docker run --rm --volumes-from "$TC_CONTAINER" -v "$work":/backup "$HELPER_IMAGE" \
  sh -c 'cd / && tar xzf /backup/archive.tar.gz teddycloud' \
  || die "extraction failed"

if [ "$running" = 1 ]; then log "starting $TC_CONTAINER"; docker start "$TC_CONTAINER" >/dev/null; fi
log "restore complete. Check the admin UI and that your box still connects."
