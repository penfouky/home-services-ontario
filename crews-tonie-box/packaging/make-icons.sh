#!/usr/bin/env bash
# Regenerates app/Resources/AppIcon.icns and icon.png from app/wwwroot/img/icon.svg.
# Only needed after changing the icon. Needs node with the playwright package (npm install playwright).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
app=$here/../app
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
node "$here/render-icon.js" "$app/wwwroot/img/icon.svg" "$tmp" 16 32 64 128 256 512 1024
python3 "$here/png2icns.py" "$app/Resources/AppIcon.icns" "$tmp"
cp "$tmp/icon_512.png" "$app/Resources/icon.png"
