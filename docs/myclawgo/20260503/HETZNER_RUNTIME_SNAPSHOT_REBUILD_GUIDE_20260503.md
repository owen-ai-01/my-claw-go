# Hetzner Runtime Snapshot 重做指南

日期：2026-05-03

目的：重新制作 MyClawGo 用户 VPS 的 Hetzner Snapshot，让后续新创建的用户 VPS 使用当前正确的 OpenClaw Gateway 和 Bridge systemd 配置启动。

这个 Snapshot 只包含系统基础环境、Node.js、OpenClaw CLI、`openclaw` 系统用户和 systemd 服务文件。不包含用户数据、OpenRouter Key、Bridge Token、当前 Bridge 构建产物。Bridge 代码仍然由 Control Plane 在 VPS 注册回调时推送最新版本。

## 为什么需要重做

当前旧 Snapshot 能启动，但 systemd 配置已经不是最新标准：

- `openclaw-gateway.service` 需要带 `--allow-unconfigured --auth none` 启动。
- `myclawgo-bridge.service` 需要使用 `dist/server.js`，不是旧的 `dist/index.js`。
- 新 VPS 首次启动日志里不应该先出现 gateway 因配置缺失失败，再由 Control Plane 修正的过程。

当前代码里已经在 `cloud-init` 和 register 流程里加了兜底修复，即使旧 Snapshot 也能跑通。但重做 Snapshot 可以让首次启动更干净，减少无效重启和日志噪音。

## Snapshot 应包含什么

- Ubuntu 24.04
- Node.js 22.x
- 全局安装的 `openclaw`
- Linux 用户：`openclaw`
- 目录：`/home/openclaw/.openclaw`
- 目录：`/opt/myclawgo-bridge`
- 目录：`/etc/myclawgo`
- systemd 服务：`openclaw-gateway.service`
- systemd 服务：`myclawgo-bridge.service`

## Snapshot 不应包含什么

不要把任何密钥或用户数据写进 Snapshot：

- Hetzner API Token
- OpenRouter API Key
- Bridge Token
- `bridge.env`
- 用户的 `auth-profiles.json`
- 用户的 `openclaw.json`
- 项目的 `.env`

## 1. 创建模板 VPS

在 Hetzner Console 的 `myclawgo-runtime-01` 项目中：

1. 点击 Add Server。
2. Location 选择 `fsn1`。
3. Image 选择 `Ubuntu 24.04`。
4. Type 选择 `cx23`。
5. SSH Key 选择 `myclawgo-runtime`。
6. Firewall 选择 `myclawgo-user-vps-fw`。
7. Name 填：

```text
myclawgo-runtime-template-20260503
```

等待模板机进入 running 状态后，从 Control Plane SSH 登录：

```bash
ssh -i /home/openclaw/.ssh/myclawgo_runtime -o StrictHostKeyChecking=no root@<TEMPLATE_IP>
```

## 2. 安装基础包

在模板 VPS 上执行：

```bash
set -e

apt-get update
apt-get install -y curl ca-certificates gnupg sudo procps less vim nano bash
```

## 3. 安装 Node.js 22

在模板 VPS 上执行：

```bash
set -e

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

node --version
npm --version
```

预期结果：

- `node --version` 输出 `v22.x.x`。
- `npm --version` 有正常输出。

## 4. 安装 OpenClaw

使用当前已经验证过的 VPS Runtime OpenClaw 版本。

当前旧 Snapshot 上验证过的版本：

```bash
OPENCLAW_VERSION=2026.4.11
```

在模板 VPS 上执行：

```bash
set -e

npm install -g "openclaw@${OPENCLAW_VERSION}"
openclaw --version
```

预期结果：输出内容中包含安装的 OpenClaw 版本。

注意：不要在模板 VPS 上执行 `openclaw setup`。

## 5. 创建 openclaw 用户和目录

在模板 VPS 上执行：

```bash
set -e

id -u openclaw >/dev/null 2>&1 || useradd -m -s /bin/bash openclaw
mkdir -p /home/openclaw/.openclaw
mkdir -p /opt/myclawgo-bridge
mkdir -p /etc/myclawgo
chown -R openclaw:openclaw /home/openclaw /opt/myclawgo-bridge

su - openclaw -c "openclaw --version"
```

## 6. 创建 systemd 服务文件

