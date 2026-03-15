#!/usr/bin/env bash
# Blue-green zero-downtime deploy for myclawgo.com
set -euo pipefail

PROD_DIR="/home/openclaw/project/my-claw-go-online"
APP_NAME="my-claw-go-online"
NEW_APP_NAME="${APP_NAME}-new"
NGINX_UPSTREAM="/etc/nginx/conf.d/myclawgo-upstream.conf"
LOG="$PROD_DIR/deploy.log"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    log "✗ Missing required command: $1"
    exit 1
  }
}

for c in git pnpm npm pm2 curl nginx sudo grep; do
  require_cmd "$c"
done

mkdir -p "$PROD_DIR"
touch "$LOG"

PREV_UPSTREAM_CONTENT=""
if [ -f "$NGINX_UPSTREAM" ]; then
  PREV_UPSTREAM_CONTENT="$(cat "$NGINX_UPSTREAM")"
fi

# Ports 3020 is reserved for chat-gateway-proxy; use 3021/3022 for Next.js blue-green
CURRENT_PORT=$(grep -oP '(?<=server 127\.0\.0\.1:)\d+' "$NGINX_UPSTREAM" 2>/dev/null || echo "3021")
if [ "$CURRENT_PORT" = "3021" ]; then
  NEW_PORT=3022
else
  NEW_PORT=3021
fi

rollback() {
  local reason="${1:-unknown failure}"
  log "↩ Rolling back: $reason"

  # Keep current live app untouched. Only clean staged new app and restore nginx upstream.
  sg docker -c "pm2 delete ${NEW_APP_NAME} 2>/dev/null || true" || true

  if [ -n "$PREV_UPSTREAM_CONTENT" ]; then
    printf '%s\n' "$PREV_UPSTREAM_CONTENT" | sudo tee "$NGINX_UPSTREAM" >/dev/null || true
    sudo nginx -t >/dev/null 2>&1 && sudo nginx -s reload >/dev/null 2>&1 || true
  fi

  log "↩ Rollback finished"
}

on_error() {
  local exit_code=$?
  rollback "script exited with code ${exit_code}"
  exit "$exit_code"
}
trap on_error ERR

# ── Step 1: Sync code ────────────────────────────────────────────────────────
log "▶ Syncing code..."
cd "$PROD_DIR"
git fetch origin main
git reset --hard origin/main
pnpm install --frozen-lockfile >> "$LOG" 2>&1

# ── Step 2: Build ────────────────────────────────────────────────────────────
log "▶ Building..."
npm run build >> "$LOG" 2>&1
log "✓ Build succeeded"

# ── Step 3: Detect current port, pick new port ───────────────────────────────
log "▶ Current port: $CURRENT_PORT → New port: $NEW_PORT"

# ── Step 4: Start new instance ───────────────────────────────────────────────
log "▶ Starting new instance on port $NEW_PORT..."
sg docker -c "pm2 delete ${NEW_APP_NAME} 2>/dev/null || true"
sg docker -c "cd '$PROD_DIR' && PORT=$NEW_PORT pm2 start npm --name ${NEW_APP_NAME} -- run start -- --port $NEW_PORT" >> "$LOG" 2>&1

# ── Step 5: Health check ─────────────────────────────────────────────────────
log "▶ Health checking new instance..."
HEALTHY=false
for i in $(seq 1 20); do
  sleep 3
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:$NEW_PORT" --max-time 5 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ] || [ "$CODE" = "301" ] || [ "$CODE" = "302" ]; then
    HEALTHY=true
    log "✓ Healthy after ${i}×3s (HTTP $CODE)"
    break
  fi
  log "  waiting ($i/20, HTTP $CODE)"
done

if [ "$HEALTHY" != "true" ]; then
  log "✗ Health check FAILED"
  exit 1
fi

# ── Step 6: Switch Nginx ─────────────────────────────────────────────────────
log "▶ Switching Nginx to port $NEW_PORT..."
sudo tee "$NGINX_UPSTREAM" > /dev/null <<EOC
upstream myclawgo_backend {
    server 127.0.0.1:$NEW_PORT;
}
EOC
sudo nginx -t
sudo nginx -s reload
log "✓ Nginx switched to $NEW_PORT"

# ── Step 7: Stop old + promote new ───────────────────────────────────────────
log "▶ Stopping old instance ($APP_NAME)..."
sg docker -c "pm2 delete $APP_NAME 2>/dev/null || true"

log "▶ Promoting new instance name to $APP_NAME..."
# Rename without creating a second process on same port
sg docker -c "pm2 restart $NEW_APP_NAME --name $APP_NAME" >> "$LOG" 2>&1
sg docker -c "pm2 save" >> "$LOG" 2>&1

# Success: disable rollback trap
trap - ERR
log "✅ Deploy complete — live on port $NEW_PORT"
