# Hetzner 手动配置操作指南（最终版）

> 版本：2026-04-26（更新：一用户一 VPS + 多项目 + 公网通信）  
> 用途：开发 Phase 2（自动购机）前，你需要在 Hetzner Cloud Console 完成这些操作。  
> Phase 1 只需完成"步骤 1–4"。

---

## 你需要做的事情汇总

| 步骤 | 操作 | 需要 Phase | 大约耗时 |
|------|------|-----------|---------|
| 1 | 为第一个 runtime 项目创建 API Token | Phase 2 前 | 2 分钟 |
| 2 | 上传 SSH 公钥 | Phase 2 前 | 2 分钟 |
| 3 | 创建 Firewall（公网访问规则） | Phase 2 前 | 5 分钟 |
| 4 | 确认 Control Plane 公网 IP | Phase 1 开始前 | 1 分钟 |
| 5 | 制作 Snapshot（强烈推荐，节省初始化时间） | Phase 2 前 | 30–60 分钟 |
| 6 | 填写 .env 环境变量 | Phase 2 前 | 5 分钟 |
| 7 | 申请配额提升 | 现在就做 | 5 分钟 |

**不再需要 Private Network**（改用公网 IP + 鉴权 Token 通信）。

---

## 架构前提说明

- **Control Plane**（SaaS 主机）：现有机器，公网 IP 固定
- **用户 VPS**：每个付费用户一台，统一在 **Falkenstein（fsn1）** 创建
- **机型**：Pro → cx23；Premium → cx33；Ultra → cx53
- **通信**：Control Plane 通过公网 IP 访问每台用户 VPS 的 Bridge（端口 18080）
- **多项目**：第一个项目名 `myclawgo-runtime-01`，满了再建 `myclawgo-runtime-02`

---

## 步骤 1：创建第一个 Runtime 项目 + API Token

### 1.1 创建 Hetzner 项目

