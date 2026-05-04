interface CloudInitParams {
  userId: string;
  registrationCallbackUrl: string;
  registrationToken: string;
}

export function buildCloudInit(params: CloudInitParams): string {
  const { userId, registrationCallbackUrl, registrationToken } = params;
  return `#!/bin/bash
set -e

# Create openclaw data directory
mkdir -p /home/openclaw/.openclaw
chown -R openclaw:openclaw /home/openclaw/.openclaw 2>/dev/null || true

# Ensure the snapshot's gateway service can boot before the control plane
# connects. Older snapshots may still miss --allow-unconfigured.
sed -i 's|ExecStart=.*openclaw gateway run.*|ExecStart=/usr/bin/openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789|' /etc/systemd/system/openclaw-gateway.service
systemctl daemon-reload

# Enable and start openclaw gateway.
systemctl enable openclaw-gateway
systemctl start openclaw-gateway

# Notify Control Plane (triggers bridge deployment)
PUBLIC_IP=$(curl -fsS --max-time 3 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 || curl -s -4 --max-time 5 --retry 2 --retry-delay 1 ifconfig.me)
REGISTER_BODY="{\\"publicIp\\": \\"$PUBLIC_IP\\"}"
curl -X POST "${registrationCallbackUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${registrationToken}" \\
  -d "$REGISTER_BODY" \\
  --retry 10 --retry-delay 10 --retry-connrefused || true
`;
}