在模板 VPS 上执行：

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

注意：

- 不要在模板 VPS 上 enable 这些服务。
- 不要在模板 VPS 上 start 这些服务。
- `bridge.env` 不应该存在于 Snapshot 中，它会在用户 VPS 注册时由 Control Plane 生成。

确认服务没有被 enable：

```bash
systemctl is-enabled openclaw-gateway.service || true
systemctl is-enabled myclawgo-bridge.service || true
```

预期输出可以是 `disabled`，或者非 enabled 状态；不应该是 `enabled`。

## 7. 可选验证

这一步只用于确认 OpenClaw 二进制和 gateway service 命令可用。验证后必须停止服务并 disable，避免把运行状态带进 Snapshot。

```bash
systemctl start openclaw-gateway.service
sleep 20
systemctl status openclaw-gateway.service --no-pager
curl -fsS http://127.0.0.1:18789/health || true
systemctl stop openclaw-gateway.service
systemctl disable openclaw-gateway.service || true
```

不要启动 `myclawgo-bridge.service`，因为 `/etc/myclawgo/bridge.env` 在模板机上刻意不存在。

## 8. Snapshot 前清理模板机

在模板 VPS 上执行：

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

退出 SSH：

```bash
exit
```

## 9. 创建 Snapshot

在 Hetzner Console 中：

1. 打开 `myclawgo-runtime-template-20260503`。
2. 进入 Snapshots。
3. 点击 Take Snapshot。
4. Snapshot 名称填写：

```text
myclawgo-runtime-v2-20260503
```

等待 Snapshot 创建完成。

## 10. 查询 Snapshot ID

在 Control Plane 上使用 `myclawgo-runtime-01` 项目的 Hetzner API Token 查询：

```bash
curl -s \
  -H "Authorization: Bearer <HETZNER_PROJECT_API_TOKEN>" \
  "https://api.hetzner.cloud/v1/images?type=snapshot" \
  | python3 -m json.tool
```

找到名称为下面这个值的 image：

```text
myclawgo-runtime-v2-20260503
```

记录它的数字 `id`，后面要填到 `HETZNER_PROJECTS[].snapshotId`。

## 11. 更新测试环境配置

在测试环境 `.env` 中，只更新 `HETZNER_PROJECTS` 里 `proj-01` 的 `snapshotId`：

```json
"snapshotId": <NEW_SNAPSHOT_ID>
```

示例：

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

然后重启测试环境服务：

```bash
cd /home/openclaw/project/my-claw-go
pm2 restart my-claw-go-test --update-env
```

## 12. 删除模板 VPS

确认 Snapshot 已经创建完成后，删除 `myclawgo-runtime-template-20260503`，避免继续产生服务器费用。

注意：不要删除刚刚创建的 Snapshot。

## 13. 用一次测试开通流程验证

重新走一次测试用户注册和支付流程，然后查询最新 runtimeHost：

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

SSH 到新建的用户 VPS，确认 systemd unit：

```bash
ssh -i /home/openclaw/.ssh/myclawgo_runtime -o StrictHostKeyChecking=no root@<NEW_USER_VPS_IP> \
  "systemctl cat openclaw-gateway myclawgo-bridge --no-pager"
```

预期结果：

- `openclaw-gateway.service` 使用 `--allow-unconfigured --auth none --bind loopback --port 18789`。
- `myclawgo-bridge.service` 使用 `ExecStart=/usr/bin/node dist/server.js`。
- 新 VPS 日志里不再出现因为缺少 `--allow-unconfigured` 导致的早期 gateway 启动失败。

检查 ready 状态：

```bash
curl -s \
  -H "Authorization: Bearer <BRIDGE_TOKEN>" \
  "http://<NEW_USER_VPS_IP>:18080/ready"
```

预期响应包含：

```json
{
  "ok": true
}
```

实际响应里还会包含 bridge 和 OpenClaw 的 readiness 明细。

## 后续维护说明

- Bridge 代码更新不需要重做 Snapshot。
- OpenClaw 版本升级需要重做 Snapshot。
- Node.js 大版本升级需要重做 Snapshot。
- systemd 服务文件变更稳定后，建议重做 Snapshot。
- 即使重做了 Snapshot，也建议保留代码里的 `cloud-init` 和 register 兜底逻辑，用来兼容旧 Snapshot 和降低运维风险。
