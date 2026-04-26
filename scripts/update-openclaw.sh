#!/bin/bash
# Update openclaw npm package on all ready user VPS instances.
# Usage:
#   bash scripts/update-openclaw.sh            # update to latest
#   bash scripts/update-openclaw.sh 2026.4.24  # pin a specific version
#
# Run on SaaS VPS (Control Plane). Requires DATABASE_URL env var.

set -euo pipefail

SSH_KEY="/home/openclaw/.ssh/myclawgo_runtime"
VERSION="${1:-latest}"
FAILED=()

if [[ ! -f "$SSH_KEY" ]]; then
  echo "ERROR: SSH key not found at $SSH_KEY" >&2
  exit 1
fi

IPS=$(psql "$DATABASE_URL" -t -A -c \
  "SELECT \"publicIp\" FROM \"runtimeHost\" WHERE status='ready' AND \"publicIp\" IS NOT NULL")

if [[ -z "$IPS" ]]; then
  echo "No ready VPS found."
  exit 0
fi

echo "Updating openclaw@${VERSION} on all ready VPS ..."
echo "---"

for IP in $IPS; do
  IP=$(echo "$IP" | tr -d '[:space:]')
  [[ -z "$IP" ]] && continue

  echo -n "[$IP] ... "
  if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@"$IP" \
    "su - openclaw -c 'npm install -g openclaw@${VERSION}' && \
     systemctl restart openclaw-gateway && \
     systemctl is-active openclaw-gateway" 2>&1 | tail -1; then
    echo "[$IP] OK"
  else
    echo "[$IP] FAILED"
    FAILED+=("$IP")
  fi
done

echo "---"
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed VPS: ${FAILED[*]}"
  exit 1
fi
echo "All VPS updated to openclaw@${VERSION}."
