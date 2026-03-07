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

http_code_with_retry() {
  local url="$1"
  local timeout_s="${2:-10}"
  local retries="${3:-3}"
  local sleep_s="${4:-2}"

  local i code
  for i in $(seq 1 "$retries"); do
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" --max-time "$timeout_s" 2>/dev/null || true)
    # keep only 3 digits if curl produced unexpected mixed output
    code=$(printf '%s' "$code" | grep -Eo '[0-9]{3}' | tail -n1 || true)

    if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
      echo "$code"
      return 0
    fi

    if [ "$i" -lt "$retries" ]; then
      sleep "$sleep_s"
    fi
  done

  echo "${code:-000}"
  return 1
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

step "Check local upstream health (with retries)"
if LOCAL_CODE=$(http_code_with_retry "http://127.0.0.1:$ACTIVE_PORT" 5 3 2); then
  ok "Local upstream healthy (HTTP $LOCAL_CODE)"
else
  warn "Local upstream health failed after retries (HTTP $LOCAL_CODE)"
  warn "Recent logs from $APP_NAME:"
  pm2 logs "$APP_NAME" --lines 80 --nostream 2>&1 | tail -n 80 || true
  fail "Local upstream verification failed"
fi

step "Check public domain health (with retries)"
if PUBLIC_CODE=$(http_code_with_retry "$PUBLIC_URL" 10 3 2); then
  ok "Public URL healthy: $PUBLIC_URL (HTTP $PUBLIC_CODE)"
else
  warn "Public URL health failed after retries (HTTP $PUBLIC_CODE)"
  fail "Public domain verification failed"
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
