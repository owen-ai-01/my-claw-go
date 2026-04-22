# Hetzner 手动配置操作指南

> 版本：2026-04-22  
> 用途：开发 Phase 3（自动购机）前，你需要在 Hetzner Cloud Console 完成这些手动配置。  
> Phase 1（解耦支付）和 Phase 2（多机调度）开发阶段，只需要完成"准备事项"和"步骤 1–3"。

---

## 需要你做的事情汇总

| 步骤 | 操作 | 需要 Phase | 大约耗时 |
|------|------|-----------|---------|
| 1 | 创建 Hetzner API Token | Phase 3 | 2 分钟 |
| 2 | 上传 SSH 公钥 | Phase 2 开始前 | 2 分钟 |
| 3 | 创建 Private Network | Phase 2 开始前 | 3 分钟 |
| 4 | 创建 Firewall | Phase 2 开始前 | 5 分钟 |
| 5 | 确认现有服务器的私网 IP | Phase 2 开始前 | 5 分钟 |
| 6 | 制作 Snapshot（可选但强烈推荐） | Phase 3 开始前 | 30–60 分钟 |
| 7 | 填写 .env 环境变量 | Phase 3 开始前 | 5 分钟 |

---

## 准备事项：登录 Hetzner Cloud Console

访问：https://console.hetzner.cloud/

选择你的项目（或创建一个专用项目，如 `myclawgo-production`）。

> **强烈建议为 runtime host 单独创建一个 Hetzner 项目**，原因：
> - 隔离资源，方便按项目限额申请
> - 账单清晰，runtime 费用独立核算
> - API Token 权限隔离

---

## 步骤 1：创建 API Token

**用途**：让 MyClawGo 的 Provision Worker 通过 API 自动购买和删除服务器。

### 操作步骤

1. 进入 Hetzner Cloud Console → 选择你的项目
2. 左侧菜单 → **Security**（安全）
3. 点击 **API Tokens** 标签
4. 点击右上角 **Generate API Token**
5. 填写：
   - **Description**：`myclawgo-provision-worker`
   - **Permissions**：选 **Read & Write**（必须是读写权限）
6. 点击 **Generate API Token**
7. **立即复制 Token**（只显示一次！关闭后无法再看到）

### 你需要记录的值

```
HETZNER_API_TOKEN=<复制的 Token 值>
```

> **安全注意**：这个 Token 有创建/删除服务器的权限，请妥善保管，不要提交到 Git。

---

## 步骤 2：上传 SSH 公钥

**用途**：让你（和部署脚本）能够 SSH 登录自动创建的 runtime host。

### 操作步骤

**先在你的机器上生成 SSH 密钥对（如果还没有的话）：**

```bash
ssh-keygen -t ed25519 -C "myclawgo-runtime-host" -f ~/.ssh/myclawgo_runtime
# 生成两个文件：
# ~/.ssh/myclawgo_runtime       （私钥，保留在本地）
# ~/.ssh/myclawgo_runtime.pub   （公钥，上传到 Hetzner）
```

**上传公钥到 Hetzner：**

1. Hetzner Cloud Console → **Security** → **SSH Keys** 标签
2. 点击右上角 **Add SSH Key**
3. 填写：
   - **Name**：`myclawgo-runtime-deploy`
   - **Public Key**：粘贴 `~/.ssh/myclawgo_runtime.pub` 的内容
4. 点击 **Add SSH Key**
5. 记录显示的 **SSH Key ID**（数字，如 `12345678`）

### 你需要记录的值

```
HETZNER_RUNTIME_SSH_KEY_IDS=<SSH Key ID>
```

> 如果有多个 SSH Key，用逗号分隔：`HETZNER_RUNTIME_SSH_KEY_IDS=12345678,87654321`

---

## 步骤 3：创建 Private Network

**用途**：让 control plane 和所有 runtime host 通过私网通信，不走公网，更安全、更快。

### 操作步骤

1. Hetzner Cloud Console → 左侧菜单 → **Networks**
2. 点击右上角 **Create Network**
3. 填写：
   - **Name**：`myclawgo-runtime-network`
   - **Network Zone**：选 `eu-central`（如果你的服务器在 nbg1/hel1/fsn1 区域）
   - **IP Range**：`10.0.0.0/24`（最多 254 台服务器）
4. 点击 **Create Network**
5. 记录显示的 **Network ID**（数字，如 `3456789`）

### 把现有的 Control Plane 服务器加入这个私有网络

1. 进入你的 Control Plane 服务器详情页
2. 点击 **Networks** 标签
3. 点击 **Attach Network**
4. 选择刚才创建的 `myclawgo-runtime-network`
5. 填写 **IP Address**：`10.0.0.1`（分配给 control plane）
6. 点击 **Attach**

