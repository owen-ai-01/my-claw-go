#!/usr/bin/env bash
set -euo pipefail

PATTERN="${1:-myclawgo-}"
containers=$(docker ps --format '{{.Names}}' | grep "^${PATTERN}" || true)

if [ -z "$containers" ]; then
  echo "No running containers matched pattern: $PATTERN"
  exit 0
fi

echo "$containers" | while read -r name; do
  [ -z "$name" ] && continue
  echo "Restarting $name"
  docker restart "$name" >/dev/null
  echo "Restarted $name"
done
