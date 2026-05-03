# Hetzner Runtime Snapshot Rebuild Guide

Date: 2026-05-03

Purpose: rebuild the MyClawGo user VPS snapshot so newly provisioned VPS instances boot with the current OpenClaw gateway and bridge systemd configuration.

This snapshot contains the OS, Node.js, OpenClaw CLI, `openclaw` system user, and systemd unit files. It does not contain user data, OpenRouter keys, bridge tokens, or the current bridge build. The control plane still deploys the latest bridge code during runtime registration.

## Why Rebuild

The current snapshot boots successfully, but its systemd files are older than the current runtime contract:

- `openclaw-gateway.service` should start with `--allow-unconfigured --auth none`.
- `myclawgo-bridge.service` should use `dist/server.js`, not `dist/index.js`.
- New VPS boot logs should not show initial gateway failures before the control plane corrects the unit files.

The application now has fallback fixes in cloud-init/register, but rebuilding the snapshot makes the first boot cleaner and removes avoidable retries.

## Target Snapshot Contents

- Ubuntu 24.04
- Node.js 22.x
- `openclaw` installed globally
- Linux user: `openclaw`
- Directory: `/home/openclaw/.openclaw`
- Directory: `/opt/myclawgo-bridge`
- Directory: `/etc/myclawgo`
- systemd unit: `openclaw-gateway.service`
- systemd unit: `myclawgo-bridge.service`

No secrets should be baked into the snapshot.

Do not put these into the snapshot:

- Hetzner API token
- OpenRouter API key
- Bridge token
- `bridge.env`
- user `auth-profiles.json`
- user `openclaw.json`
- project `.env`

## 1. Create Template VPS

In Hetzner Console, inside project `myclawgo-runtime-01`:

1. Add Server.
2. Location: `fsn1`.
3. Image: `Ubuntu 24.04`.
4. Type: `cx23`.
5. SSH Key: `myclawgo-runtime`.
6. Firewall: `myclawgo-user-vps-fw`.
7. Name: `myclawgo-runtime-template-20260503`.

Wait until the server is running, then SSH from the control plane:

```bash
ssh -i /home/openclaw/.ssh/myclawgo_runtime -o StrictHostKeyChecking=no root@<TEMPLATE_IP>
```

## 2. Install Base Packages

Run on the template VPS:

```bash
set -e

apt-get update
apt-get install -y curl ca-certificates gnupg sudo procps less vim nano bash
```

## 3. Install Node.js 22

Run on the template VPS:

```bash
set -e

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

node --version
npm --version
```

Expected:

- `node --version` is `v22.x.x`.
- `npm --version` is available.

## 4. Install OpenClaw

Use the OpenClaw version currently validated for the VPS runtime.

Current tested version from the existing runtime snapshot:

```bash
OPENCLAW_VERSION=2026.4.11
```

Run on the template VPS:

```bash
set -e

npm install -g "openclaw@${OPENCLAW_VERSION}"
openclaw --version
```

Expected output should include the selected OpenClaw version.

Do not run `openclaw setup` on the template VPS.

## 5. Create OpenClaw User And Directories

Run on the template VPS:

```bash
set -e

id -u openclaw >/dev/null 2>&1 || useradd -m -s /bin/bash openclaw
mkdir -p /home/openclaw/.openclaw
mkdir -p /opt/myclawgo-bridge
mkdir -p /etc/myclawgo
chown -R openclaw:openclaw /home/openclaw /opt/myclawgo-bridge

su - openclaw -c "openclaw --version"
```

## 6. Create Systemd Units

Run on the template VPS:

```bash
set -e

cat > /etc/systemd/system/openclaw-gateway.service <<'EOF'
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
User=openclaw
ExecStart=/usr/bin/openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789
Restart=always
RestartSec=5
WorkingDirectory=/home/openclaw
Environment=HOME=/home/openclaw
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/myclawgo-bridge.service <<'EOF'
[Unit]
Description=MyClawGo Bridge
After=network.target openclaw-gateway.service
Requires=openclaw-gateway.service

[Service]
User=openclaw
WorkingDirectory=/opt/myclawgo-bridge
EnvironmentFile=/etc/myclawgo/bridge.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl status openclaw-gateway.service --no-pager || true
systemctl status myclawgo-bridge.service --no-pager || true
```

Important:

- Do not enable these services on the template VPS.
- Do not start these services on the template VPS.
- `bridge.env` should not exist in the snapshot. It is generated during registration.

Confirm disabled state:

```bash
systemctl is-enabled openclaw-gateway.service || true
systemctl is-enabled myclawgo-bridge.service || true
```

Expected output can be `disabled` or `static`/non-enabled. It should not be `enabled`.

## 7. Optional Sanity Check

Only run this if you want to verify the gateway binary and unit command. Stop it afterwards before snapshot cleanup.

