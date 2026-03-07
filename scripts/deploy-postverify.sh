#!/usr/bin/env bash
# Post-deploy verification for myclawgo production deployment
set -euo pipefail

APP_NAME="my-claw-go-online"
NGINX_UPSTREAM="/etc/nginx/conf.d/myclawgo-upstream.conf"
PUBLIC_URL="https://myclawgo.com"

ok() { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }
fail() { echo "❌ $*"; exit 1; }
step() { echo; echo "▶ $*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

for c in pm2 curl grep awk sudo nginx; do
  require_cmd "$c"
done

step "Check PM2 process"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  ok "PM2 process exists: $APP_NAME"
else
  fail "PM2 process not found: $APP_NAME"
fi

step "Check Nginx syntax and upstream"
sudo nginx -t >/dev/null
ok "nginx -t passed"
[ -f "$NGINX_UPSTREAM" ] || fail "Nginx upstream file missing: $NGINX_UPSTREAM"
ACTIVE_PORT=$(grep -oP '(?<=server 127\.0\.0\.1:)\d+' "$NGINX_UPSTREAM" 2>/dev/null || true)
[ -n "$ACTIVE_PORT" ] || fail "Failed to parse active upstream port"
ok "Active upstream port: $ACTIVE_PORT"

step "Check local upstream health"
LOCAL_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:$ACTIVE_PORT" --max-time 5 2>/dev/null || echo "000")
if [ "$LOCAL_CODE" = "200" ] || [ "$LOCAL_CODE" = "301" ] || [ "$LOCAL_CODE" = "302" ]; then
  ok "Local upstream healthy (HTTP $LOCAL_CODE)"
else
  fail "Local upstream health failed (HTTP $LOCAL_CODE)"
fi

step "Check public domain health"
PUBLIC_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$PUBLIC_URL" --max-time 10 2>/dev/null || echo "000")
if [ "$PUBLIC_CODE" = "200" ] || [ "$PUBLIC_CODE" = "301" ] || [ "$PUBLIC_CODE" = "302" ]; then
  ok "Public URL healthy: $PUBLIC_URL (HTTP $PUBLIC_CODE)"
else
  fail "Public URL health failed: $PUBLIC_URL (HTTP $PUBLIC_CODE)"
fi

step "Check for obvious runtime errors in recent logs"
ERR_LINES=$(pm2 logs "$APP_NAME" --lines 120 --nostream 2>&1 | grep -Ei "(EADDRINUSE|Cannot find module|Unhandled|FATAL|Error: listen|SIGSEGV)" || true)
if [ -n "$ERR_LINES" ]; then
  warn "Potential errors found in recent PM2 logs:"
  echo "$ERR_LINES" | tail -n 20
else
  ok "No obvious fatal errors in recent PM2 logs"
fi

step "Verification done"
echo "✅ Post-verify completed."
