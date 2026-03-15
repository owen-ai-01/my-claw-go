#!/usr/bin/env bash
set -euo pipefail

ROOT="${MYCLAWGO_BRIDGE_ROOT:-/home/openclaw/myclawgo-bridge}"
STAMP="${1:-$(date -u +%Y%m%d-%H%M%S)}"
RELEASE_DIR="$ROOT/releases/$STAMP"
CURRENT_LINK="$ROOT/current"
REPO_BRIDGE_DIR="${REPO_BRIDGE_DIR:-/home/openclaw/project/my-claw-go/bridge}"

mkdir -p "$ROOT/releases"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

cd "$REPO_BRIDGE_DIR"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm build
pnpm prune --prod

cp package.json pnpm-lock.yaml "$RELEASE_DIR/"
cp -R dist "$RELEASE_DIR/dist"
cp -R node_modules "$RELEASE_DIR/node_modules"

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

echo "Published bridge release: $RELEASE_DIR"
echo "Current -> $(readlink -f "$CURRENT_LINK")"
