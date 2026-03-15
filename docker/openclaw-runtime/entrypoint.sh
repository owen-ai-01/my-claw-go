#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/openclaw/.openclaw /home/openclaw/.openclaw/agents/main/agent
chown -R openclaw:openclaw /home/openclaw/.openclaw /home/openclaw /opt/myclawgo-bridge

if [ -f /seed/openclaw.json ] && [ ! -f /home/openclaw/.openclaw/openclaw.json ]; then
  cp /seed/openclaw.json /home/openclaw/.openclaw/openclaw.json
fi

if [ -f /seed/auth-profiles.json ] && [ ! -f /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json ]; then
  cp /seed/auth-profiles.json /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json
fi

chown -R openclaw:openclaw /home/openclaw/.openclaw

cat > /home/openclaw/.openclaw/keep-gateway.sh <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
while true; do
  openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789 >> /home/openclaw/.openclaw/gateway.log 2>&1 || true
  sleep 2
done
EOS
chmod +x /home/openclaw/.openclaw/keep-gateway.sh
chown openclaw:openclaw /home/openclaw/.openclaw/keep-gateway.sh

if ! pgrep -u openclaw -f "keep-gateway.sh" >/dev/null 2>&1; then
  su - openclaw -c 'nohup /home/openclaw/.openclaw/keep-gateway.sh >/dev/null 2>&1 &' || true
fi

if ! pgrep -u openclaw -f "dist/server.js" >/dev/null 2>&1; then
  BRIDGE_TOKEN_VALUE="${BRIDGE_TOKEN:-bridge-test-token}"
  su - openclaw -c "cd /opt/myclawgo-bridge && BRIDGE_PORT=18080 BRIDGE_TOKEN=${BRIDGE_TOKEN_VALUE} nohup node dist/server.js >> /home/openclaw/.openclaw/bridge.log 2>&1 </dev/null &" || true
fi

if [ "${1:-}" = "sleep-infinity" ]; then
  exec sleep infinity
fi

exec "$@"