> 加入私网后，control plane 服务器会有一个新的网络接口，私网 IP 为 `10.0.0.1`。

### 验证私网 IP 生效

SSH 到 control plane 服务器，运行：

```bash
ip addr show
# 应该能看到 eth1（或 ens10）接口有 10.0.0.1 的 IP 地址
```

### 你需要记录的值

```
HETZNER_RUNTIME_NETWORK_ID=<Network ID>
# Control Plane 私网 IP（写死在 runtimeHost 记录中）：10.0.0.1
```

---

## 步骤 4：创建 Firewall

**用途**：给 runtime host 设置安全规则，只允许私网流量进入（不对公网暴露用户容器）。

### 操作步骤

1. Hetzner Cloud Console → 左侧菜单 → **Firewalls**
2. 点击右上角 **Create Firewall**
3. 填写 **Name**：`myclawgo-runtime-host-fw`
4. 配置入站规则（Inbound Rules）：

   | 协议 | 端口 | 来源 IP | 说明 |
   |------|------|---------|------|
   | TCP | 22 | `0.0.0.0/0` 或你的运维 IP | SSH 登录 |
   | TCP | Any | `10.0.0.0/24` | 私网所有流量（supply control plane 访问） |

   > **重要**：**不要**开放 18001–19000 端口到公网，这些是容器 bridge 端口，只允许私网访问。

5. 配置出站规则（Outbound Rules）：
   - 允许所有出站流量（容器内需要访问 OpenRouter API 等外部服务）
   - Hetzner 默认出站全放行，无需额外配置

6. 点击 **Create Firewall**
7. 记录显示的 **Firewall ID**（数字，如 `5678901`）

### 你需要记录的值

```
HETZNER_RUNTIME_FIREWALL_IDS=<Firewall ID>
```

---

## 步骤 5：确认现有服务器的信息（用于 Phase 1 手动插入 DB 记录）

**用途**：Phase 1 需要手动在数据库中插入当前机器作为第一台 runtime host。

### 需要确认的信息

SSH 到你的现有服务器，运行以下命令：

```bash
# 查看私网 IP（如果已经加入 Private Network）
ip addr show eth1 | grep 'inet ' | awk '{print $2}'
# 预期输出：10.0.0.1/24

# 查看公网 IP
curl -s ifconfig.me

# 查看机型（通过 Hetzner API 或在 Console 查看）
# Hetzner Console → 你的服务器详情页 → 右侧 "Server type" 字段

# 查看 Hetzner Server ID（Console URL 里的数字，如 https://console.hetzner.cloud/projects/xxx/servers/12345678）
```

### 你需要记录的值

```
# 现有 Control Plane / Runtime Host 信息（Phase 1 插入 DB 用）
EXISTING_HOST_HETZNER_SERVER_ID=<Hetzner 服务器 ID>
EXISTING_HOST_SERVER_TYPE=cx33          # 按实际机型填，如 cx33/cx42/cpx41
EXISTING_HOST_REGION=nbg1              # nbg1 / hel1 / fsn1
EXISTING_HOST_PRIVATE_IP=10.0.0.1     # 私网 IP（加入 Private Network 后）
EXISTING_HOST_PUBLIC_IP=<公网 IP>
```

### 根据机型计算 Allocatable 资源

| 机型 | Total CPU | Total RAM | Total Disk | Allocatable CPU (×0.8) | Allocatable RAM (×0.8) | Allocatable Disk (×0.8) |
|------|-----------|-----------|------------|----------------------|----------------------|------------------------|
| cx22 | 2 | 4 GB | 40 GB | 1 | 3.2 GB (3276 MB) | 32 GB |
| cx32 | 4 | 8 GB | 80 GB | 3 | 6.4 GB (6553 MB) | 64 GB |
| cx42 | 8 | 16 GB | 160 GB | 6 | 12.8 GB (13107 MB) | 128 GB |
| cx52 | 16 | 32 GB | 320 GB | 12 | 25.6 GB (26214 MB) | 256 GB |
| cpx41 | 8 | 16 GB | 240 GB | 6 | 13107 MB | 192 GB |
| cx33 | 2 | 8 GB | 80 GB | 1 | 6.4 GB (6553 MB) | 64 GB |

---

## 步骤 6：制作 Snapshot（强烈推荐）

**用途**：用 snapshot 代替基础镜像，让自动购机的新服务器初始化时间从 3–8 分钟缩短到 60–90 秒。

### 6.1 准备一台"模板机器"

**推荐方式**：使用已有的 runtime host 的复制，或单独买一台临时机（用完即删）。