1. 登录 [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. 左上角 → **New project**
3. 填写项目名：`myclawgo-runtime-01`
4. 点击 **Add project**

> 以后需要新增第二批用户 VPS 时，再建 `myclawgo-runtime-02`，操作完全相同。

### 1.2 在该项目下创建 API Token

1. 进入 `myclawgo-runtime-01` 项目
2. 左侧菜单 → **Security** → **API Tokens** 标签
3. 点击 **Generate API Token**
4. 填写：
   - **Description**：`myclawgo-provision-worker`
   - **Permissions**：**Read & Write**（必须）
5. 立即复制 Token（**只显示一次！**）

```
# 记录这个值，后续填入 .env
HETZNER_API_TOKEN_01 = <复制的 Token>
```

---

## 步骤 2：上传 SSH 公钥

**在你本机生成密钥对（如果没有）：**

```bash
ssh-keygen -t ed25519 -C "myclawgo-runtime" -f ~/.ssh/myclawgo_runtime
# 生成：
# ~/.ssh/myclawgo_runtime      ← 私钥，保留在本地
# ~/.ssh/myclawgo_runtime.pub  ← 公钥，上传到 Hetzner
```

**上传到 Hetzner 项目：**

1. `myclawgo-runtime-01` 项目 → **Security** → **SSH Keys**
2. 点击 **Add SSH Key**
3. 填写：
   - **Name**：`myclawgo-runtime`
   - **Public Key**：粘贴 `~/.ssh/myclawgo_runtime.pub` 全部内容
4. 点击 **Add SSH Key**

> **注意**：Hetzner Console 上传完成后只显示 Name 和 Fingerprint，**不显示 SSH Key ID**。  
> 需要通过 API 查询，运行以下命令（替换成步骤 1 的 Token）：

```bash
curl -s -H "Authorization: Bearer <你的API_TOKEN>" \
  https://api.hetzner.cloud/v1/ssh_keys | python3 -m json.tool
```

返回结果中找到你的 key，`id` 字段就是 SSH Key ID：

```json
{
  "ssh_keys": [
    {
      "id": 12345678,
      "name": "myclawgo-runtime",
      "fingerprint": "..."
    }
  ]
}
```

记录这个数字：

```
HETZNER_SSH_KEY_ID = <id 字段的数字>
```

---

## 步骤 3：创建 Firewall（公网访问规则）

Firewall 控制每台用户 VPS 允许哪些 IP 访问哪些端口。

### 3.1 在 `myclawgo-runtime-01` 项目下创建

1. 左侧菜单 → **Firewalls**
2. 点击 **Create Firewall**
3. **Name**：`myclawgo-user-vps-fw`

### 3.2 配置入站规则（Inbound Rules）

| 协议 | 端口 | 来源 | 说明 |
|------|------|------|------|
| TCP | 22 | Any IPv4（`0.0.0.0/0`） | SSH 登录 |
| TCP | 18080 | **Control Plane 公网 IP**（步骤 4 确认） | Bridge 访问（聊天路由） |

> 除以上两条外，**所有入站流量拒绝**（不要开任何其他端口）。  
> **SSH 用 Any IPv4** 即可，大多数人没有固定公网 IP，靠密钥登录保障安全（不开密码登录）。  
> 真正需要 IP 限制的是 18080 端口，防止用户直接绕过平台访问自己的 VPS。

### 3.3 配置出站规则（Outbound Rules）

- 保持默认：**允许所有出站**（用户容器需要访问 AI API）

### 3.4 创建并记录 Firewall ID

点击 **Create Firewall** → 记录显示的 **Firewall ID**（数字）

```
HETZNER_FIREWALL_ID = <Firewall ID>
```

---

## 步骤 4：确认 Control Plane 公网 IP

**Control Plane 的公网 IP 必须是固定的**（Hetzner 默认分配的公网 IP 在机器存活期间不变）。

在 SaaS 主机上运行（加 `-4` 强制返回 IPv4，避免返回 IPv6）：

```bash
curl -s -4 ifconfig.me
# 输出公网 IPv4，如：46.225.210.174
```

> **注意**：直接 `curl ifconfig.me` 可能返回 IPv6 地址（`2a01:...`），Firewall 规则里要填 IPv4，务必加 `-4` 参数。  
> 也可以直接在 Hetzner Console 服务器详情页看到公网 IPv4（更直接）。

记录这个 IP，步骤 3 的 Firewall 规则里 18080 端口的来源就填这个值：

```
CONTROL_PLANE_PUBLIC_IP = 46.225.210.174
```

> **如果 Control Plane 未来换机器**：只需通过 Hetzner API 更新 Firewall 规则一次，自动应用到所有用户 VPS（无需逐台操作）。

---

## 步骤 5：制作 Snapshot（强烈推荐）

Snapshot = 预配置好 Docker + OpenClaw 镜像的磁盘快照。  
用 Snapshot 创建新 VPS 可以把初始化时间从 **3–8 分钟**缩短到 **60–90 秒**。

### 5.1 临时购买一台模板机

在 `myclawgo-runtime-01` 项目下：

1. **Servers** → **Add Server**
2. 配置：
   - **Location**：`Falkenstein（fsn1）`
   - **Image**：`Ubuntu 24.04`
   - **Type**：`cx23`（随便一个小机型，做完就删）
   - **SSH Keys**：选择步骤 2 上传的密钥
   - **Firewall**：选择步骤 3 创建的 `myclawgo-user-vps-fw`
3. 点击创建

### 5.2 SSH 登录模板机，安装 Docker

```bash
ssh -i ~/.ssh/myclawgo_runtime root@<模板机公网 IP>
```

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 验证
docker --version
```

### 5.3 预拉 OpenClaw 镜像

```bash
# 替换为实际镜像名
docker pull myclawgo-openclaw:latest

# 验证
docker images | grep openclaw
```

> 如果镜像在私有 registry，先执行 `docker login`。

### 5.4 清理模板机

```bash
apt-get clean && rm -rf /var/lib/apt/lists/*
docker system prune -f
journalctl --vacuum-time=1s
truncate -s 0 /var/log/*.log 2>/dev/null || true
```

### 5.5 制作 Snapshot

1. Hetzner Console → `myclawgo-runtime-01` → 找到模板机
2. 进入服务器详情 → **Snapshots** 标签
3. 点击 **Take Snapshot**
4. 名称：`myclawgo-runtime-v1-20260426`
5. 等待完成（约 3–5 分钟）
6. 记录 **Snapshot ID**（数字）

```
HETZNER_SNAPSHOT_ID = <Snapshot ID>
```

### 5.6 删除模板机（节省费用）

Snapshot 完成后删掉模板机，只保留 Snapshot（费用极低）。

> Snapshot 费用：~€0.0119/GB/月，一个 cx23 的 snapshot 约 €0.30/月。

---

## 步骤 6：填写 .env 环境变量

在生产服务器的 `.env` 中追加：

```env
# ────────────────────────────────────────────────────────────────────────
# Hetzner 多项目配置（JSON 数组，新增项目直接在数组里追加）
# ────────────────────────────────────────────────────────────────────────
HETZNER_PROJECTS='[
  {
    "id": "proj-01",
    "name": "myclawgo-runtime-01",
    "apiToken": "<步骤 1 获取的 Token>",
    "region": "fsn1",
    "maxServers": 90,
    "sshKeyId": <步骤 2 的 SSH Key ID>,
    "firewallId": <步骤 3 的 Firewall ID>,
    "snapshotId": <步骤 5 的 Snapshot ID，没做就填 null>
  }
]'

# ────────────────────────────────────────────────────────────────────────
# Control Plane 公网 IP（用于 Firewall 规则管理）
# ────────────────────────────────────────────────────────────────────────
CONTROL_PLANE_PUBLIC_IP=<步骤 4 确认的 IP>

# ────────────────────────────────────────────────────────────────────────
# 注册 Token 签名密钥（cloud-init 回调用，自行生成）
# ────────────────────────────────────────────────────────────────────────
RUNTIME_REGISTER_TOKEN_SECRET=<运行下面命令生成>

# ────────────────────────────────────────────────────────────────────────
# Provision Worker 开关
# ────────────────────────────────────────────────────────────────────────
ENABLE_PROVISION_WORKER=true
PROVISION_WORKER_INTERVAL_MS=30000

# ────────────────────────────────────────────────────────────────────────
# VPS 生命周期（用户取消后的宽限期）
# ────────────────────────────────────────────────────────────────────────
VPS_GRACE_PERIOD_DAYS=7
VPS_DELETE_AFTER_DAYS=30
```

**生成随机密钥：**

```bash
openssl rand -hex 32
```

---

## 步骤 7：申请配额提升（现在就做）

**每个 Hetzner 项目默认 Server 上限约 10 台**，100 个用户就不够用了。  
**现在就申请**，不要等到快满了再申请（审批需要 1–2 个工作日）。

### 申请方式

1. 登录 Hetzner Console → 右上角头像 → **Support**
2. 发送支持邮件，使用以下模板：

```
Subject: Server quota increase request for project myclawgo-runtime-01

Hi Hetzner support team,

We are building MyClawGo (myclawgo.com), a SaaS platform where each 
paid subscriber gets a dedicated VPS (cx23/cx33/cx53) to run their 
personal AI workspace.

We would like to request an increase in the server quota for our 
project "myclawgo-runtime-01" from the default to 100 servers.

Use case: one cx23/cx33/cx53 server per paying user.
Expected growth: 50–100 paid users in the next 3–6 months.
Location: fsn1 (Falkenstein).

Thank you for your support.
```

3. 等待邮件回复（通常 1–2 个工作日批复到 100 台）

### 何时需要第二个项目

当 `myclawgo-runtime-01` 的服务器数量接近 90 台时：

1. 在 Hetzner Console 新建项目 `myclawgo-runtime-02`
2. 重复步骤 1–3（创建 API Token、SSH Key、Firewall）
3. 在 `.env` 的 `HETZNER_PROJECTS` 数组中追加新项目配置
4. 系统自动路由新用户到第二个项目

---

## 快速检查清单

完成以上步骤后核验：

- [ ] `myclawgo-runtime-01` 项目已创建
- [ ] API Token 已创建，权限为 Read & Write，已复制保存
- [ ] SSH 公钥已上传，有 SSH Key ID
- [ ] Firewall `myclawgo-user-vps-fw` 已创建：
  - [ ] 端口 22 对运维 IP 开放
  - [ ] 端口 18080 对 Control Plane 公网 IP 开放
  - [ ] 所有其他入站流量拒绝
- [ ] Control Plane 公网 IP 已确认
- [ ] Snapshot 已制作（可选），有 Snapshot ID
- [ ] `.env` 已填写所有变量（`HETZNER_PROJECTS` JSON + `CONTROL_PLANE_PUBLIC_IP` + `RUNTIME_REGISTER_TOKEN_SECRET`）
- [ ] 已向 Hetzner Support 发送配额提升申请

---

## 附：VPS 机型对照表

| 套餐 | 机型 | 规格 | 区域 | 月费（约） |
|------|------|------|------|----------|
| Pro | cx23 | 2 vCPU / 4 GB RAM / 40 GB SSD | fsn1 | ~€3.79 |
| Premium | cx33 | 4 vCPU / 8 GB RAM / 80 GB SSD | fsn1 | ~€7.52 |
| Ultra | cx53 | 16 vCPU / 32 GB RAM / 320 GB SSD | fsn1 | ~€26.90 |

> cx53 在 Nuremberg（nbg1）没有，**统一用 Falkenstein（fsn1）**。

---

## 附：与旧方案的主要变化

| 项目 | 旧方案（2026-04-22） | **新方案（最终版）** |
|------|-------------------|-------------------|
| 机型 | cx22/cx32/cx42 | **cx23/cx33/cx53** |
| 区域 | nbg1（纽伦堡） | **fsn1（Falkenstein）** |
| 通信方式 | Private Network（私网 IP） | **公网 IP + BRIDGE_TOKEN** |
| 项目数量 | 单项目 | **多项目（按需扩展）** |
| 用户隔离 | 多用户共享主机 | **一用户一 VPS** |
| Private Network | 必须配置 | **不需要** |
| 数据持久化 | 容器 Volume | **Hetzner Volume（独立磁盘）** |
