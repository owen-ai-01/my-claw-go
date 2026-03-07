#!/usr/bin/env bash
# One-shot production rollout: precheck -> deploy -> postverify
set -euo pipefail

BASE_DIR="/home/openclaw/project/my-claw-go/scripts"
PRECHECK="$BASE_DIR/deploy-precheck.sh"
DEPLOY="$BASE_DIR/deploy-online.sh"
POSTVERIFY="$BASE_DIR/deploy-postverify.sh"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

for f in "$PRECHECK" "$DEPLOY" "$POSTVERIFY"; do
  [ -x "$f" ] || {
    echo "❌ Missing or not executable: $f"
    exit 1
  }
done

log "▶ Running precheck..."
bash "$PRECHECK"

log "▶ Running deploy..."
bash "$DEPLOY"

log "▶ Running post-verify..."
bash "$POSTVERIFY"

log "✅ deploy-all completed successfully"