购买一台 cx42（Ubuntu 24.04）：
1. Hetzner Console → **Servers** → **Add Server**
2. 选择：
   - **Location**：nbg1（和你的 control plane 同区域）
   - **Image**：Ubuntu 24.04
   - **Type**：CX42（和你要自动购买的机型一致）
   - **SSH Keys**：选择步骤 2 上传的密钥
   - **Firewall**：选择步骤 4 创建的 Firewall
   - **Network**：选择步骤 3 创建的 Private Network

### 6.2 在模板机器上执行初始化

SSH 登录到模板机器：

```bash
ssh -i ~/.ssh/myclawgo_runtime root@<模板机器公网 IP>
```

**安装 Docker：**

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker

# 验证
docker --version
# 预期：Docker version 27.x.x 或更新
```

**预拉 OpenClaw 镜像：**（这是 snapshot 最大的价值，避免每台新机重复下载）

```bash
# 把 {IMAGE_NAME} 替换成你的实际 OpenClaw 镜像名
docker pull {MYCLAWGO_OPENCLAW_IMAGE}

# 验证镜像已拉取
docker images | grep openclaw
```

> 如果你的 OpenClaw 镜像在私有 registry 需要登录，先执行 `docker login`。

**创建目录结构：**

```bash
mkdir -p /etc/host-agent
mkdir -p /runtime-data/users
chmod 750 /runtime-data

# 为 openclaw 容器用户创建（uid 1001）
# 实际由 host-agent 在创建容器时按需创建，此处可跳过
```

**安装 host-agent（Phase 2 开发完成后执行此步骤）：**

```bash
# 下载最新 host-agent 二进制
curl -fsSL https://myclawgo.com/downloads/host-agent-linux-amd64 -o /usr/local/bin/myclawgo-host-agent
chmod +x /usr/local/bin/myclawgo-host-agent

# 创建 systemd service 文件
cat > /etc/systemd/system/myclawgo-host-agent.service <<'EOF'
[Unit]
Description=MyClawGo Host Agent
After=docker.service
Requires=docker.service

