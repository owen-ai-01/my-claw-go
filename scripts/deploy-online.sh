#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROD_DIR="/home/openclaw/project/my-claw-go-online"
SRC_DIR="/home/openclaw/project/my-claw-go"
APP_NAME="my-claw-go-online"
PORT_BLUE=3020   # current live
PORT_GREEN=3021  # new build
NGINX_UPSTREAM="/etc/nginx/conf.d/myclawgo-upstream.conf"
LOG="$PROD_DIR/deploy.log"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

# ── Step 1: Sync code ─────────────────────────────────────────────────────────
log "▶ Syncing code to production dir..."
cd "$PROD_DIR"
git fetch origin main
git reset --hard origin/main
pnpm install --frozen-lockfile 2>&1 | tail -3

# ── Step 2: Build ─────────────────────────────────────────────────────────────
log "▶ Building..."
if ! npm run build >> "$LOG" 2>&1; then
  log "✗ Build FAILED — production untouched. Aborting."
  exit 1
fi
log "✓ Build succeeded"

# ── Step 3: Start green instance ─────────────────────────────────────────────
log "▶ Starting green instance on port $PORT_GREEN..."
sg docker -c "cd '$PROD_DIR' && PORT=$PORT_GREEN pm2 start npm \
  --name ${APP_NAME}-green \
  --update-env \
  -- run start -- --port $PORT_GREEN" >> "$LOG" 2>&1

# ── Step 4: Health check green ────────────────────────────────────────────────
log "▶ Health checking green (port $PORT_GREEN)..."
HEALTHY=false
for i in $(seq 1 15); do
  sleep 2
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT_GREEN" --max-time 5 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ]; then
    HEALTHY=true
    log "✓ Green healthy after ${i}×2s (HTTP $CODE)"
    break
  fi
  log "  … waiting ($i/15, HTTP $CODE)"
done

if [ "$HEALTHY" != "true" ]; then
  log "✗ Green health check FAILED — rolling back"
  sg docker -c "pm2 delete ${APP_NAME}-green" >> "$LOG" 2>&1 || true
  exit 1
fi

# ── Step 5: Switch Nginx upstream ────────────────────────────────────────────
log "▶ Switching Nginx upstream to port $PORT_GREEN..."
sudo tee "$NGINX_UPSTREAM" > /dev/null << EOF
upstream myclawgo_backend {
    server 127.0.0.1:$PORT_GREEN;
}
EOF
sudo nginx -t >> "$LOG" 2>&1 && sudo nginx -s reload
log "✓ Nginx now pointing to green ($PORT_GREEN)"

# ── Step 6: Stop old blue ─────────────────────────────────────────────────────
log "▶ Stopping old blue instance..."
sg docker -c "pm2 delete ${APP_NAME}-blue 2>/dev/null || pm2 delete $APP_NAME 2>/dev/null || true" >> "$LOG" 2>&1

# ── Step 7: Rename green → blue (canonical) ───────────────────────────────────
sg docker -c "pm2 restart ${APP_NAME}-green --name $APP_NAME 2>/dev/null || true" >> "$LOG" 2>&1

# Update upstream to canonical port name (keep green port for now, will be blue next deploy)
sg docker -c "pm2 save" >> "$LOG" 2>&1

log "✅ Deployment complete — live on port $PORT_GREEN (blue next cycle: $PORT_BLUE↔$PORT_GREEN swap)"
