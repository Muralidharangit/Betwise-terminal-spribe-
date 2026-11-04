#!/usr/bin/env bash
# Build Ubuntu/Debian .deb installer for Kiosk Terminal.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "ERROR: Create tauri-client/.env with:"
  echo "  VITE_API_BASE_URL=http://YOUR-SERVER-IP:8000/api"
  exit 1
fi

echo "Building Linux .deb using API: $(grep VITE_API_BASE_URL .env)"
export CARGO_TARGET_DIR="$ROOT/src-tauri/target"
npm run build
npm run tauri -- build --bundles deb

OUT="$ROOT/src-tauri/target/release/bundle/deb"
RELEASES="$ROOT/releases"
mkdir -p "$RELEASES"
if compgen -G "$OUT"/*.deb > /dev/null; then
  cp "$OUT"/*.deb "$RELEASES/"
fi
echo ""
echo "Done! Install on Ubuntu with:"
echo "  sudo dpkg -i \"$RELEASES\"/*.deb"
ls -lh "$RELEASES"/*.deb 2>/dev/null || ls -la "$OUT"/
