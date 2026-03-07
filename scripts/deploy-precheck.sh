#!/usr/bin/env bash
# Pre-deploy checks for myclawgo production deployment
set -euo pipefail

PROD_DIR="/home/openclaw/project/my-claw-go-online"
APP_NAME="my-claw-go-online"
NEW_APP_NAME="${APP_NAME}-new"
NGINX_UPSTREAM="/etc/nginx/conf.d/myclawgo-upstream.conf"

ok() { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }
fail() { echo "❌ $*"; exit 1; }
step() { echo; echo "▶ $*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

step "Checking required commands"
for c in git pnpm npm pm2 curl nginx sudo grep awk; do
  require_cmd "$c"
done
ok "All required commands exist"

step "Checking production directory"
[ -d "$PROD_DIR" ] || fail "Production dir not found: $PROD_DIR"
[ -d "$PROD_DIR/.git" ] || fail "Not a git repo: $PROD_DIR"
ok "Production directory is valid"

step "Checking Nginx upstream file"
[ -f "$NGINX_UPSTREAM" ] || fail "Nginx upstream file missing: $NGINX_UPSTREAM"
CURRENT_PORT=$(grep -oP '(?<=server 127\.0\.0\.1:)\d+' "$NGINX_UPSTREAM" 2>/dev/null || true)
[ -n "$CURRENT_PORT" ] || fail "Could not parse current upstream port from $NGINX_UPSTREAM"
ok "Current upstream port: $CURRENT_PORT"

step "Checking Nginx config syntax"
sudo nginx -t >/dev/null
ok "nginx -t passed"

step "Checking PM2 status"
pm2 list >/dev/null
ok "PM2 is reachable"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  ok "Current app exists in PM2: $APP_NAME"
else
  warn "Current app not found in PM2: $APP_NAME"
fi
if pm2 describe "$NEW_APP_NAME" >/dev/null 2>&1; then
  warn "Staging app exists and will be replaced: $NEW_APP_NAME"
else
  ok "No stale staging app: $NEW_APP_NAME"
fi

step "Checking local health of current upstream"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:$CURRENT_PORT" --max-time 5 2>/dev/null || echo "000")
if [ "$CODE" = "200" ] || [ "$CODE" = "301" ] || [ "$CODE" = "302" ]; then
  ok "Current upstream health check passed (HTTP $CODE)"
else
  warn "Current upstream health returned HTTP $CODE (investigate before deploy)"
fi

step "Checking git remote and branch"
cd "$PROD_DIR"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
REMOTE_MAIN=$(git ls-remote --heads origin main | awk '{print $1}' | head -n1)
[ -n "$REMOTE_MAIN" ] || fail "Cannot read origin/main"
ok "Repo branch: $BRANCH"
ok "origin/main head: ${REMOTE_MAIN:0:12}"

step "Summary"
echo "✅ Precheck completed. Safe to run deploy script if warnings are acceptable."
