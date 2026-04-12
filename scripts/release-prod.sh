#!/usr/bin/env bash
# release-prod.sh — deploy pipeline: precheck → deploy → postverify → summary
# Called by the /deploy-prod skill AFTER git commit & push are done.
set -euo pipefail

REPO_DIR="/home/openclaw/project/my-claw-go"
PROD_DIR="/home/openclaw/project/my-claw-go-online"
LOG_DIR="$REPO_DIR/logs"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/deploy-${TIMESTAMP}.log"

mkdir -p "$LOG_DIR"

START_TS=$(date +%s)

log() {
  local msg="[$(date -u +%H:%M:%S)] $*"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

banner() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $*"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

log "Deploy log: $LOG_FILE"

# ── Step 1: Precheck ─────────────────────────────────────────────────────────
banner "STEP 1 / 3 — Precheck"
bash "$PROD_DIR/scripts/deploy-precheck.sh" 2>&1 | tee -a "$LOG_FILE"
log "✓ Precheck passed"

# ── Step 2: Deploy (blue-green) ──────────────────────────────────────────────
banner "STEP 2 / 3 — Deploy"
log "Starting blue-green deploy..."
bash "$PROD_DIR/scripts/deploy-online.sh" 2>&1 | tee -a "$LOG_FILE"
log "✓ Deploy completed"

# ── Step 3: Post-verify ──────────────────────────────────────────────────────
banner "STEP 3 / 3 — Post-verify"
bash "$PROD_DIR/scripts/deploy-postverify.sh" 2>&1 | tee -a "$LOG_FILE"
log "✓ Post-verify passed"

# ── Summary ──────────────────────────────────────────────────────────────────
END_TS=$(date +%s)
ELAPSED=$(( END_TS - START_TS ))
COMMIT_HASH=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")

banner "RELEASE COMPLETE"
echo "  Commit   : $COMMIT_HASH"
echo "  Duration : ${ELAPSED}s"
echo "  Log      : $LOG_FILE"
echo "  Status   : ✅ ALL CHECKS PASSED"
echo ""