[Service]
EnvironmentFile=/etc/host-agent/env
ExecStart=/usr/local/bin/myclawgo-host-agent
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
# 注意：不要 enable 或 start，cloud-init 会做这一步
```

**清理临时文件（确保 snapshot 干净）：**

```bash
# 清理 apt 缓存
apt-get clean
rm -rf /var/lib/apt/lists/*

# 清理 docker build cache
docker system prune -f

# 清理日志
journalctl --vacuum-time=1s
truncate -s 0 /var/log/*.log 2>/dev/null || true

# 清理 SSH known_hosts（新机器不应带有旧连接记录）
rm -f ~/.ssh/known_hosts
```

### 6.3 制作 Snapshot

1. 在 Hetzner Console → 找到模板机器
2. 点击机器 → **Snapshots** 标签
3. 点击 **Take Snapshot**
4. 填写名称：`myclawgo-runtime-host-v1-20260422`
5. 等待 Snapshot 完成（通常 2–5 分钟）
6. 在 Snapshot 列表中记录 **Snapshot ID**（数字）

### 6.4 删除模板机器（节省费用）

Snapshot 完成后，删除模板机器：
1. Hetzner Console → Servers → 找到模板机器
2. 点击右上角三点菜单 → **Delete**
3. 确认删除

### 你需要记录的值

```
HETZNER_RUNTIME_SNAPSHOT_ID=<Snapshot ID>
```

> **Snapshot 费用**：按快照大小计费，约 €0.0119/GB/月。一个 cx42 的快照约 25–40 GB，月费约 €0.30–0.48，可忽略不计。

---

## 步骤 7：填写环境变量

在 `/home/openclaw/project/my-claw-go-online/.env` 中追加以下内容：

```env
# ==========================================================================
# Hetzner 自动购机配置（Phase 3）
# ==========================================================================

# Hetzner Cloud API Token（Read & Write 权限）
HETZNER_API_TOKEN=<步骤 1 获取的 Token>

# Runtime Host 机型（推荐 cx42）
HETZNER_RUNTIME_SERVER_TYPE=cx42

# 区域（nbg1=纽伦堡 / hel1=赫尔辛基 / fsn1=芬斯塔尔本）
HETZNER_RUNTIME_LOCATION=nbg1

# Snapshot ID（步骤 6 获取，留空则用基础镜像但速度慢很多）
HETZNER_RUNTIME_SNAPSHOT_ID=<步骤 6 获取的 ID>

# Private Network ID（步骤 3 获取）
HETZNER_RUNTIME_NETWORK_ID=<步骤 3 获取的 ID>

# Firewall ID（步骤 4 获取）
HETZNER_RUNTIME_FIREWALL_IDS=<步骤 4 获取的 ID>

# SSH Key ID（步骤 2 获取，多个用逗号分隔）
HETZNER_RUNTIME_SSH_KEY_IDS=<步骤 2 获取的 ID>

# Host Agent 鉴权 Secret（自行生成，所有 runtime host 和 control plane 共用）
HETZNER_RUNTIME_AGENT_SECRET=<运行下面命令生成>

# 注册 Token 签名密钥（自行生成）
HETZNER_RUNTIME_REGISTER_TOKEN_SECRET=<运行下面命令生成>

# ==========================================================================
# Provision Worker 开关（Phase 1 需要）
# ==========================================================================
ENABLE_PROVISION_WORKER=true
```

**生成随机密钥：**

```bash
# 生成 HETZNER_RUNTIME_AGENT_SECRET
openssl rand -hex 32

# 生成 HETZNER_RUNTIME_REGISTER_TOKEN_SECRET
openssl rand -hex 32
```

---

## 步骤 7 完成后告诉我的信息

当你完成以上步骤后，把以下信息提供给我，我就可以开始开发：

```
# Hetzner 配置
HETZNER_API_TOKEN=                    ✅ 已获取
HETZNER_RUNTIME_NETWORK_ID=           ✅ 已获取
HETZNER_RUNTIME_FIREWALL_IDS=         ✅ 已获取
HETZNER_RUNTIME_SSH_KEY_IDS=          ✅ 已获取
HETZNER_RUNTIME_SNAPSHOT_ID=          ✅ 已获取（可选）

# 现有服务器信息（Phase 1 插入 DB 用）
现有服务器 Hetzner Server ID=
现有服务器机型=
现有服务器私网 IP（加入 Private Network 后）=
现有服务器公网 IP=

# 确认已生成并填入 .env
HETZNER_RUNTIME_AGENT_SECRET=         ✅ 已填入
HETZNER_RUNTIME_REGISTER_TOKEN_SECRET= ✅ 已填入
ENABLE_PROVISION_WORKER=true          ✅ 已填入
```

---

## 附：常见问题

### Q1：一定要用 Hetzner 吗？

现阶段是的。Hetzner 有几个关键优势：
- API 成熟且简洁（比 AWS 简单很多）
- 价格很有竞争力（cx42 约 €14.99/月）
- Private Network 免费
- 在欧洲区域延迟低（你的主站 VPS 应该也在 Hetzner）

后续如果有其他云需求，可以把 `src/lib/hetzner/client.ts` 替换为其他 provider。

### Q2：Hetzner 项目默认配额是多少？

Hetzner 项目默认服务器数量上限约 10 台。如果你需要更多，需要联系 Hetzner 支持申请提高配额。

**申请方式**：登录 Hetzner Console → 右上角 → Support → 发邮件说明用途和需要的配额数量。

建议在开始自动购机功能前，先把配额提升到 50 台（对于 50 个付费用户场景完全够用）。

### Q3：Snapshot 价格怎么算？

按快照大小收费，约 €0.0119/GB/月。

一个 cx42 的完整 snapshot（含 Docker 和预拉镜像）约 25–40 GB，月费约 €0.30–0.48。完全可以接受。

### Q4：Private Network 费用？

Hetzner Private Network 本身免费。同一 Private Network 内的流量也免费（不计入流量配额）。

### Q5：API Token 如果泄露了怎么办？

立即登录 Hetzner Console → Security → API Tokens → 删除泄露的 Token → 重新生成 → 更新 `.env`。

### Q6：不需要 Snapshot 的情况

如果你不介意新用户等 3–8 分钟（基础镜像安装 Docker + 下载镜像），可以跳过步骤 6，将 `HETZNER_RUNTIME_SNAPSHOT_ID` 留空，代码会自动使用 `ubuntu-24.04` 基础镜像。

### Q7：现有机器需要加入 Private Network 吗？

**必须加入**。否则 control plane 无法通过私网访问新购买的 runtime host 上的 host-agent。

加入步骤见"步骤 3：把现有的 Control Plane 服务器加入这个私有网络"。

---

## 快速检查清单

完成所有步骤后，按以下清单核验：

- [ ] Hetzner Console 中可以看到 API Token `myclawgo-provision-worker`
- [ ] SSH Key 已上传，有 Key ID
- [ ] Private Network `myclawgo-runtime-network`（`10.0.0.0/24`）已创建，有 Network ID
- [ ] 现有 control plane 服务器已加入 Private Network，私网 IP 为 `10.0.0.1`
- [ ] Firewall `myclawgo-runtime-host-fw` 已创建，已配置私网全放行 + SSH，有 Firewall ID
- [ ] Snapshot 已制作（可选），有 Snapshot ID
- [ ] `.env` 中已填写所有上述 ID 和生成的 Secret
- [ ] SSH 到现有服务器，`ip addr show` 能看到 `10.0.0.1` 私网 IP
