# 最终方案：一用户一 VPS（多项目 Hetzner + 公网通信）

> 版本：2026-04-26（最终版）  
> 定位：可直接开发的技术方案，包含架构决策、DB 设计、代码改造清单、两阶段开发计划。

---

## 目录

1. [最终架构概述](#1-最终架构概述)
2. [机型规格确认](#2-机型规格确认)
3. [多项目 Hetzner 管理策略](#3-多项目-hetzner-管理策略)
4. [公网通信安全模型](#4-公网通信安全模型)
5. [VPS 生命周期（含 Volume 持久化）](#5-vps-生命周期含-volume-持久化)
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
调用 Hetzner API：
  1. 创建 Volume（用户数据持久化）
  2. 创建 VPS（指定机型、region fsn1、SSH Key、Firewall）
  3. cloud-init 启动 OpenClaw + Bridge
    ↓
VPS 启动后回调 /api/internal/runtime/register
    ↓
写入 runtimeHost + runtimeAllocation（status = ready）
    ↓
发邮件通知用户"工作区已就绪"
```

**无 Private Network**：所有通信走公网 IP，Control Plane 通过 BRIDGE_TOKEN 鉴权访问每台用户 VPS。

---

## 2. 机型规格确认

| 套餐 | 机型 | 规格 | 区域 | 月费（约） |
|------|------|------|------|----------|
| Pro（$29.90/月） | **cx23** | 2 vCPU / 4 GB / 40 GB | fsn1 | ~€3.79 |
| Premium（$59.90/月） | **cx33** | 4 vCPU / 8 GB / 80 GB | fsn1 | ~€7.52 |
| Ultra（$199.90/月） | **cx53** | 16 vCPU / 32 GB / 320 GB | fsn1 | ~€26.90 |

> **为什么固定 Falkenstein（fsn1）**：cx53 在 Nuremberg（nbg1）没有，统一用 fsn1 避免机型可用性问题，且 fsn1 延迟也很低。

**VPS 成本占订阅收入比：**
- Pro: ~12.7%
- Premium: ~12.6%
- Ultra: ~13.5%

**Volume（磁盘）单独费用**（用户取消后保留数据用）：

| 套餐 | Volume 大小 | Volume 月费 |
|------|------------|------------|
| Pro | 40 GB | ~€0.05×40 = €2.00 |
| Premium | 80 GB | ~€0.05×80 = €4.00 |
| Ultra | 320 GB | ~€0.05×320 = €16.00 |

---

## 3. 多项目 Hetzner 管理策略

### 为什么需要多项目

Hetzner 每个项目默认 Server 上限约 10–25 台。  
100 个用户 = 100 台 VPS，必须分散在多个项目。

### 项目命名规则

```
myclawgo-runtime-01    ← 第一批用户（1–90）
myclawgo-runtime-02    ← 第二批用户（91–180）
myclawgo-runtime-03    ← 第三批用户（181–270）
...
```

每个项目上限设为 **90 台**（申请 100 配额后留 10 台 buffer）。

### 项目信息存入 DB（`hetznerProject` 表）

系统根据每个项目当前 VPS 数量决定往哪个项目购机：

```
选择策略：找第一个 usedServers < maxServers 的项目
如果所有项目都满了：管理员告警，暂停购机
```

### 多项目 vs 单项目的通信差异

- **单项目**（原方案）：Private Network → 私网 IP 通信，安全但不跨项目
- **多项目**（现方案）：公网 IP 通信，每台 VPS 只开放必要端口给 Control Plane IP

---

## 4. 公网通信安全模型

### Control Plane → 用户 VPS 通信

```
Control Plane（公网 IP: A.B.C.D）
    ↓ HTTPS/HTTP + BRIDGE_TOKEN
用户 VPS（公网 IP: X.X.X.X，Bridge 端口 18080）
```

### Hetzner Firewall 规则（应用到所有用户 VPS）

| 方向 | 协议 | 端口 | 来源 | 用途 |
|------|------|------|------|------|
| 入站 | TCP | 22 | 运维固定 IP | SSH 登录 |
| 入站 | TCP | 18080 | Control Plane 公网 IP | Bridge 访问 |
| 入站 | 所有其他 | — | — | **拒绝** |
| 出站 | 所有 | — | 0.0.0.0/0 | OpenClaw 访问 AI API |

> **关键**：Bridge（18080）只允许 Control Plane IP 访问，用户无法直接访问自己的 VPS 端口。

### 鉴权双重保护

1. **Firewall IP 白名单**：网络层拦截非 Control Plane 请求
2. **BRIDGE_TOKEN**：应用层 `Authorization: Bearer xxx`，防止 IP 伪造

### Control Plane IP 变更处理

如果 Control Plane 的公网 IP 更换，通过 Hetzner API 批量更新所有 Firewall：

```ts
// 一行 API 调用更新 Firewall 规则
// Hetzner Firewall 是对象，一次更新自动应用到所有使用该 Firewall 的服务器
await hetznerClient.firewalls.setRules(firewallId, newRules);
```

---

## 5. VPS 生命周期（含 Volume 持久化）

### 5.1 创建流程

```
用户支付 Pro
    ↓
创建 Hetzner Volume（40GB，挂载到 /data）
    ↓
创建 cx23 VPS（附加 Volume + Firewall + SSH Key）
    ↓
cloud-init 将 /data 作为 OpenClaw 数据目录
    ↓
VPS ready，写 runtimeAllocation（status=ready）
```

### 5.2 用户取消订阅

```
用户取消（Stripe webhook: subscription.deleted）
    ↓
立即：发邮件告知（"工作区将在 30 天后关闭"）
    ↓
7 天后：poweroff VPS（数据在 Volume 中安全保留）
    ↓
30 天后：delete VPS + delete Volume（彻底清理）
```

**取消后成本**：
- 7 天内：VPS 继续正常计费（用户宽限期）
- 第 7–30 天：VPS 关机，**只收 Volume 费**（Pro: €2/月，比完整 VPS 便宜 ~55%）
- 30 天后：全部删除，费用归零

### 5.3 用户重新订阅（30 天内）

```
30 天内重订阅
    ↓
Volume 还在 → 重新购买相同机型 + 挂载原 Volume
    ↓
历史对话、Agent 配置全部保留
```

### 5.4 套餐升级 / 降级

```
升级（Pro → Premium）
    ↓
购买新机型 cx33 + 新 Volume（80GB）
    ↓
迁移旧 Volume 数据到新 Volume（rsync）
    ↓
删除旧 VPS + 旧 Volume
    ↓
更新 runtimeAllocation.bridgeBaseUrl
```

### 5.5 VPS 状态机

```
not_provisioned
    → pending（写入 provision job）
    → buying_vps（Hetzner API 调用中）
    → waiting_init（VPS 购买成功，等待 cloud-init）
    → ready（cloud-init 完成，bridge 可访问）
    → stopping（用户取消，7 天后关机）
    → stopped（关机中，Volume 保留）
    → deleting（30 天后，清理中）
    → deleted
    → failed（任意步骤失败）
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
  region: text('region').notNull().default('fsn1'),      // 固定 Falkenstein
  maxServers: integer('maxServers').notNull().default(90),
  sshKeyId: integer('sshKeyId').notNull(),               // 该项目的 SSH Key ID
  firewallId: integer('firewallId').notNull(),           // 该项目的 Firewall ID
  snapshotId: integer('snapshotId'),                     // 可选 Snapshot（加速初始化）
  status: text('status').notNull().default('active'),    // active | full | disabled
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

### 6.2 `runtimeHost`

每行 = 一台用户专属 VPS，与用户 1:1。

```ts
export const runtimeHost = pgTable('runtimeHost', {
  id: text('id').primaryKey().$defaultFn(generateId),
  userId: text('userId').unique().references(() => user.id),
  projectId: text('projectId').references(() => hetznerProject.id),
  hetznerServerId: text('hetznerServerId'),              // Hetzner Server ID
  hetznerVolumeId: text('hetznerVolumeId'),             // Hetzner Volume ID（数据盘）
  name: text('name').notNull(),                          // myclawgo-user-{userId[:8]}
  plan: text('plan').notNull(),                          // pro | premium | ultra
  serverType: text('serverType').notNull(),              // cx23 | cx33 | cx53
  region: text('region').notNull().default('fsn1'),
  publicIp: text('publicIp'),                           // VPS 公网 IP
  bridgeBaseUrl: text('bridgeBaseUrl'),                 // http://{publicIp}:18080
  bridgeToken: text('bridgeToken'),                     // 每台 VPS 独立 token
  status: text('status').notNull().default('pending'),
  // pending | buying_vps | waiting_init | ready | stopping | stopped | deleting | deleted | failed
  statusUpdatedAt: timestamp('statusUpdatedAt'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

> **注意**：`bridgeToken` 每台 VPS 独立生成（`crypto.randomBytes(32).toString('hex')`），不共用全局 BRIDGE_TOKEN，安全性更高。

### 6.3 `runtimeAllocation`

用户到 VPS 的路由映射，`bridge-target.ts` 查这张表。

```ts
export const runtimeAllocation = pgTable('runtimeAllocation', {
  id: text('id').primaryKey().$defaultFn(generateId),
  userId: text('userId').notNull().unique().references(() => user.id),
  hostId: text('hostId').references(() => runtimeHost.id),
  plan: text('plan').notNull(),
  bridgeBaseUrl: text('bridgeBaseUrl'),                 // 冗余字段，加速查询
  bridgeToken: text('bridgeToken'),                     // 冗余字段，加速查询
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
  // payment_new | payment_upgrade | payment_downgrade | manual_retry | subscription_renew
  status: text('status').notNull().default('pending'),
  // pending | buying_vps | waiting_init | ready | failed
  projectId: text('projectId'),                         // 分配到的项目
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
// 当前代码（必须改）：
warmupRuntimeForUser(userId, 'subscription-paid');

// 改为：
await db.insert(runtimeProvisionJob).values({
  userId,
  plan: derivePlanFromStripe(subscription),  // pro | premium | ultra
  triggerType: 'payment_new',
  status: 'pending',
});
```

### 7.2 Provision Worker 主循环

```ts
// src/lib/myclawgo/provision-worker.ts
// 挂在 instrumentation.ts，每 30 秒执行一次

async function runProvisionWorker() {
  // 1. 使用 SKIP LOCKED 防止多 Worker 重复处理同一 job
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
      await db.update(runtimeProvisionJob)
        .set({ status: 'failed', lastError: err.message, attemptCount: sql`attempt_count + 1` })
        .where(eq(runtimeProvisionJob.id, job.id));
    });
  }
}

async function provisionOneUser(job: ProvisionJob) {
  // 1. 选择有余量的 Hetzner 项目
  const project = await selectAvailableProject();
  if (!project) throw new Error('All Hetzner projects are full. Manual intervention required.');

  // 2. 生成该 VPS 独立的 bridge token
  const bridgeToken = crypto.randomBytes(32).toString('hex');

  // 3. 生成一次性注册 token（JWT，含 userId，5分钟有效）
  const registrationToken = await signRegistrationToken({ userId: job.userId, jobId: job.id });

  // 4. 创建 Hetzner Volume（数据盘）
  const volumeSize = { pro: 40, premium: 80, ultra: 320 }[job.plan];
  const volume = await hetznerApi(project.apiToken).volumes.create({
    name: `myclawgo-data-${job.userId.slice(0, 8)}`,
    size: volumeSize,
    location: 'fsn1',
    format: 'ext4',
  });

  // 5. 创建 VPS
  const serverType = { pro: 'cx23', premium: 'cx33', ultra: 'cx53' }[job.plan];
  const server = await hetznerApi(project.apiToken).servers.create({
    name: `myclawgo-user-${job.userId.slice(0, 8)}`,
    server_type: serverType,
    location: 'fsn1',
    image: project.snapshotId
      ? { id: project.snapshotId }
      : { name: 'ubuntu-24.04' },
    volumes: [volume.id],
    firewalls: [{ firewall: { id: project.firewallId } }],
    ssh_keys: [{ id: project.sshKeyId }],
    user_data: buildCloudInit({
      userId: job.userId,
      bridgeToken,
      registrationCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/internal/runtime/register`,
      registrationToken,
      volumeDevice: '/dev/disk/by-id/scsi-0HC_Volume_' + volume.id,
    }),
    labels: {
      type: 'runtime-host',
      userId: job.userId,
      plan: job.plan,
      projectSlot: project.name,
    },
  });

  // 6. 写 DB
  const hostId = generateId();
  await db.insert(runtimeHost).values({
    id: hostId,
    userId: job.userId,
    projectId: project.id,
    hetznerServerId: String(server.id),
    hetznerVolumeId: String(volume.id),
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

### 7.3 cloud-init 脚本

```bash
#!/bin/bash
# 挂载用户数据 Volume
mkdir -p /data
mount -o defaults ${VOLUME_DEVICE} /data || mkfs.ext4 ${VOLUME_DEVICE} && mount -o defaults ${VOLUME_DEVICE} /data
echo "${VOLUME_DEVICE} /data ext4 defaults 0 2" >> /etc/fstab
mkdir -p /data/openclaw

# 安装 Docker（如果不是 snapshot）
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
fi

# 启动 OpenClaw + Bridge 容器
docker run -d \
  --name openclaw-runtime \
  --restart unless-stopped \
  -p 18080:18080 \
  -e BRIDGE_TOKEN="${BRIDGE_TOKEN}" \
  -v /data/openclaw:/home/openclaw/.openclaw \
  myclawgo-openclaw:latest

# 等待 bridge 健康（最多 60 秒）
for i in $(seq 1 12); do
  if curl -sf http://localhost:18080/health > /dev/null 2>&1; then
    break
  fi
  sleep 5
done

# 回调注册
PUBLIC_IP=$(curl -s http://169.254.169.254/hetzner/v1/metadata/public-ipv4)
curl -X POST "${REGISTRATION_CALLBACK_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${REGISTRATION_TOKEN}" \
  -d "{\"userId\": \"${USER_ID}\", \"publicIp\": \"${PUBLIC_IP}\"}"
```

### 7.4 注册回调（`src/app/api/internal/runtime/register/route.ts`）

```ts
export async function POST(req: Request) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '');
  const payload = await verifyRegistrationToken(auth);  // 验证 JWT，含 userId
  const { publicIp } = await req.json();

  const bridgeBaseUrl = `http://${publicIp}:18080`;

  // 取出该用户的 runtimeHost 记录（waiting_init 状态）
  const host = await db.query.runtimeHost.findFirst({
    where: and(eq(runtimeHost.userId, payload.userId), eq(runtimeHost.status, 'waiting_init')),
  });

  // 更新 runtimeHost
  await db.update(runtimeHost)
    .set({ publicIp, bridgeBaseUrl, status: 'ready' })
    .where(eq(runtimeHost.id, host.id));

  // 写入 runtimeAllocation（或更新 pending → ready）
  await db.insert(runtimeAllocation)
    .values({ userId: payload.userId, hostId: host.id, plan: host.plan, bridgeBaseUrl, bridgeToken: host.bridgeToken, status: 'ready' })
    .onConflictDoUpdate({ target: runtimeAllocation.userId, set: { bridgeBaseUrl, bridgeToken: host.bridgeToken, status: 'ready', hostId: host.id } });

  // 更新 job
  await db.update(runtimeProvisionJob)
    .set({ status: 'ready' })
    .where(eq(runtimeProvisionJob.userId, payload.userId));

  // 发邮件通知用户
  await sendWorkspaceReadyEmail(payload.userId);

  return NextResponse.json({ ok: true });
}
```

---

## 8. 必须改造的代码（单机假设）

| 文件 | 当前问题 | 改造内容 |
|------|---------|---------|
| `src/payment/provider/stripe.ts:828` | `warmupRuntimeForUser()` 同步建容器 | 改为写 `runtimeProvisionJob` |
| `src/lib/myclawgo/runtime-warmup.ts` | 同步 `ensureSessionById` + `ensureUserContainer` | 删除或改为只写 job，不直接操作 Docker |
| `src/lib/myclawgo/session-store.ts` | 读写本地 `sessions.json` | 改为查 `runtimeAllocation` 表 |
| `src/lib/myclawgo/bridge-target.ts` | `docker inspect` 取本机 IP | 改为查 `runtimeAllocation.bridgeBaseUrl` + `bridgeToken` |
| `src/lib/myclawgo/docker-manager.ts` | 本机 `docker run` | 一用户一 VPS → cloud-init 替代，此文件只保留用于兼容旧逻辑 |
| `src/app/api/chat/runtime-status/route.ts` | 查本机 Docker 状态 | 改为查 `runtimeAllocation.status` |
| `src/db/schema.ts` | 无相关表 | 新增 4 张表 |

### `bridge-target.ts` 改造后（核心变化）

```ts
// 改造前（~20 行 shell exec）：
const { stdout } = await execFileAsync('docker', ['inspect', '-f', '...', containerName]);
const ip = stdout.trim();
const token = process.env.BRIDGE_TOKEN;
return { baseUrl: `http://${ip}:18080`, token };

// 改造后（~5 行 DB 查询）：
const alloc = await db.query.runtimeAllocation.findFirst({
  where: and(eq(runtimeAllocation.userId, userId), eq(runtimeAllocation.status, 'ready')),
});
if (!alloc) return { ok: false, error: 'runtime_not_ready' };
return { ok: true, target: { bridge: { baseUrl: alloc.bridgeBaseUrl, token: alloc.bridgeToken } } };
```

---

## 9. Phase 1：拆单机假设（约 1 周）

**目标**：代码层面支持多机路由，手动注册当前机器为第一台，现有用户不受影响。

**任务清单：**

- [ ] `src/db/schema.ts`：新增 `hetznerProject`、`runtimeHost`、`runtimeAllocation`、`runtimeProvisionJob`
- [ ] `pnpm db:generate && pnpm db:migrate`
- [ ] `src/lib/myclawgo/bridge-target.ts`：改为查 DB
- [ ] `src/lib/myclawgo/session-store.ts`：`getSession(userId)` 改为查 `runtimeAllocation`
- [ ] `src/payment/provider/stripe.ts`：webhook 改写 provision job
- [ ] `src/app/api/chat/runtime-status/route.ts`：改为查 `runtimeAllocation.status`
- [ ] SQL：手动 INSERT 当前机器为第一条 `hetznerProject` + `runtimeHost` + `runtimeAllocation`（status=ready）
- [ ] 验证：现有用户聊天正常（路由走 DB，不走 docker inspect）

**Phase 1 不需要**：Hetzner API、cloud-init、购机逻辑。

### 手动 INSERT 当前机器（Phase 1 完成后执行）

```sql
-- 1. 插入"虚拟项目"代表现有机器
INSERT INTO "hetznerProject" (id, name, "apiToken", region, "maxServers", "sshKeyId", "firewallId", status)
VALUES ('proj-existing', 'existing-machine', 'N/A', 'nbg1', 1, 0, 0, 'active');

-- 2. 插入当前机器为 runtimeHost
INSERT INTO "runtimeHost" (id, "userId", "projectId", name, plan, "serverType", region, "publicIp", "bridgeBaseUrl", "bridgeToken", status)
VALUES ('host-main', '{实际userId}', 'proj-existing', 'myclawgo-main', 'pro', 'cx33', 'nbg1', '{实际机器IP}', 'http://{实际机器IP}:18080', '{BRIDGE_TOKEN}', 'ready');

-- 3. 插入 runtimeAllocation
INSERT INTO "runtimeAllocation" (id, "userId", "hostId", plan, "bridgeBaseUrl", "bridgeToken", status)
VALUES (gen_random_uuid(), '{实际userId}', 'host-main', 'pro', 'http://{实际机器IP}:18080', '{BRIDGE_TOKEN}', 'ready');
```

---

## 10. Phase 2：自动购机上线（约 1 周）

**目标**：支付后全自动购 Hetzner VPS，cloud-init 完成后用户可聊天。

**任务清单：**

- [ ] `src/lib/hetzner/client.ts`：封装 Hetzner API（createServer, createVolume, poweroffServer, deleteServer, deleteVolume）
- [ ] `src/lib/myclawgo/provision-worker.ts`：Worker 主逻辑（selectProject、provisionOneUser）
- [ ] `src/lib/myclawgo/cloud-init.ts`：cloud-init 脚本生成器
- [ ] `src/app/api/internal/runtime/register/route.ts`：注册回调端点（JWT 验证）
- [ ] `src/app/api/internal/runtime/decommission/route.ts`：VPS 回收端点（用于取消订阅）
- [ ] `src/instrumentation.ts`：启动 Provision Worker（`setInterval`，30s）
- [ ] 前端状态展示：`/chat` 显示"工作区准备中（约 2–3 分钟）…"+ 轮询
- [ ] Stripe webhook 取消订阅事件：写入 stop job → 7 天后 poweroff → 30 天后 delete
- [ ] 套餐升级/降级处理：新购机 → 数据迁移 → 删旧机
- [ ] 端对端测试：新付费 → VPS ready → 聊天 → 取消 → VPS poweroff

**Phase 2 完成后，Hetzner 手动操作完成（见 HETZNER_MANUAL_SETUP_GUIDE_FINAL）。**

---

## 11. 环境变量清单

```env
# ── Hetzner 项目列表（JSON，支持多项目）────────────────────────────────
# 每个对象对应一个 Hetzner 项目，Worker 按顺序选择有余量的项目
# 初始只有一个，后续直接往数组追加
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

# ── Control Plane 信息（用于生成 Firewall 规则）──────────────────────
CONTROL_PLANE_PUBLIC_IP=x.x.x.x    # SaaS 机器公网 IP

# ── 注册 Token 签名密钥 ────────────────────────────────────────────
RUNTIME_REGISTER_TOKEN_SECRET=<openssl rand -hex 32>

# ── Provision Worker ───────────────────────────────────────────────
ENABLE_PROVISION_WORKER=true
PROVISION_WORKER_INTERVAL_MS=30000

# ── 用户 VPS 订阅取消宽限期 ────────────────────────────────────────
VPS_GRACE_PERIOD_DAYS=7       # 取消后 7 天再关机
VPS_DELETE_AFTER_DAYS=30      # 取消后 30 天删除
```

**当需要新增第二个 Hetzner 项目时，只需在 `HETZNER_PROJECTS` 数组里追加一条记录。**

---

## 12. 异常处理策略

| 失败场景 | 处理方式 |
|---------|---------|
| Hetzner API 创建失败（网络/临时故障） | job 状态 → failed，`attemptCount++`，下次 Worker 轮询重试（最多 3 次） |
| cx53 在 fsn1 无货 | 告警管理员；备选：cx53 在 hel1（赫尔辛基）也可用 |
| 项目配额耗尽 | 告警管理员，暂停购机，新用户看到"准备中"；管理员新增项目后自动恢复 |
| cloud-init 超时（> 8 分钟无回调） | Worker 轮询检测 `waiting_init` 超时 → 重试或人工介入 |
| 注册回调失败 | Registration token 有效期 10 分钟；超时后 VPS 可以 curl 触发重试 |
| 用户支付 webhook 重复触发 | provision job 写入前检查是否已有 `pending/ready` 的 allocation（唯一约束） |
| VPS 磁盘满 | Hetzner 支持 Volume 在线扩容（API `POST /volumes/{id}/actions/resize`） |
