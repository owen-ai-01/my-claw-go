#!/usr/bin/env bash
set -euo pipefail

STAMP="${1:-$(date -u +%Y%m%d-%H%M%S)}"
PATTERN="${2:-myclawgo-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/publish-bridge-release.sh" "$STAMP"
"$SCRIPT_DIR/restart-runtime-containers.sh" "$PATTERN"

echo "Bridge rollout completed for pattern: $PATTERN"
