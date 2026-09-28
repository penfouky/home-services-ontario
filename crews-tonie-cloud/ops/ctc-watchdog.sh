#!/usr/bin/env bash
# Health watchdog for the Crew's Tonie Cloud deployment.
#
# Checks, and alerts only when something is wrong (and once more when it recovers):
#   - the TeddyCloud container is running (and healthy, if it has a healthcheck)
#   - the admin site answers over HTTPS
#   - the TLS certificate is not about to expire
#   - the disk has room
#   - a successful backup happened recently
#
# Alerts go to a webhook (ntfy / Slack / Discord / any URL that accepts a POST body) and/or to
# email via `mail`. State is remembered between runs so you get one alert per problem, not one per
# tick. Meant to be run every few minutes by a systemd timer / cron. Config from ops/.env.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
[ -f "$here/.env" ] && set -a && . "$here/.env" && set +a

TC_CONTAINER="${TC_CONTAINER:-teddycloud}"
ADMIN_URL="${ADMIN_URL:-}"                 # e.g. https://tonie.coladabuilds.com/  (what a human visits)
TLS_HOST="${TLS_HOST:-}"                   # host:port for the cert check, e.g. tonie.coladabuilds.com:443
TLS_MIN_DAYS="${TLS_MIN_DAYS:-14}"
DISK_PATH="${DISK_PATH:-/}"
DISK_MIN_PCT="${DISK_MIN_PCT:-10}"         # alert if free space drops below this percent
BACKUP_MAX_AGE_H="${BACKUP_MAX_AGE_H:-48}" # alert if the last good backup is older than this
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
STATE_FILE="${STATE_FILE:-$here/.watchdog-state}"
HEARTBEAT="${HEARTBEAT:-0}"                # 1 = also send an all-clear each run

log() { printf '%s ctc-watchdog: %s\n' "$(date -u +%FT%TZ)" "$*"; }
problems=()
add() { problems+=("$*"); log "PROBLEM: $*"; }

# --- container ---------------------------------------------------------------------------------
if command -v docker >/dev/null; then
  state="$(docker inspect -f '{{.State.Status}}' "$TC_CONTAINER" 2>/dev/null || echo missing)"
  if [ "$state" != "running" ]; then
    add "TeddyCloud container '$TC_CONTAINER' is $state"
  else
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$TC_CONTAINER" 2>/dev/null || true)"
    [ -n "$health" ] && [ "$health" != "healthy" ] && add "TeddyCloud health is $health"
  fi
else
  add "docker not found"
fi

# --- admin site reachable ----------------------------------------------------------------------
if [ -n "$ADMIN_URL" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$ADMIN_URL" 2>/dev/null || echo 000)"
  # the gate answers 200 (login page) or redirects (301/302); anything else is trouble
  case "$code" in 200|301|302|303|307|308) ;; *) add "admin site $ADMIN_URL returned HTTP $code" ;; esac
fi

# --- TLS expiry --------------------------------------------------------------------------------
if [ -n "$TLS_HOST" ] && command -v openssl >/dev/null; then
  host="${TLS_HOST%%:*}"
  end="$(echo | openssl s_client -servername "$host" -connect "$TLS_HOST" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  if [ -z "$end" ]; then
    add "could not read TLS certificate from $TLS_HOST"
  else
    end_ts="$(date -d "$end" +%s 2>/dev/null || echo 0)"
    days=$(( (end_ts - $(date +%s)) / 86400 ))
    [ "$end_ts" != 0 ] && [ "$days" -lt "$TLS_MIN_DAYS" ] && add "TLS certificate for $host expires in $days day(s)"
  fi
fi

# --- disk --------------------------------------------------------------------------------------
free_pct="$(df --output=pcent "$DISK_PATH" 2>/dev/null | tail -1 | tr -dc '0-9')"
if [ -n "$free_pct" ]; then
  avail=$((100 - free_pct))
  [ "$avail" -lt "$DISK_MIN_PCT" ] && add "disk $DISK_PATH is ${free_pct}% full (only ${avail}% free)"
fi

# --- backup freshness --------------------------------------------------------------------------
stamp="$here/.last-backup-ok"
if [ -f "$stamp" ]; then
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$stamp") ) / 3600 ))
  [ "$age_h" -gt "$BACKUP_MAX_AGE_H" ] && add "last successful backup was ${age_h}h ago (limit ${BACKUP_MAX_AGE_H}h)"
else
  add "no successful backup recorded yet"
fi

# --- notify (only on change) -------------------------------------------------------------------
notify() { # $1 = subject, $2 = body
  [ -n "$ALERT_WEBHOOK" ] && curl -s --max-time 15 -H "Title: $1" -d "$2" "$ALERT_WEBHOOK" >/dev/null 2>&1 || true
  [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null && printf '%s\n' "$2" | mail -s "$1" "$ALERT_EMAIL" || true
}

prev="ok"; [ -f "$STATE_FILE" ] && prev="$(cat "$STATE_FILE" 2>/dev/null || echo ok)"

if [ "${#problems[@]}" -gt 0 ]; then
  body="Crew's Tonie Cloud watchdog found:"$'\n'"$(printf ' - %s\n' "${problems[@]}")"
  echo "bad" > "$STATE_FILE"
  notify "⚠️ Tonie Cloud: ${#problems[@]} problem(s)" "$body"
  exit 1
else
  echo "ok" > "$STATE_FILE"
  if [ "$prev" = "bad" ]; then notify "✅ Tonie Cloud recovered" "All checks pass again."; fi
  [ "$HEARTBEAT" = 1 ] && notify "✅ Tonie Cloud OK" "All checks pass."
  log "all checks passed"
  exit 0
fi
