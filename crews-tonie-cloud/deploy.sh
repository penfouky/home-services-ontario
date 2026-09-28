#!/usr/bin/env bash
# One-command bring-up for Crew's Tonie Cloud on a VPS.
#
#   ./deploy.sh          # first run creates .env (fill it in), second run starts everything
#
# Needs Docker with the compose plugin. Re-run any time to pull updates and restart.
set -euo pipefail
cd "$(dirname "$0")"

if ! docker compose version >/dev/null 2>&1; then
	echo "Docker with the compose plugin is required. See https://docs.docker.com/engine/install/"
	exit 1
fi

if [ ! -f .env ]; then
	cp .env.example .env
	secret=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
	# fill GATE_SECRET in place (portable sed)
	tmp=$(mktemp)
	sed "s|^GATE_SECRET=.*|GATE_SECRET=${secret}|" .env > "$tmp" && mv "$tmp" .env
	echo "Created .env with a fresh GATE_SECRET."
	echo "Now edit it: set TC_DOMAIN, ACME_EMAIL and GATE_PASSWORD, then run ./deploy.sh again."
	exit 0
fi

# refuse to launch with the placeholder password
if grep -q '^GATE_PASSWORD=change-me' .env; then
	echo "Set a real GATE_PASSWORD in .env before starting."
	exit 1
fi

domain=$(grep -E '^TC_DOMAIN=' .env | cut -d= -f2-)
echo "Bringing up Crew's Tonie Cloud for ${domain} ..."
docker compose pull
docker compose up -d --build

echo
echo "Running. Give Caddy a minute to fetch the TLS certificate on first start."
echo "  Admin UI (password-protected): https://${domain}:8443"
echo "  Toniebox endpoint:             ${domain}  (port 443)"
echo
docker compose ps
