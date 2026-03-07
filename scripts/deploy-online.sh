#!/usr/bin/env bash
# Blue-green zero-downtime deploy for myclawgo.com
set -uo pipefail

PROD_DIR="/home/openclaw/project/my-claw-go-online"
APP_NAME="my-claw-go-online"
NGINX_UPSTREAM="/etc/nginx/conf.d/myclawgo-upstream.conf"
LOG="$PROD_DIR/deploy.log"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

# ── Step 1: Sync code ────────────────────────────────────────────────────────
log "▶ Syncing code..."
cd "$PROD_DIR"
git fetch origin main
git reset --hard origin/main
pnpm install --frozen-lockfile 2>&1 | tail -3

# ── Step 2: Build ────────────────────────────────────────────────────────────
log "▶ Building..."
if ! npm run build >> "$LOG" 2>&1; then
  log "✗ Build FAILED — production untouched. Aborting."
  exit 1
fi
log "✓ Build succeeded"

# ── Step 3: Detect current port, pick new port ───────────────────────────────
CURRENT_PORT=$(grep -oP '(?<=server 127\.0\.0\.1:)\d+' "$NGINX_UPSTREAM" 2>/dev/null || echo "3020")
if [ "$CURRENT_PORT" = "3020" ]; then
  NEW_PORT=3021
else
  NEW_PORT=3020
fi
log "▶ Current port: $CURRENT_PORT → New port: $NEW_PORT"

# ── Step 4: Start new instance ───────────────────────────────────────────────
log "▶ Starting new instance on port $NEW_PORT..."
sg docker -c "pm2 delete ${APP_NAME}-new 2>/dev/null; true"
sg docker -c "cd '$PROD_DIR' && PORT=$NEW_PORT pm2 start npm --name ${APP_NAME}-new -- run start -- --port $NEW_PORT" >> "$LOG" 2>&1 || {
  log "✗ Failed to start new instance"; exit 1
}

# ── Step 5: Health check ─────────────────────────────────────────────────────
log "▶ Health checking new instance..."
HEALTHY=false
for i in $(seq 1 20); do
  sleep 3
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:$NEW_PORT" --max-time 5 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ]; then
    HEALTHY=true
    log "✓ Healthy after ${i}×3s (HTTP $CODE)"
    break
  fi
  log "  waiting ($i/20, HTTP $CODE)"
done

if [ "$HEALTHY" != "true" ]; then
  log "✗ Health check FAILED — rolling back"
  sg docker -c "pm2 delete ${APP_NAME}-new 2>/dev/null; true"
  exit 1
fi

# ── Step 6: Switch Nginx ─────────────────────────────────────────────────────
log "▶ Switching Nginx to port $NEW_PORT..."
sudo tee "$NGINX_UPSTREAM" > /dev/null << EOF
upstream myclawgo_backend {
    server 127.0.0.1:$NEW_PORT;
}
EOF
sudo nginx -s reload
log "✓ Nginx switched to $NEW_PORT"

# ── Step 7: Stop old + rename new ────────────────────────────────────────────
log "▶ Stopping old instance..."
sg docker -c "pm2 delete $APP_NAME 2>/dev/null; true"
sg docker -c "cd '$PROD_DIR' && PORT=$NEW_PORT pm2 start npm --name $APP_NAME -- run start -- --port $NEW_PORT" >> "$LOG" 2>&1 || true
sg docker -c "pm2 delete ${APP_NAME}-new 2>/dev/null; true"
sg docker -c "pm2 save" >> "$LOG" 2>&1 || true

log "✅ Deploy complete — live on port $NEW_PORT"
