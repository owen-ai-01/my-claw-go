# 最终方案：一用户一 VPS（多项目 Hetzner + 公网通信）

> 版本：2026-04-26 v3  
> 定位：可直接开发的技术方案，包含架构决策、DB 设计、代码改造清单、两阶段开发计划。

---

## 目录

1. [最终架构概述](#1-最终架构概述)
2. [机型规格确认](#2-机型规格确认)
3. [多项目 Hetzner 管理策略](#3-多项目-hetzner-管理策略)
4. [公网通信安全模型](#4-公网通信安全模型)
5. [VPS 生命周期](#5-vps-生命周期)
6. [数据库表设计（4 张新表）](#6-数据库表设计4-张新表)
7. [Provision 完整流程](#7-provision-完整流程)
8. [必须改造的代码（单机假设）](#8-必须改造的代码单机假设)
9. [Phase 1：拆单机假设（约 1 周）](#9-phase-1拆单机假设约-1-周)
10. [Phase 2：自动购机上线（约 1 周）](#10-phase-2自动购机上线约-1-周)
11. [环境变量清单](#11-环境变量清单)
12. [异常处理策略](#12-异常处理策略)

---

## 1. 最终架构概述

```
用户支付成功
    ↓
写入 runtimeProvisionJob（异步，不阻塞 webhook）
    ↓
Provision Worker 选择有余量的 Hetzner 项目
    ↓
调用 Hetzner API 创建 VPS（指定机型 + fsn1 + SSH Key + Firewall）
cloud-init 启动 OpenClaw + Bridge，数据目录在 VPS 自带 SSD 上
    ↓
VPS 启动后回调 /api/internal/runtime/register
    ↓
写入 runtimeHost + runtimeAllocation（status = ready）
    ↓
发邮件通知用户"工作区已就绪"
```

**无 Private Network**：所有通信走公网 IP，Control Plane 通过 BRIDGE_TOKEN 鉴权访问每台用户 VPS。

**无独立 Volume**：cx23/cx33/cx53 自带 SSD 容量充足，直接用本地磁盘存用户数据。

**无 Docker**：每台 VPS 专属一个用户，不需要容器隔离。OpenClaw + Bridge 直接作为 systemd 服务运行在 VPS 上，更简单、更省内存（省去 Docker daemon ~150MB 开销）。

---

## 2. 机型规格确认

| 套餐 | 机型 | 规格（自带 SSD） | 区域 | 月费（约） |
|------|------|----------------|------|----------|
| Pro（$29.90/月） | **cx23** | 2 vCPU / 4 GB RAM / **40 GB SSD** | fsn1 | ~€3.79 |
| Premium（$59.90/月） | **cx33** | 4 vCPU / 8 GB RAM / **80 GB SSD** | fsn1 | ~€7.52 |
| Ultra（$199.90/月） | **cx53** | 16 vCPU / 32 GB RAM / **320 GB SSD** | fsn1 | ~€26.90 |

> **为什么固定 Falkenstein（fsn1）**：cx53 在 Nuremberg（nbg1）无货，统一用 fsn1 保证所有套餐一致。

**VPS 成本占订阅收入比：**
- Pro: ~12.7%，Premium: ~12.6%，Ultra: ~13.5%

---

## 3. 多项目 Hetzner 管理策略

### 为什么需要多项目

Hetzner 每个项目默认 Server 上限约 10–25 台。100 个用户 = 100 台 VPS，必须分散在多个项目。

### 项目命名规则

```
myclawgo-runtime-01    ← 第一批用户（1–90 台）
myclawgo-runtime-02    ← 第二批用户（91–180 台）
...
```

每个项目上限设为 **90 台**（申请 100 配额后留 10 台 buffer）。

### 选项目策略

```
找第一个 usedServers < maxServers 的 active 项目
如果全满 → 管理员告警，暂停自动购机，等待新项目加入
```

新增项目时只需在 `.env` 的 `HETZNER_PROJECTS` 数组追加一条记录，无需重启服务。

---

## 4. 公网通信安全模型

### Control Plane → 用户 VPS 通信路径

```
Control Plane（公网 IP: A.B.C.D）
    ↓ HTTP + Authorization: Bearer {per-VPS bridgeToken}
用户 VPS（公网 IP: X.X.X.X，端口 18080）
```

### Hetzner Firewall 规则（应用到所有用户 VPS）

| 方向 | 协议 | 端口 | 来源 | 用途 |
|------|------|------|------|------|
| 入站 | TCP | 22 | 运维固定 IP | SSH 登录 |
| 入站 | TCP | 18080 | Control Plane 公网 IP | Bridge 聊天路由 |
| 入站 | 其他所有 | — | — | **拒绝** |
| 出站 | 所有 | — | 0.0.0.0/0 | OpenClaw 访问 AI API |

### 双重鉴权

1. **Firewall IP 白名单**：网络层拦截非 Control Plane 请求
2. **per-VPS Bridge Token**：每台 VPS 生成独立 token，`Authorization: Bearer xxx`，应用层防伪造

### Control Plane IP 变更处理

```ts
// 一次 API 调用更新 Firewall，自动应用到使用该 Firewall 的所有 VPS
await hetznerApi(token).firewalls.setRules(firewallId, newRules);
```

---

## 5. VPS 生命周期

### 5.1 创建（用户首次支付）

```
支付成功（Stripe invoice.paid）
    ↓
写入 runtimeProvisionJob（status: pending）
    ↓
Provision Worker 购机 → cloud-init 初始化
    ↓
VPS ready → 发邮件通知用户
```

### 5.2 用户取消订阅 / 订阅到期

**到期即关机，7 天内可恢复，7 天后彻底删除。**

```
订阅到期（Stripe customer.subscription.deleted 或 current_period_end 过期）
    ↓
立即：poweroff VPS（关机，数据保留在 VPS 自带 SSD 上）
发邮件："您的工作区已暂停。7 天内续订即可恢复所有数据。"
    ↓
7 天后无续订：delete VPS（彻底删除，数据不可恢复）
发邮件："您的工作区已永久关闭。"
```

**数据保留期成本**：VPS 关机后 Hetzner 仍按正常价格计费（服务器资源仍分配给你）。  
7 天保留期成本：Pro ~€0.88，Premium ~€1.75，Ultra ~€6.27。这是平台承担的用户关怀成本。

### 5.3 用户 7 天内重新订阅

```
用户续订（Stripe invoice.paid）
    ↓
runtimeHost.status = stopped → 执行 poweron
    ↓
VPS 重新开机（约 30 秒）→ 更新 status = ready
历史对话、Agent 配置全部恢复（数据在 VPS 的 SSD 上）
    ↓
发邮件："您的工作区已恢复。"
```

### 5.4 套餐升级

直接使用 Hetzner **resize API**，无需买新机或迁移数据：

```
用户升级 Pro → Premium（Stripe 处理差价）
    ↓
poweroff VPS
    ↓
调用 Hetzner API: POST /servers/{id}/actions/change_type
  body: { server_type: "cx33", upgrade_disk: true }
    ↓
约 1–3 分钟完成 → poweron VPS
    ↓
更新 runtimeHost.serverType + runtimeHost.plan
```

> `upgrade_disk: true` 会同步扩大 SSD（Pro 40GB → Premium 80GB），数据全程保留，无迁移风险。

### 5.5 套餐降级

Hetzner **不支持 resize 降低机型**（SSD 无法缩小）。降级需要买新机：

```
用户降级 Premium → Pro
    ↓
购买新 cx23 VPS（cloud-init 启动空机）
    ↓
rsync 旧机数据到新机（通过内部脚本或 ssh pipe）
    ↓
删除旧 cx33 VPS
    ↓
更新 runtimeAllocation.bridgeBaseUrl
```

> **实际建议**：初期可以先不支持降级（用户只能取消重订），等用户量上来再实现。

### 5.6 VPS 完整状态机

```
not_provisioned
    → pending          （写入 provision job）
    → buying_vps       （Hetzner API 调用中）
    → waiting_init     （VPS 已购买，等待 cloud-init 回调）
    → ready            （cloud-init 完成，bridge 可用）
    → stopping         （订阅到期，正在 poweroff）
    → stopped          （已关机，7 天数据保留期）
    → deleting         （7 天后，正在删除）
    → deleted          （彻底清理完毕）
    → failed           （任意步骤失败，需人工介入）
```

---

## 6. 数据库表设计（4 张新表）

### 6.1 `hetznerProject`

管理多个 Hetzner 项目，是多项目支持的核心。

```ts
export const hetznerProject = pgTable('hetznerProject', {
  id: text('id').primaryKey().$defaultFn(generateId),
  name: text('name').notNull(),                          // myclawgo-runtime-01
  apiToken: text('apiToken').notNull(),                  // 加密存储
  region: text('region').notNull().default('fsn1'),
  maxServers: integer('maxServers').notNull().default(90),
  sshKeyId: integer('sshKeyId').notNull(),
  firewallId: integer('firewallId').notNull(),
  snapshotId: integer('snapshotId'),                     // 可选，加速初始化
  status: text('status').notNull().default('active'),    // active | full | disabled
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

### 6.2 `runtimeHost`

每行 = 一台用户专属 VPS，与用户 1:1。无独立 Volume，数据在 VPS 自带 SSD。

```ts
export const runtimeHost = pgTable('runtimeHost', {
  id: text('id').primaryKey().$defaultFn(generateId),
  userId: text('userId').unique().references(() => user.id),
  projectId: text('projectId').references(() => hetznerProject.id),
  hetznerServerId: text('hetznerServerId'),              // Hetzner Server ID
  name: text('name').notNull(),                          // myclawgo-user-{userId[:8]}
  plan: text('plan').notNull(),                          // pro | premium | ultra
  serverType: text('serverType').notNull(),              // cx23 | cx33 | cx53
  region: text('region').notNull().default('fsn1'),
  publicIp: text('publicIp'),
  bridgeBaseUrl: text('bridgeBaseUrl'),                 // http://{publicIp}:18080
  bridgeToken: text('bridgeToken'),                     // 每台 VPS 独立 token
  status: text('status').notNull().default('pending'),
  // pending | buying_vps | waiting_init | ready | stopping | stopped | deleting | deleted | failed
  stoppedAt: timestamp('stoppedAt'),                    // 关机时间，用于计算 7 天删除
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

### 6.3 `runtimeAllocation`

用户到 VPS 的路由映射，`bridge-target.ts` 只查这张表。

```ts
export const runtimeAllocation = pgTable('runtimeAllocation', {
  id: text('id').primaryKey().$defaultFn(generateId),
  userId: text('userId').notNull().unique().references(() => user.id),
  hostId: text('hostId').references(() => runtimeHost.id),
  plan: text('plan').notNull(),
  bridgeBaseUrl: text('bridgeBaseUrl'),                 // 冗余，加速查询
  bridgeToken: text('bridgeToken'),                     // 冗余，加速查询
  status: text('status').notNull().default('pending'),
  // pending | ready | stopped | failed
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

### 6.4 `runtimeProvisionJob`

异步购机任务队列，支持重试和审计。

```ts
export const runtimeProvisionJob = pgTable('runtimeProvisionJob', {
  id: text('id').primaryKey().$defaultFn(generateId),
  userId: text('userId').notNull().references(() => user.id),
  plan: text('plan').notNull(),
  triggerType: text('triggerType').notNull(),
  // payment_new | payment_upgrade | payment_resubscribe | manual_retry
  status: text('status').notNull().default('pending'),
  // pending | buying_vps | waiting_init | ready | failed
  projectId: text('projectId'),
  hetznerServerId: text('hetznerServerId'),
  lastError: text('lastError'),
  attemptCount: integer('attemptCount').default(0),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

---

## 7. Provision 完整流程

### 7.1 支付触发（`src/payment/provider/stripe.ts`）

```ts
// 当前（必须改）：
warmupRuntimeForUser(userId, 'subscription-paid');

// 改为：
await db.insert(runtimeProvisionJob).values({
  userId,
  plan: derivePlanFromStripe(subscription),  // pro | premium | ultra
  triggerType: existingHost ? 'payment_resubscribe' : 'payment_new',
  status: 'pending',
});

// 重订阅时（7 天内）：直接 poweron，不走 Provision Worker
if (existingHost?.status === 'stopped') {
  await poweronVps(existingHost);  // 直接 Hetzner API poweron
  return;
}
```

### 7.2 Provision Worker 主循环

```ts
// src/lib/myclawgo/provision-worker.ts

async function runProvisionWorker() {
  // SKIP LOCKED 防止多 Worker 重复处理同一 job
  const jobs = await db
    .select().from(runtimeProvisionJob)
    .where(and(
      eq(runtimeProvisionJob.status, 'pending'),
      lt(runtimeProvisionJob.attemptCount, 3),
    ))
    .for('update', { skipLocked: true })
    .limit(3);

  for (const job of jobs) {
    await provisionOneUser(job).catch(async (err) => {
      await db.update(runtimeProvisionJob).set({
        status: 'failed',
        lastError: err.message,
        attemptCount: sql`attempt_count + 1`,
      }).where(eq(runtimeProvisionJob.id, job.id));
    });
  }

  // 同时处理"7 天到期自动删除"的 stopped VPS
  await cleanupExpiredVps();
}

async function cleanupExpiredVps() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const expiredHosts = await db.select().from(runtimeHost)
    .where(and(
      eq(runtimeHost.status, 'stopped'),
      lt(runtimeHost.stoppedAt, sevenDaysAgo),
    ));

  for (const host of expiredHosts) {
    await deleteVps(host);  // Hetzner API DELETE /servers/{id}
    await sendWorkspaceDeletedEmail(host.userId);
  }
}
```

### 7.3 购机核心逻辑

```ts
async function provisionOneUser(job: ProvisionJob) {
  // 1. 选有余量的项目
  const project = await selectAvailableProject();
  if (!project) throw new Error('All Hetzner projects full. Operator action required.');

  // 2. 生成 per-VPS Bridge Token
  const bridgeToken = crypto.randomBytes(32).toString('hex');

  // 3. 生成一次性注册 JWT（10 分钟有效）
  const registrationToken = await signJwt(
    { userId: job.userId, jobId: job.id },
    { expiresIn: '10m' }
  );

  // 4. 创建 VPS（无需单独建 Volume，使用自带 SSD）
  const serverType = { pro: 'cx23', premium: 'cx33', ultra: 'cx53' }[job.plan];
  const server = await hetznerApi(project.apiToken).servers.create({
    name: `myclawgo-user-${job.userId.slice(0, 8)}`,
    server_type: serverType,
    location: 'fsn1',
    image: project.snapshotId
      ? { id: project.snapshotId }
      : { name: 'ubuntu-24.04' },
    firewalls: [{ firewall: { id: project.firewallId } }],
    ssh_keys: [{ id: project.sshKeyId }],
    user_data: buildCloudInit({
      userId: job.userId,
      bridgeToken,
      registrationCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/internal/runtime/register`,
      registrationToken,
    }),
    labels: { type: 'runtime-host', userId: job.userId, plan: job.plan },
  });

  // 5. 写 DB
  const hostId = generateId();
  await db.insert(runtimeHost).values({
    id: hostId,
    userId: job.userId,
    projectId: project.id,
    hetznerServerId: String(server.id),
    name: server.name,
    plan: job.plan,
    serverType,
    bridgeToken,
    status: 'waiting_init',
  });

  await db.update(runtimeProvisionJob)
    .set({ status: 'waiting_init', projectId: project.id, hetznerServerId: String(server.id) })
    .where(eq(runtimeProvisionJob.id, job.id));
}
```

### 7.4 VPS 内部进程结构

不使用 Docker，OpenClaw 和 Bridge 直接作为 systemd 服务运行：

```
用户 VPS（cx23/cx33/cx53）
├── openclaw-gateway.service   ← OpenClaw 二进制，监听 127.0.0.1:18789（本机回环）
└── myclawgo-bridge.service    ← Bridge（Node.js），监听 0.0.0.0:18080（对外）
      └── 通过 ws://127.0.0.1:18789 连接 OpenClaw
```

**为什么不需要 Docker**：Docker 的价值是在同一台机器上隔离多个用户。每人独享一台 VPS，VPS 本身已经是隔离边界，Docker 只是额外开销。

### 7.5 Snapshot 预装内容

Snapshot 是加速初始化的关键，预装以下内容（cloud-init 只负责配置 + 启动）：

```
Snapshot 包含：
├── /usr/local/bin/openclaw            ← OpenClaw 二进制（可执行）
├── /opt/myclawgo-bridge/              ← Bridge 代码（已 npm install + build）
│   ├── dist/index.js
│   └── node_modules/
├── /usr/bin/node（Node.js 20+）
├── /etc/systemd/system/openclaw-gateway.service
├── /etc/systemd/system/myclawgo-bridge.service
└── /etc/myclawgo/bridge.env.template  ← 配置模板（BRIDGE_TOKEN 待注入）
```

**systemd 服务文件（预置在 Snapshot 中）：**

`/etc/systemd/system/openclaw-gateway.service`：
```ini
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
User=openclaw
ExecStart=/usr/local/bin/openclaw gateway run --bind loopback --port 18789
Restart=always
RestartSec=5
WorkingDirectory=/home/openclaw
Environment=HOME=/home/openclaw

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/myclawgo-bridge.service`：
```ini
[Unit]
Description=MyClawGo Bridge
After=network.target openclaw-gateway.service
Requires=openclaw-gateway.service

[Service]
User=openclaw
WorkingDirectory=/opt/myclawgo-bridge
EnvironmentFile=/etc/myclawgo/bridge.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 7.6 cloud-init 脚本（使用 Snapshot，极简）

Snapshot 已预装所有软件，cloud-init 只做三件事：注入配置 → 启动服务 → 回调注册。

```bash
#!/bin/bash
# 1. 注入 Bridge Token（唯一需要动态配置的内容）
mkdir -p /etc/myclawgo
cat > /etc/myclawgo/bridge.env <<EOF
BRIDGE_TOKEN=${BRIDGE_TOKEN}
GATEWAY_WS_URL=ws://127.0.0.1:18789
PORT=18080
EOF

# 2. 确保用户数据目录存在
mkdir -p /home/openclaw/.openclaw
chown -R openclaw:openclaw /home/openclaw/.openclaw

# 3. 启动服务
systemctl enable openclaw-gateway myclawgo-bridge
systemctl start openclaw-gateway
sleep 3
systemctl start myclawgo-bridge

# 4. 等待 Bridge 健康（最多 60 秒）
for i in $(seq 1 12); do
  curl -sf http://localhost:18080/health > /dev/null 2>&1 && break
  sleep 5
done

# 5. 回调 Control Plane 注册
PUBLIC_IP=$(curl -s -4 ifconfig.me)
curl -X POST "${REGISTRATION_CALLBACK_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${REGISTRATION_TOKEN}" \
  -d "{\"userId\": \"${USER_ID}\", \"publicIp\": \"${PUBLIC_IP}\"}"
```

**不使用 Snapshot 时（基础镜像，cold start）**，cloud-init 还需要额外：

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 安装 OpenClaw 二进制
curl -fsSL https://releases.myclawgo.com/openclaw/latest/openclaw-linux-amd64 \
  -o /usr/local/bin/openclaw
chmod +x /usr/local/bin/openclaw

# 创建 openclaw 用户
useradd -m -s /bin/bash openclaw

# 下载 Bridge 代码
mkdir -p /opt/myclawgo-bridge
curl -fsSL https://releases.myclawgo.com/bridge/latest/bridge.tar.gz \
  | tar -xz -C /opt/myclawgo-bridge

# 复制 systemd service 文件
# ... （同上）

# 然后继续注入配置 + 启动（同 Snapshot 流程）
```

> **强烈建议使用 Snapshot**：cold start 约 4–6 分钟，Snapshot 约 60–90 秒，用户体验差距很大。

### 7.5 注册回调（`/api/internal/runtime/register`）

```ts
export async function POST(req: Request) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '');
  const { userId } = await verifyJwt(auth);
  const { publicIp } = await req.json();

  const bridgeBaseUrl = `http://${publicIp}:18080`;

  const host = await db.query.runtimeHost.findFirst({
    where: and(eq(runtimeHost.userId, userId), eq(runtimeHost.status, 'waiting_init')),
  });

  await db.update(runtimeHost)
    .set({ publicIp, bridgeBaseUrl, status: 'ready' })
    .where(eq(runtimeHost.id, host.id));

  await db.insert(runtimeAllocation)
    .values({ userId, hostId: host.id, plan: host.plan, bridgeBaseUrl, bridgeToken: host.bridgeToken, status: 'ready' })
    .onConflictDoUpdate({
      target: runtimeAllocation.userId,
      set: { bridgeBaseUrl, bridgeToken: host.bridgeToken, status: 'ready', hostId: host.id },
    });

  await db.update(runtimeProvisionJob)
    .set({ status: 'ready' })
    .where(and(eq(runtimeProvisionJob.userId, userId), eq(runtimeProvisionJob.status, 'waiting_init')));

  await sendWorkspaceReadyEmail(userId);
  return NextResponse.json({ ok: true });
}
```

### 7.6 订阅到期处理（`src/payment/provider/stripe.ts`）

```ts
// Stripe webhook: customer.subscription.deleted
case 'customer.subscription.deleted': {
  const sub = event.data.object as Stripe.Subscription;
  const userId = await getUserIdFromStripeCustomer(sub.customer as string);

  const host = await db.query.runtimeHost.findFirst({
    where: and(eq(runtimeHost.userId, userId), eq(runtimeHost.status, 'ready')),
  });

  if (host?.hetznerServerId) {
    // 立即关机
    const project = await db.query.hetznerProject.findFirst({
      where: eq(hetznerProject.id, host.projectId),
    });
    await hetznerApi(project.apiToken).servers.poweroff(parseInt(host.hetznerServerId));

    await db.update(runtimeHost)
      .set({ status: 'stopped', stoppedAt: new Date() })
      .where(eq(runtimeHost.id, host.id));

    await db.update(runtimeAllocation)
      .set({ status: 'stopped' })
      .where(eq(runtimeAllocation.userId, userId));
  }

  await sendWorkspacePausedEmail(userId);  // "7 天内续订可恢复数据"
  break;
}
```

### 7.7 套餐升级（Hetzner Resize）

```ts
async function upgradeVps(userId: string, newPlan: 'premium' | 'ultra') {
  const host = await db.query.runtimeHost.findFirst({
    where: eq(runtimeHost.userId, userId),
  });
  const project = await getProject(host.projectId);
  const newServerType = { premium: 'cx33', ultra: 'cx53' }[newPlan];

  // 1. 关机
  await hetznerApi(project.apiToken).servers.poweroff(parseInt(host.hetznerServerId));

  // 2. Resize（同时升级 SSD）
  await hetznerApi(project.apiToken).servers.changeType(parseInt(host.hetznerServerId), {
    server_type: newServerType,
    upgrade_disk: true,   // 同步扩大 SSD，数据完整保留
  });

  // 3. 开机
  await hetznerApi(project.apiToken).servers.poweron(parseInt(host.hetznerServerId));

  // 4. 更新 DB
  await db.update(runtimeHost)
    .set({ plan: newPlan, serverType: newServerType })
    .where(eq(runtimeHost.id, host.id));
  await db.update(runtimeAllocation)
    .set({ plan: newPlan })
    .where(eq(runtimeAllocation.userId, userId));
}
```

> **注意**：Hetzner resize 通常需要 2–5 分钟。期间 Bridge 不可用，用户会看到"工作区升级中"。

---

## 8. 必须改造的代码（单机假设）

| 文件 | 当前问题 | 改造内容 |
|------|---------|---------|
| `src/payment/provider/stripe.ts:828` | `warmupRuntimeForUser()` 同步建容器 | 写 `runtimeProvisionJob`；重订阅时直接 poweron |
| `src/lib/myclawgo/runtime-warmup.ts` | 同步 ensureSessionById + ensureUserContainer | 删除或改为只写 job |
| `src/lib/myclawgo/session-store.ts` | 读写本地 `sessions.json` | 改为查 `runtimeAllocation` 表 |
| `src/lib/myclawgo/bridge-target.ts` | `docker inspect` 取本机 IP | 查 `runtimeAllocation.bridgeBaseUrl` + `bridgeToken` |
| `src/lib/myclawgo/docker-manager.ts` | 本机 `docker run` | cloud-init 替代，此文件不再需要（或仅保留本地开发用途） |
| `src/app/api/chat/runtime-status/route.ts` | 查本机 Docker 状态 | 查 `runtimeAllocation.status` |
| `src/db/schema.ts` | 无相关表 | 新增 4 张表 |

### `bridge-target.ts` 改造后（核心变化，极简）

```ts
// 改造前（~20 行 shell exec）：
const { stdout } = await execFileAsync('docker', ['inspect', '-f', '...', containerName]);
const ip = stdout.trim();
return { baseUrl: `http://${ip}:18080`, token: process.env.BRIDGE_TOKEN };

// 改造后（5 行 DB 查询）：
const alloc = await db.query.runtimeAllocation.findFirst({
  where: and(
    eq(runtimeAllocation.userId, userId),
    eq(runtimeAllocation.status, 'ready'),
  ),
});
if (!alloc?.bridgeBaseUrl) return { ok: false, error: 'runtime_not_ready' };
return { ok: true, target: { bridge: { baseUrl: alloc.bridgeBaseUrl, token: alloc.bridgeToken } } };
```

---

## 9. Phase 1：拆单机假设（约 1 周）

**目标**：代码层面支持多机路由，手动注册当前机器，现有用户不受影响。

**任务清单：**

- [ ] `src/db/schema.ts`：新增 4 张表
- [ ] `pnpm db:generate && pnpm db:migrate`
- [ ] `src/lib/myclawgo/bridge-target.ts`：改为查 `runtimeAllocation`
- [ ] `src/lib/myclawgo/session-store.ts`：`getSession` 改为查 `runtimeAllocation`
- [ ] `src/payment/provider/stripe.ts`：webhook 改写 provision job
- [ ] `src/app/api/chat/runtime-status/route.ts`：改为查 `runtimeAllocation.status`
- [ ] SQL：手动 INSERT 当前机器 + 现有用户的 allocation 记录（status=ready）
- [ ] 验证：现有用户聊天正常

### 手动 INSERT 当前机器（Phase 1 完成后）

```sql
-- 1. 虚拟项目（代表现有机器）
INSERT INTO "hetznerProject" (id, name, "apiToken", region, "maxServers", "sshKeyId", "firewallId", status)
VALUES ('proj-existing', 'existing-machine', 'N/A', 'nbg1', 1, 0, 0, 'active');

-- 2. 当前机器作为 runtimeHost（把 {xxx} 替换为实际值）
INSERT INTO "runtimeHost" (id, "userId", "projectId", name, plan, "serverType", region, "publicIp", "bridgeBaseUrl", "bridgeToken", status)
VALUES ('host-main', '{当前测试用户 userId}', 'proj-existing', 'myclawgo-existing', 'pro', 'cx33', 'nbg1',
        '{当前机器公网 IP}', 'http://{当前机器公网 IP}:18080', '{.env 里的 BRIDGE_TOKEN}', 'ready');

-- 3. runtimeAllocation（每个现有用户插一条）
INSERT INTO "runtimeAllocation" (id, "userId", "hostId", plan, "bridgeBaseUrl", "bridgeToken", status)
VALUES (gen_random_uuid(), '{当前测试用户 userId}', 'host-main', 'pro',
        'http://{当前机器公网 IP}:18080', '{.env 里的 BRIDGE_TOKEN}', 'ready');
```

---

## 10. Phase 2：自动购机上线（约 1 周）

**任务清单：**

- [ ] `src/lib/hetzner/client.ts`：封装 Hetzner API（createServer, poweroff, poweron, deleteServer, changeType）
- [ ] `src/lib/myclawgo/provision-worker.ts`：Worker 主逻辑（selectProject, provisionOneUser, cleanupExpiredVps）
- [ ] `src/lib/myclawgo/cloud-init.ts`：cloud-init 脚本生成器（模板字符串 + 参数注入）
- [ ] `src/app/api/internal/runtime/register/route.ts`：注册回调端点
- [ ] `src/instrumentation.ts`：启动 Provision Worker（`setInterval(runProvisionWorker, 30_000)`）
- [ ] Stripe webhook 订阅到期：poweroff VPS → 更新 DB → 发邮件
- [ ] Stripe webhook 续订：检查 stopped VPS → poweron → 发邮件
- [ ] 前端 `/chat` 页面：根据 `runtimeAllocation.status` 显示不同状态
  - `pending/waiting_init`：显示"工作区准备中（约 2–3 分钟）" + 轮询
  - `stopped`：显示"工作区已暂停，续订后自动恢复"
  - `ready`：正常聊天界面
- [ ] 套餐升级触发 `upgradeVps()`（Stripe `customer.subscription.updated`，plan 变大时）
- [ ] 端对端测试：支付 → VPS ready → 聊天 → 取消 → 关机 → 7 天 → 删除

---

## 11. 环境变量清单

```env
# ── Hetzner 多项目配置（JSON 数组）────────────────────────────────────
HETZNER_PROJECTS='[
  {
    "id": "proj-01",
    "name": "myclawgo-runtime-01",
    "apiToken": "xxxx",
    "region": "fsn1",
    "maxServers": 90,
    "sshKeyId": 12345678,
    "firewallId": 56789012,
    "snapshotId": null
  }
]'

# ── Control Plane 信息 ─────────────────────────────────────────────
CONTROL_PLANE_PUBLIC_IP=x.x.x.x

# ── 注册 Token 签名密钥 ────────────────────────────────────────────
RUNTIME_REGISTER_TOKEN_SECRET=<openssl rand -hex 32>

# ── Provision Worker ───────────────────────────────────────────────
ENABLE_PROVISION_WORKER=true
PROVISION_WORKER_INTERVAL_MS=30000

# ── VPS 生命周期 ───────────────────────────────────────────────────
VPS_DATA_RETENTION_DAYS=7        # 关机后保留数据的天数，超过后删除 VPS
```

---

## 12. 异常处理策略

| 失败场景 | 处理方式 |
|---------|---------|
| Hetzner API 购机失败（临时故障） | job `attemptCount++`，下次 Worker 轮询自动重试（最多 3 次） |
| cx53 在 fsn1 无货 | 告警管理员；备选：cx53 在 hel1（赫尔辛基）也可用，动态切换 |
| 项目配额耗尽 | 告警管理员，暂停购机；管理员新增项目到 `HETZNER_PROJECTS` 后自动恢复 |
| cloud-init 超时（> 10 分钟无回调） | Worker 检测 `waiting_init` 超时 → 标记 failed → 管理员介入 |
| poweron 后 Bridge 无响应 | 健康检查失败告警；可手动 SSH 排查 |
| 用户支付 webhook 重复触发 | 插入前检查 `runtimeAllocation` 是否已存在（userId 唯一约束防重） |
| VPS resize 中用户发消息 | `runtimeAllocation.status = upgrading` → 前端提示"套餐升级中" |
