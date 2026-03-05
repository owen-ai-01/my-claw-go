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
if [[ -f "pnpm-lock.yaml" ]] && command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
elif [[ -f "package-lock.json" ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

log "build"
npm run build

log "restart via pm2 (with docker group)"
if sg docker -c "pm2 describe '$APP_NAME'" >/dev/null 2>&1; then
  sg docker -c "cd '$TARGET_DIR' && pm2 restart '$APP_NAME' --update-env"
else
  sg docker -c "cd '$TARGET_DIR' && PORT=$PORT pm2 start npm --name '$APP_NAME' -- run start -- --port $PORT"
fi
sg docker -c "pm2 save" >/dev/null 2>&1 || true

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
