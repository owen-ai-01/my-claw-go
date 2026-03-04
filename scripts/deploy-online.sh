#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${SRC_DIR:-/home/openclaw/project/my-claw-go}"
TARGET_DIR="${TARGET_DIR:-/home/openclaw/project/my-claw-go-online}"
BRANCH="${BRANCH:-main}"
APP_NAME="${APP_NAME:-my-claw-go-online}"
PORT="${PORT:-3020}"

log() { echo "[deploy-online] $*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

require_cmd git
require_cmd npm

if [[ ! -d "$SRC_DIR/.git" ]]; then
  echo "Source repo not found: $SRC_DIR" >&2
  exit 1
fi

log "source: $SRC_DIR"
log "target: $TARGET_DIR"
log "branch: $BRANCH"
log "app: $APP_NAME"
log "port: $PORT"

if [[ ! -d "$TARGET_DIR/.git" ]]; then
  log "target missing; cloning from source repo"
  git clone "$SRC_DIR" "$TARGET_DIR"
fi

cd "$TARGET_DIR"

log "updating code"
# Keep untracked files (e.g. .env) intact; only reset tracked code files.
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

if [[ ! -f "$TARGET_DIR/.env" ]]; then
  echo "Missing $TARGET_DIR/.env (prod env file). Create it first, then rerun." >&2
  exit 1
fi

log "install dependencies"
npm ci --no-audit --no-fund

log "build"
npm run build

if command -v pm2 >/dev/null 2>&1; then
  log "restart via pm2"
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start npm --name "$APP_NAME" -- run start -- --port "$PORT"
  fi
  pm2 save >/dev/null 2>&1 || true
else
  log "pm2 not found; fallback to nohup"
  pkill -f "next start --port $PORT" >/dev/null 2>&1 || true
  nohup env PORT="$PORT" npm run start -- --port "$PORT" > "$TARGET_DIR/.next-online.log" 2>&1 &
fi

log "health check"
set +e
for i in {1..20}; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT" --max-time 3 2>/dev/null)
  if [[ "$code" == "200" || "$code" == "307" || "$code" == "308" ]]; then
    log "ok (http $code)"
    set -e
    exit 0
  fi
  sleep 1
done
set -e

echo "Health check failed on port $PORT" >&2
exit 1