```bash
systemctl start openclaw-gateway.service
sleep 20
systemctl status openclaw-gateway.service --no-pager
curl -fsS http://127.0.0.1:18789/health || true
systemctl stop openclaw-gateway.service
systemctl disable openclaw-gateway.service || true
```

Do not start `myclawgo-bridge.service` on the template VPS because `/etc/myclawgo/bridge.env` is intentionally absent.

## 8. Clean Template Before Snapshot

Run on the template VPS:

```bash
set -e

systemctl stop openclaw-gateway.service || true
systemctl stop myclawgo-bridge.service || true
systemctl disable openclaw-gateway.service || true
systemctl disable myclawgo-bridge.service || true

rm -f /etc/myclawgo/bridge.env
rm -rf /home/openclaw/.openclaw/identity
rm -rf /home/openclaw/.openclaw/agents
rm -rf /home/openclaw/.openclaw/canvas
rm -rf /home/openclaw/.openclaw/workspace
find /home/openclaw/.openclaw -mindepth 1 -maxdepth 1 -type f -delete
chown -R openclaw:openclaw /home/openclaw/.openclaw

apt-get clean
rm -rf /var/lib/apt/lists/*
journalctl --vacuum-time=1s || true
truncate -s 0 /var/log/*.log 2>/dev/null || true
truncate -s 0 /var/log/*/*.log 2>/dev/null || true
rm -rf /tmp/* /var/tmp/*
history -c || true
```

Exit SSH:

```bash
exit
```

## 9. Create Snapshot

In Hetzner Console:

1. Open `myclawgo-runtime-template-20260503`.
2. Go to Snapshots.
3. Take Snapshot.
4. Name:

```text
myclawgo-runtime-v2-20260503
```

Wait until the snapshot completes.

## 10. Find Snapshot ID

On the control plane, use the Hetzner project API token for `myclawgo-runtime-01`.

```bash
curl -s \
  -H "Authorization: Bearer <HETZNER_PROJECT_API_TOKEN>" \
  "https://api.hetzner.cloud/v1/images?type=snapshot" \
  | python3 -m json.tool
```

Find the image whose name is:

```text
myclawgo-runtime-v2-20260503
```

Record its numeric `id`.

## 11. Update Test Environment Config

In the test environment `.env`, update only the `snapshotId` for `proj-01` inside `HETZNER_PROJECTS`:

```json
"snapshotId": <NEW_SNAPSHOT_ID>
```

Example:

```env
HETZNER_PROJECTS='[
  {
    "id": "proj-01",
    "name": "myclawgo-runtime-01",
    "apiToken": "<existing token>",
    "region": "fsn1",
    "maxServers": 90,
    "sshKeyId": 111379580,
    "firewallId": 10891954,
    "snapshotId": <NEW_SNAPSHOT_ID>
  }
]'
```

Then restart the test app:

```bash
cd /home/openclaw/project/my-claw-go
pm2 restart my-claw-go-test --update-env
```

## 12. Delete Template VPS

After confirming the snapshot exists, delete `myclawgo-runtime-template-20260503` to avoid unnecessary server charges.

Do not delete the snapshot.

## 13. Verify With One Test Provision

Create one new test paid user flow, then check:

```bash
set -a
. /home/openclaw/project/my-claw-go/.env
set +a

psql "$DATABASE_URL" -P pager=off -c '
SELECT id, user_id, status, public_ip, hetzner_server_id, created_at, updated_at
FROM "runtimeHost"
ORDER BY created_at DESC
LIMIT 3;
'
```

SSH into the new VPS and confirm the systemd units:

```bash
ssh -i /home/openclaw/.ssh/myclawgo_runtime -o StrictHostKeyChecking=no root@<NEW_USER_VPS_IP> \
  "systemctl cat openclaw-gateway myclawgo-bridge --no-pager"
```

Expected:

- `openclaw-gateway.service` uses `--allow-unconfigured --auth none --bind loopback --port 18789`.
- `myclawgo-bridge.service` uses `ExecStart=/usr/bin/node dist/server.js`.
- No early gateway failure caused by missing `--allow-unconfigured`.

Check readiness:

```bash
curl -s \
  -H "Authorization: Bearer <BRIDGE_TOKEN>" \
  "http://<NEW_USER_VPS_IP>:18080/ready"
```

Expected response:

```json
{
  "ok": true
}
```

The exact response includes bridge and OpenClaw readiness details.

## Notes

- Bridge code changes do not require rebuilding this snapshot.
- OpenClaw version changes do require rebuilding this snapshot.
- Node.js major version changes do require rebuilding this snapshot.
- systemd unit changes should be baked into a new snapshot once stable.
- Keep the cloud-init/register fallback fixes in code even after rebuilding; they protect old snapshots and reduce operational risk.
