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

# Enable and start openclaw gateway
systemctl enable openclaw-gateway
systemctl start openclaw-gateway
sleep 3

# Notify Control Plane (triggers bridge deployment)
PUBLIC_IP=$(curl -s -4 --retry 5 --retry-delay 2 ifconfig.me)
REGISTER_BODY="{\\"publicIp\\": \\"$PUBLIC_IP\\"}"
curl -X POST "${registrationCallbackUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${registrationToken}" \\
  -d "$REGISTER_BODY" \\
  --retry 5 --retry-delay 5 || true
`;
}
