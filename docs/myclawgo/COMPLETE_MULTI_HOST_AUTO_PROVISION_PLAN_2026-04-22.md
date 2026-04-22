# MyClawGo 多机自动购机完整技术方案

> 版本：2026-04-22  
> 目标：用户支付成功后，系统自动检查容量、按需购买 Hetzner VPS、创建用户专属容器，全程异步，对用户透明。  
> 开发顺序：先出文档，再在测试环境 `my-claw-go` 开发，验证后上生产。

---

## 目录

1. [现状问题与根因](#1-现状问题与根因)
2. [目标架构](#2-目标架构)
3. [核心数据库改造](#3-核心数据库改造)
4. [四个阶段实施计划](#4-四个阶段实施计划)
5. [Phase 1 详细任务：解耦支付与容器创建](#5-phase-1-详细任务解耦支付与容器创建)
6. [Phase 2 详细任务：Host Agent + 多机调度](#6-phase-2-详细任务host-agent--多机调度)
7. [Phase 3 详细任务：Hetzner 自动购机](#7-phase-3-详细任务hetzner-自动购机)
8. [Phase 4 详细任务：预热与自动缩容](#8-phase-4-详细任务预热与自动缩容)
9. [容量规划与机型选择](#9-容量规划与机型选择)
10. [网络拓扑与安全设计](#10-网络拓扑与安全设计)
11. [异常处理策略](#11-异常处理策略)
12. [用户前台状态展示](#12-用户前台状态展示)
13. [所有需要修改/新建的文件清单](#13-所有需要修改新建的文件清单)
14. [环境变量清单](#14-环境变量清单)

---

## 1. 现状问题与根因

### 1.1 当前链路（单机假设）

```
Stripe webhook 收到 invoice.paid
    ↓
warmupRuntimeForUser(userId)   [src/lib/myclawgo/runtime-warmup.ts]
    ↓
ensureSessionById(userId)      [src/lib/myclawgo/session-store.ts]
  → 读/写 sessions.json（本地文件！）
    ↓
ensureUserContainer(session)   [src/lib/myclawgo/docker-manager.ts]
  → docker run 在当前机器上执行（本机 Docker！）
```

```
用户发消息 POST /api/chat/send
    ↓
resolveUserBridgeTarget(userId)  [src/lib/myclawgo/bridge-target.ts]
  → getSession → 读 sessions.json（本地文件！）
  → docker inspect containerName → 取 172.17.x.x（本机 Docker！）
  → bridgeBaseUrl = http://172.17.x.x:18080
    ↓
请求转发到容器内 bridge
```

### 1.2 三个必须拆掉的单机假设

| 假设 | 文件 | 症状 |
|------|------|------|
| Session 存本地文件 | `session-store.ts:20` — `sessions.json` | 多机时其他机器读不到 |
| Bridge IP 靠 docker inspect | `bridge-target.ts:18` — `execFileAsync('docker', ['inspect'...])` | 容器在别的机器上时取不到 IP |
| Docker 操作在本机执行 | `docker-manager.ts:331` — `execFileAsync('docker', ['run'...])` | 无法在远程主机上建容器 |

### 1.3 为什么现在必须改

1. 单机内存上限约 3 GB 可用，Pro 用户每个容器 2 GB，最多 1–2 个用户
2. 支付 webhook 同步建容器，Hetzner 购机需要 60–180 秒 → Stripe 超时 + 用户卡死
3. 所有用户数据在一台机器上，单点故障风险极高

---

## 2. 目标架构

### 2.1 整体拓扑

```
                    ┌─────────────────────────────────────────┐
                    │             Control Plane                │
                    │  (现有 VPS：Next.js + Stripe + DB)       │
                    │  私网 IP: 10.0.0.1                       │
                    │  新增：Provision Worker（setInterval）   │
                    └──────────────────┬──────────────────────┘
                                       │ HTTP（Hetzner Private Network）
              ┌────────────────────────┼──────────────────────┐
              │                        │                       │
   ┌──────────▼──────────┐  ┌──────────▼──────────┐  ┌───────▼────────────┐
   │   Runtime Host 1    │  │   Runtime Host 2    │  │  Runtime Host 3    │
   │   10.0.0.10         │  │   10.0.0.11         │  │  10.0.0.12         │
   │   (现有机器)        │  │   (手动第二台)       │  │  (自动购买)        │
   │                     │  │                     │  │                    │
   │   host-agent: 8090  │  │   host-agent: 8090  │  │  host-agent: 8090  │
   │                     │  │                     │  │                    │
   │   ctr-A: 18001→18080│  │   ctr-C: 18001→18080│  │  ctr-E: 18001→18080│
   │   ctr-B: 18002→18080│  │   ctr-D: 18002→18080│  │                    │
   └─────────────────────┘  └─────────────────────┘  └────────────────────┘
```

### 2.2 角色职责

| 角色 | 运行内容 | 数量 |
|------|---------|------|
| **Control Plane** | Next.js + Stripe Webhook + DB + Provision Worker | 1 台（现有） |
| **Runtime Host** | Host Agent + N 个用户容器 | 动态 N 台 |
| **用户容器** | OpenClaw gateway（:18789）+ Bridge server（:18080，对外映射到 host 端口） | 每用户 1 个 |

### 2.3 跨机路由的关键改动

**当前方式（只能单机）：**
- bridge IP = `docker inspect` 取到的 `172.17.x.x`（Docker 内部网络，只有本机可路由）

**目标方式（跨机可用）：**
- 容器创建时，host-agent 分配一个唯一的 host 端口（范围 `18001–19000`）
- `docker run` 加 `-p {assignedPort}:18080`，把 bridge 端口映射到 host 的真实私网 IP
- `runtimeAllocation.bridgeBaseUrl = http://{host.privateIp}:{assignedPort}`
- control plane 通过 Hetzner 私网直接访问这个 URL

### 2.4 消息路由链路（多机目标状态）

```
用户浏览器 POST /api/chat/send
    ↓
Next.js（Control Plane 10.0.0.1）
  resolveUserBridgeTarget(userId)
    → 查 DB: runtimeAllocation WHERE userId = ?
    → 拼出 bridgeBaseUrl = http://10.0.0.11:18001    ← 不再 docker inspect！
    ↓
Runtime Host 2 上的容器 bridge（10.0.0.11:18001）
    ↓ 容器内 ws://127.0.0.1:18789
OpenClaw gateway → 处理 → 返回
    ↓
Next.js → 浏览器
```

---

## 3. 核心数据库改造

### 3.1 新增三张表

在 `src/db/schema.ts` 追加：

#### `runtimeHost` 表（Runtime 主机池）

```typescript
export const runtimeHost = pgTable('runtime_host', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Hetzner 侧信息
  provider: text('provider').notNull().default('hetzner'),
  providerServerId: text('provider_server_id'),      // Hetzner server.id
  providerServerName: text('provider_server_name'),  // Hetzner server.name

  // 网络
  region: text('region').notNull(),
  privateIp: text('private_ip'),                     // Hetzner private network IP
  publicIp: text('public_ip'),
  agentBaseUrl: text('agent_base_url'),              // http://{privateIp}:8090

  // 硬件规格
  serverType: text('server_type').notNull(),         // cx42 / cpx41 等
  totalCpu: integer('total_cpu').notNull(),
  totalMemoryMb: integer('total_memory_mb').notNull(),
  totalDiskGb: integer('total_disk_gb').notNull(),

  // 可分配容量（扣除宿主机保留 20% 后的上限）
  allocatableCpu: integer('allocatable_cpu').notNull(),
  allocatableMemoryMb: integer('allocatable_memory_mb').notNull(),
  allocatableDiskGb: integer('allocatable_disk_gb').notNull(),

  // 当前已分配量（逻辑累加，非实时测量）
  reservedCpu: integer('reserved_cpu').notNull().default(0),
  reservedMemoryMb: integer('reserved_memory_mb').notNull().default(0),
  reservedDiskGb: integer('reserved_disk_gb').notNull().default(0),
  containerCount: integer('container_count').notNull().default(0),

  // host 状态机
  status: text('status').notNull().default('provisioning'),
  // provisioning | registering | ready | draining | unhealthy | failed | deleted

  agentVersion: text('agent_version'),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

#### `runtimeAllocation` 表（用户→Host 分配）

```typescript
export const runtimeAllocation = pgTable('runtime_allocation', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text('user_id').notNull().unique(), // 一个用户只有一个 allocation
  hostId: text('host_id').notNull().references(() => runtimeHost.id),

  plan: text('plan').notNull(), // pro | premium | ultra

  // 分配的资源量
  allocatedCpu: integer('allocated_cpu').notNull(),
  allocatedMemoryMb: integer('allocated_memory_mb').notNull(),
  allocatedDiskGb: integer('allocated_disk_gb').notNull(),

  containerName: text('container_name').notNull(),
  containerStatus: text('container_status').notNull().default('pending'),
  // pending | running | stopped | failed

  // 跨机路由核心字段
  hostPort: integer('host_port'),           // 分配的 host 端口，如 18001
  bridgeBaseUrl: text('bridge_base_url'),   // http://{host.privateIp}:{hostPort}

  userDataDir: text('user_data_dir').notNull(), // host 上的数据目录路径

  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
  lastStartedAt: timestamp('last_started_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

#### `runtimeProvisionJob` 表（异步配置任务）

```typescript
export const runtimeProvisionJob = pgTable('runtime_provision_job', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text('user_id').notNull(),
  hostId: text('host_id'), // 确定分配到的 host 后填入

  triggerType: text('trigger_type').notNull(),
  // payment_subscription | payment_lifetime | payment_credit | manual | warmup_retry

  plan: text('plan').notNull(),
  requiredCpu: integer('required_cpu').notNull(),
  requiredMemoryMb: integer('required_memory_mb').notNull(),
  requiredDiskGb: integer('required_disk_gb').notNull(),

  status: text('status').notNull().default('pending'),
  // pending | selecting_host | provisioning_host | waiting_host_register
  // creating_container | ready | failed

  hetznerServerId: text('hetzner_server_id'), // 购机后记录
  attemptCount: integer('attempt_count').notNull().default(0),
  lastError: text('last_error'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

### 3.2 Provision Job 状态机

```
pending
  ↓ worker 拾取
selecting_host
  ↓ 有可用 host            ↓ 没有可用 host
creating_container     provisioning_host
  ↓                          ↓ Hetzner API 返回
  ↓                    waiting_host_register
  ↓                          ↓ host-agent 注册回来
  ↓ ←───────────────────────┘
  ↓ 容器健康检查通过
ready
  (OR) failed（重试 3 次后）
```

### 3.3 Host 状态机

```
provisioning（Hetzner API 已调用）
  ↓ cloud-init 完成，host-agent 启动并发注册请求
registering
  ↓ control plane 验证 registerToken 通过
ready  ←──── unhealthy（5 分钟无心跳后触发，心跳恢复回 ready）
  ↓ 管理员/自动触发 drain              ↓ 30 分钟无心跳
draining                             failed
  ↓ containerCount = 0
empty
  ↓ 确认删除
deleting → deleted
```

---

## 4. 四个阶段实施计划

| 阶段 | 目标 | 预估工时 | 里程碑验收标准 |
|------|------|---------|--------------|
| **Phase 1** | 解耦支付与容器创建，Session 迁移到 DB | 1–2 周 | 现有用户通过 DB 路由，功能正常，单机运行 |
| **Phase 2** | Host Agent + 多机调度，手动加第二台 | 2–3 周 | 两台机器都能承接新用户，control plane 自动调度 |
| **Phase 3** | Hetzner 自动购机，容量不足自动扩容 | 2–3 周 | 付款后自动购机并创建容器，用户无感等待 |
| **Phase 4** | 预热池 + 自动缩容，长期运营优化 | 按需 | warm spare 机器、空闲容器自动停机 |

**落地铁律：必须按顺序执行。跳过 Phase 1、2 直接做 Phase 3，会导致买回机器了但 control plane 不会路由。**

---

## 5. Phase 1 详细任务：解耦支付与容器创建

> **目标**：支付 webhook 不再直接建容器；Session 数据迁移到数据库；bridge-target 改为查 DB。  
> **完成后效果**：单机运行，但架构已经为多机做好准备。

### Task 1.1 数据库 schema 新增三张表

**文件**：`src/db/schema.ts`  
**操作**：追加 `runtimeHost`、`runtimeAllocation`、`runtimeProvisionJob` 三张表的 Drizzle 定义（见第 3 节）。  
**之后执行**：
```bash
pnpm db:generate   # 生成迁移文件
pnpm db:migrate    # 应用到数据库
```

### Task 1.2 Session Store 迁移到 DB

**文件**：`src/lib/myclawgo/session-store.ts`（全部重写）  
**原实现**：读写 `sessions.json` 本地文件  
**新实现**：改为读写 `runtimeAllocation` 表

关键接口保持不变（对调用方透明）：

```typescript
// 保持接口签名不变，内部实现换成 DB
export type UserSession = {
  id: string;             // userId
  containerName: string;
  userDataDir: string;    // 仍保留，用于兼容现有 docker-manager
  createdAt: string;
  lastActiveAt: string;
};

// getSession(userId) → 查 runtimeAllocation WHERE userId = ?
// ensureSessionById(userId) → 如果不存在 allocation 则创建
//   注意：Phase 1 阶段，allocation.hostId 指向手动预置的当前机器 host 记录
//   hostPort 暂时留空（仍用 docker inspect 方式，Phase 2 改造）
// touchSession(userId) → 更新 updatedAt
```

**迁移脚本**（Phase 1 上线前一次性运行）：
```
scripts/migrate-sessions-to-db.ts
  1. 读 sessions.json
  2. 检查 runtimeAllocation 中是否已存在
  3. 不存在则写入（hostId 指向手动插入的当前机器 runtimeHost 记录）
  4. 打印报告
```

### Task 1.3 手动插入当前机器的 runtimeHost 记录

**位置**：通过 `pnpm db:studio` 或脚本直接插入一条：

```sql
INSERT INTO runtime_host (
  id, provider, provider_server_id, region, private_ip, public_ip,
  agent_base_url, server_type,
  total_cpu, total_memory_mb, total_disk_gb,
  allocatable_cpu, allocatable_memory_mb, allocatable_disk_gb,
  reserved_cpu, reserved_memory_mb, reserved_disk_gb,
  container_count, status, created_at, updated_at
) VALUES (
  'host-main-01', 'hetzner', '{HETZNER_SERVER_ID}',
  'nbg1', '{PRIVATE_IP}', '{PUBLIC_IP}',
  'http://{PRIVATE_IP}:8090', 'cx33',   -- 按实际机型填
  4, 8192, 80,      -- total 规格
  3, 6553, 64,      -- allocatable = total × 0.8
  0, 0, 0,          -- 初始已分配（现有用户通过 migrate 脚本补上）
  0,                -- 容器数（migrate 脚本会更新）
  'ready', NOW(), NOW()
);
```

### Task 1.4 改造 bridge-target.ts

**文件**：`src/lib/myclawgo/bridge-target.ts`  
**原实现**：`docker inspect` 取 `172.17.x.x`  
**新实现**：查 `runtimeAllocation` → 取 `bridgeBaseUrl`

Phase 1 的过渡逻辑（`bridgeBaseUrl` 可能为空，此时回退到 docker inspect）：

```typescript
export async function resolveUserBridgeTarget(userId: string) {
  const db = await getDb();
  const [alloc] = await db
    .select()
    .from(runtimeAllocation)
    .leftJoin(runtimeHost, eq(runtimeAllocation.hostId, runtimeHost.id))
    .where(eq(runtimeAllocation.userId, userId))
    .limit(1);

  if (!alloc) {
    return { ok: false, code: 'runtime-not-provisioned', error: 'No allocation' };
  }

  // Phase 1 兼容：bridgeBaseUrl 已填则用 DB 值，否则 fallback docker inspect
  let baseUrl = alloc.runtimeAllocation.bridgeBaseUrl;
  if (!baseUrl) {
    // 过渡期 fallback（Phase 2 完成后删除这个分支）
    const ip = await getContainerIp(alloc.runtimeAllocation.containerName);
    baseUrl = `http://${ip}:${BRIDGE_PORT}`;
  }

  return {
    ok: true,
    userId,
    containerName: alloc.runtimeAllocation.containerName,
    bridge: {
      host: new URL(baseUrl).hostname,
      port: Number(new URL(baseUrl).port),
      token: getBridgeToken(),
      baseUrl,
    },
  };
}
```

### Task 1.5 改造 runtime-warmup.ts

**文件**：`src/lib/myclawgo/runtime-warmup.ts`  
**原实现**：直接调 `ensureUserContainer`（同步 docker run）  
**新实现**：写入 `runtimeProvisionJob`，由 worker 处理

```typescript
export async function warmupRuntimeForUser(userId: string, reason = 'payment') {
  const db = await getDb();

  // 防重复：检查是否已有进行中的 job
  const activeJob = await db.select()
    .from(runtimeProvisionJob)
    .where(and(
      eq(runtimeProvisionJob.userId, userId),
      inArray(runtimeProvisionJob.status, [
        'pending', 'selecting_host', 'provisioning_host',
        'waiting_host_register', 'creating_container',
      ])
    )).limit(1);
  if (activeJob.length > 0) return;

  // 检查是否已有就绪的 allocation
  const existingAlloc = await db.select()
    .from(runtimeAllocation)
    .where(and(
      eq(runtimeAllocation.userId, userId),
      eq(runtimeAllocation.containerStatus, 'running')
    )).limit(1);
  if (existingAlloc.length > 0) return;

  const plan = await getUserPlan(userId); // pro | premium | ultra
  const req = PLAN_RESOURCE_REQUIREMENTS[plan];

  await db.insert(runtimeProvisionJob).values({
    userId,
    triggerType: `payment_${reason}`,
    plan,
    requiredCpu: req.cpu,
    requiredMemoryMb: req.memoryMb,
    requiredDiskGb: req.diskGb,
    status: 'pending',
  });

  console.log(`[Provision] Job queued for ${userId}, plan=${plan}`);
}
```

### Task 1.6 实现 Provision Worker（Phase 1 简化版）

**文件**：`src/lib/myclawgo/provision-worker.ts`（新建）

Phase 1 版本的 worker 只需要处理"有可用 host 时直接建容器"这条路，Hetzner 购机留到 Phase 3：

```typescript
// 每 10 秒轮询一次
export async function processNextProvisionJob(db: DB) {
  // SKIP LOCKED 防止多实例重复处理
  const job = await db.transaction(async (tx) => {
    const [j] = await tx.select().from(runtimeProvisionJob)
      .where(eq(runtimeProvisionJob.status, 'pending'))
      .orderBy(asc(runtimeProvisionJob.createdAt))
      .limit(1)
      .for('update', { skipLocked: true });

    if (!j) return null;
    await tx.update(runtimeProvisionJob)
      .set({ status: 'selecting_host', updatedAt: new Date() })
      .where(eq(runtimeProvisionJob.id, j.id));
    return j;
  });

  if (!job) return;

  try {
    const hostId = await findAvailableHost(db, job.plan as any);

    if (!hostId) {
      // Phase 1：没有可用 host，暂时标记 failed 并通知管理员
      // Phase 3 会在这里自动购机
      await db.update(runtimeProvisionJob)
        .set({
          status: 'failed',
          lastError: 'No available host with sufficient capacity. Manual intervention required.',
          updatedAt: new Date(),
        })
        .where(eq(runtimeProvisionJob.id, job.id));
      // TODO: 发告警（Telegram/邮件）
      return;
    }

    await createContainerOnCurrentHost(db, job, hostId);
  } catch (err) {
    await db.update(runtimeProvisionJob)
      .set({
        status: job.attemptCount >= 3 ? 'failed' : 'pending',
        attemptCount: job.attemptCount + 1,
        lastError: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(runtimeProvisionJob.id, job.id));
  }
}
```

### Task 1.7 worker 启动注册

**文件**：`src/lib/myclawgo/worker-bootstrap.ts`（新建）

```typescript
let bootstrapped = false;

export function bootstrapWorkers() {
  if (bootstrapped) return;
  bootstrapped = true;

  if (process.env.ENABLE_PROVISION_WORKER !== 'true') return;

  setInterval(async () => {
    const db = await getDb();
    await processNextProvisionJob(db).catch(console.error);
  }, 10_000);

  console.log('[Worker] Provision worker started (10s interval)');
}
```

在 Next.js 合适位置启动（如 `src/app/layout.tsx` server-side 初始化，或通过 `instrumentation.ts`）。

### Task 1.8 前台 runtime-status 接口改造

**文件**：`src/app/api/chat/runtime-status/route.ts`（已存在，改造）

改为查 DB 返回详细状态：

```typescript
// 返回格式
{
  ok: true,
  state: 'not_started' | 'pending' | 'provisioning_host' | 'creating_container' | 'ready' | 'failed',
  message: string,
  estimatedSeconds?: number,
}
```

### Task 1.9 数据迁移（上线前一次性操作）

1. 运行 `scripts/migrate-sessions-to-db.ts`：将 `sessions.json` 中的现有用户 session 写入 `runtimeAllocation`，`bridgeBaseUrl` 留空（过渡期用 docker inspect 回退）
2. 在 `runtimeHost` 中手动插入当前机器记录
3. 更新 `runtimeHost.containerCount` 和 `reserved*` 字段（根据现有用户数）

---

## 6. Phase 2 详细任务：Host Agent + 多机调度

> **目标**：手动加一台第二机器，control plane 自动把新用户分配过去。  
> **完成后效果**：两台机器运行，allocation 通过 DB 路由，端口映射已启用，docker inspect 回退代码可删除。

### Task 2.1 Host Agent 开发

**目录**：`host-agent/`（独立 Node.js 项目）  
**技术栈**：TypeScript + Fastify + esbuild 打包为单文件

#### 接口列表

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/health` | 健康检查 | 无 |
| GET | `/metrics` | CPU/内存/磁盘/容器数上报 | `X-Agent-Secret` |
| POST | `/containers` | 创建并启动容器 | `X-Agent-Secret` |
| GET | `/containers/:name` | 查询容器状态 | `X-Agent-Secret` |
| POST | `/containers/:name/start` | 启动已停止的容器 | `X-Agent-Secret` |
| POST | `/containers/:name/stop` | 停止容器 | `X-Agent-Secret` |
| DELETE | `/containers/:name` | 删除容器 | `X-Agent-Secret` |
| GET | `/ports/available` | 返回当前未被占用的端口 | `X-Agent-Secret` |

#### `POST /containers` 关键逻辑

```typescript
interface CreateContainerRequest {
  containerName: string;
  image: string;
  cpus: string;           // "1" / "2" / "4"
  memoryMb: number;       // 2048 / 4096 / 8192
  diskGb: number;         // 20 / 40 / 80
  hostPort: number;       // control plane 分配的端口，如 18001
  userDataDir: string;    // 本 host 上的用户数据目录
  openrouterKey?: string;
  bridgeToken: string;
  seedConfigPath: string;
  seedBridgePath: string;
}

// 内部执行
// 1. 创建 userDataDir
// 2. docker run -d --name {containerName}
//      --cpus {cpus} --memory {memoryMb}m --memory-swap {memoryMb}m
//      --storage-opt size={diskGb}g（有就加，没有就忽略）
//      -p {hostPort}:18080           ← 端口映射，跨机路由关键
//      -v {userDataDir}:/home/openclaw/.openclaw
//      -v {seedConfigPath}:/seed/openclaw.json:ro
//      -v {seedBridgePath}:/opt/myclawgo-bridge:ro
//      -e MYCLAWGO_BRIDGE_TOKEN={bridgeToken}
//      {image} sleep infinity
// 3. prepareSeededRuntime（写入 auth-profiles.json + 启动 keep-gateway.sh）
// 4. 等待 gateway 就绪（最多 30 秒）
// 5. 返回 { ok: true, containerName, hostPort }
```

#### 鉴权机制

```typescript
// 每个请求（除 /health）必须携带
X-Agent-Secret: {HETZNER_RUNTIME_AGENT_SECRET}
// control plane 和所有 host agent 持有同一个 secret
// 通过 Hetzner Private Network 通信，secret 不过公网
```

#### Host Agent systemd service（预置在 snapshot 中）

```ini
[Unit]
Description=MyClawGo Host Agent
After=docker.service
Requires=docker.service

[Service]
EnvironmentFile=/etc/host-agent/env
ExecStart=/usr/local/bin/myclawgo-host-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### 心跳（Host Agent 主动上报）

启动后每 60 秒调用 control plane：

```typescript
POST {CONTROL_PLANE_URL}/api/internal/runtime-hosts/{hostId}/heartbeat
Body: { agentSecret, metrics: { cpuUsage, memoryUsedMb, memoryTotalMb, diskUsedGb, diskTotalGb, containerCount } }
```

### Task 2.2 Control Plane 新增内部接口

#### Host 注册接口

```
POST /api/internal/runtime-hosts/register
Auth: registerToken（一次性 JWT，由 cloud-init 注入，30 分钟有效）

处理流程：
1. 验证 registerToken（JWT 签名 + 未过期 + provisionJobId 匹配）
2. 查 Hetzner API 确认服务器确实属于本项目
3. 计算 allocatable 资源（总量 × 0.8）
4. 写入 runtimeHost，status = 'ready'
5. 更新 runtimeProvisionJob.status = 'creating_container'
6. 触发"给该用户创建容器"
```

#### Heartbeat 接口

```
POST /api/internal/runtime-hosts/:hostId/heartbeat
Auth: X-Agent-Secret header

处理流程：
1. 验证 agentSecret
2. 更新 runtimeHost.lastHeartbeatAt
3. 更新实时指标（仅监控用，不影响容量调度）
```

#### 容器创建完成通知接口

```
POST /api/internal/runtime-hosts/:hostId/container-ready
Auth: X-Agent-Secret header
Body: { containerName, hostPort, userDataDir }

处理流程：
1. 更新 runtimeAllocation.containerStatus = 'running'
2. 更新 runtimeAllocation.bridgeBaseUrl = http://{host.privateIp}:{hostPort}
3. 更新 runtimeHost.reservedCpu/Memory/Disk += allocated
4. 更新 runtimeHost.containerCount += 1
5. 更新 runtimeProvisionJob.status = 'ready'
```

### Task 2.3 改造 provision-worker.ts（多机完整版）

```typescript
async function runProvisionJob(db: DB, job: ProvisionJob) {
  // Step 1: 找可用 host
  const hostId = await findAvailableHost(db, job.plan);

  if (hostId) {
    // Step 2A: 有可用 host，直接调 host-agent 建容器
    await createContainerViaHostAgent(db, job, hostId);
  } else {
    // Step 2B: 没有可用 host
    // Phase 2：报错，等 Phase 3 接入 Hetzner 购机
    // Phase 3：自动购机
    throw new Error('No available host — Hetzner auto-purchase will be added in Phase 3');
  }
}

async function createContainerViaHostAgent(db: DB, job: ProvisionJob, hostId: string) {
  // 1. 查 host 信息
  const [host] = await db.select().from(runtimeHost).where(eq(runtimeHost.id, hostId));

  // 2. 分配端口（调 host-agent GET /ports/available）
  const agentResp = await fetch(`${host.agentBaseUrl}/ports/available`, {
    headers: { 'X-Agent-Secret': process.env.HETZNER_RUNTIME_AGENT_SECRET! },
  });
  const { port: hostPort } = await agentResp.json();

  // 3. 预先写入 allocation（pending 状态）
  const containerName = `myclawgo-${job.userId.slice(0, 8)}`;
  const userDataDir = `/runtime-data/users/${job.userId}`;
  await db.insert(runtimeAllocation).values({
    userId: job.userId, hostId, plan: job.plan,
    allocatedCpu: job.requiredCpu,
    allocatedMemoryMb: job.requiredMemoryMb,
    allocatedDiskGb: job.requiredDiskGb,
    containerName, containerStatus: 'pending',
    hostPort, userDataDir,
  });

  // 4. 调 host-agent POST /containers
  const createResp = await fetch(`${host.agentBaseUrl}/containers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Secret': process.env.HETZNER_RUNTIME_AGENT_SECRET! },
    body: JSON.stringify({
      containerName,
      image: process.env.MYCLAWGO_OPENCLAW_IMAGE,
      cpus: String(job.requiredCpu),
      memoryMb: job.requiredMemoryMb,
      diskGb: job.requiredDiskGb,
      hostPort,
      userDataDir,
      openrouterKey: await getUserOpenrouterKey(job.userId),
      bridgeToken: process.env.MYCLAWGO_BRIDGE_TOKEN!,
      seedConfigPath: process.env.HOST_OPENCLAW_CONFIG!,
      seedBridgePath: process.env.HOST_BRIDGE_ROOT!,
    }),
  });

  if (!createResp.ok) throw new Error(`Host agent create failed: ${await createResp.text()}`);

  // 5. host-agent 会在容器就绪后主动 POST /api/internal/.../container-ready
  // provision-worker 无需等待
  await db.update(runtimeProvisionJob)
    .set({ status: 'creating_container', hostId, updatedAt: new Date() })
    .where(eq(runtimeProvisionJob.id, job.id));
}
```

### Task 2.4 端口分配管理

Host Agent 负责维护本机已用端口：

```typescript
// host-agent/src/port-manager.ts
// 端口范围：18001–19000，最多 1000 个用户容器
// 启动时扫描已有 docker ps 获取已占用端口
// 分配时原子操作（内存锁），防止并发分配同一端口
```

### Task 2.5 bridge-target.ts 完成改造（Phase 2 最终版）

删除 Phase 1 的 docker inspect 回退代码，完全依赖 `runtimeAllocation.bridgeBaseUrl`。

### Task 2.6 手动部署第二台 Runtime Host 并验证

1. 购买一台 cx42（手动，在 Hetzner Console）
2. 安装 Docker、编译 host-agent 二进制、配置 systemd service
3. 在数据库手动插入第二台机器的 `runtimeHost` 记录
4. 触发一个新用户注册 + 支付，验证是否被分配到第二台机器

---

## 7. Phase 3 详细任务：Hetzner 自动购机

> **目标**：容量不足时，系统自动调用 Hetzner Cloud API 购买新机器，初始化后继续分配用户。  
> **完成后效果**：付款→自动购机→容器就绪，全程无人工干预。

### Task 3.1 Hetzner API 封装

**文件**：`src/lib/hetzner/client.ts`（新建）

```typescript
const HETZNER_API = 'https://api.hetzner.cloud/v1';

function hetznerHeaders() {
  return {
    Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// 创建服务器
export async function createRuntimeServer(params: {
  name: string;
  serverType: string;   // cx42
  location: string;     // nbg1
  imageId: string | number;  // snapshot ID 或 'ubuntu-24.04'
  sshKeyIds: number[];
  networkId: number;
  firewallIds: number[];
  labels: Record<string, string>;
  userData: string;     // cloud-init YAML
}): Promise<{ serverId: number; publicIp: string; actionId: number }>;

// 查询服务器状态（含私网 IP）
export async function getServerInfo(serverId: number): Promise<{
  status: string;        // initializing | starting | running
  privateIp?: string;
  publicIp?: string;
}>;

// 删除服务器（缩容/回收）
export async function deleteServer(serverId: number): Promise<void>;

// 列出所有服务器（按 label 过滤）
export async function listRuntimeServers(): Promise<Array<{
  id: number; name: string; status: string; labels: Record<string, string>;
}>>;
```

### Task 3.2 一次性注册 Token 机制

**文件**：`src/lib/hetzner/register-token.ts`（新建）

```typescript
import jwt from 'jsonwebtoken';

// 购机时生成，写入 cloud-init，30 分钟有效
export function createRegisterToken(provisionJobId: string): string {
  return jwt.sign(
    { provisionJobId, type: 'host-register' },
    process.env.HETZNER_RUNTIME_REGISTER_TOKEN_SECRET!,
    { expiresIn: '30m' }
  );
}

// host 注册时验证
export function verifyRegisterToken(token: string): { provisionJobId: string } {
  return jwt.verify(token, process.env.HETZNER_RUNTIME_REGISTER_TOKEN_SECRET!) as any;
}
```

### Task 3.3 Cloud-init 模板

**文件**：`src/lib/hetzner/cloud-init.ts`（新建）

```typescript
export function buildCloudInit(params: {
  agentSecret: string;
  controlPlaneUrl: string;
  registerToken: string;
  provisionJobId: string;
  openclawImage: string;
  hostAgentDownloadUrl: string;  // 从 control plane 提供
}): string {
  // 返回 cloud-init YAML 字符串
  // 包含：
  // 1. 写入 /etc/host-agent/env（含所有配置）
  // 2. 安装 Docker（如果是基础镜像）或直接启动（如果是 snapshot）
  // 3. 下载 host-agent 二进制
  // 4. systemctl enable + start host-agent
}
```

**两种模式：**

| 模式 | 适用场景 | cloud-init 内容 |
|------|---------|----------------|
| snapshot 模式（推荐） | 已有 snapshot | 只写配置文件 + `systemctl start host-agent` |
| 基础镜像模式 | 无 snapshot | 安装 Docker + 下载 host-agent + 配置 + 启动 |

snapshot 模式初始化时间：约 60–90 秒  
基础镜像模式初始化时间：约 3–8 分钟

### Task 3.4 provision-worker.ts 接入自动购机

在 `runProvisionJob` 的"没有可用 host"分支实现购机逻辑：

```typescript
async function purchaseNewHost(db: DB, job: ProvisionJob): Promise<void> {
  // 1. 检查是否已经有正在购机中的 job（避免重复购机）
  const alreadyProvisioning = await db.select()
    .from(runtimeProvisionJob)
    .where(and(
      eq(runtimeProvisionJob.status, 'waiting_host_register'),
      // 检查是否是本 job 自己触发的购机
    )).limit(1);

  if (alreadyProvisioning.length > 0) {
    // 把本 job 重置为 pending，等购机完成后再被调度
    await db.update(runtimeProvisionJob)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(runtimeProvisionJob.id, job.id));
    return;
  }

  // 2. 生成一次性注册 token
  const registerToken = createRegisterToken(job.id);

  // 3. 构建 cloud-init
  const cloudInit = buildCloudInit({
    agentSecret: process.env.HETZNER_RUNTIME_AGENT_SECRET!,
    controlPlaneUrl: process.env.NEXT_PUBLIC_BASE_URL!,
    registerToken,
    provisionJobId: job.id,
    openclawImage: process.env.MYCLAWGO_OPENCLAW_IMAGE!,
    hostAgentDownloadUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/downloads/host-agent`,
  });

  // 4. 调 Hetzner API 创建服务器
  const serverName = `myclawgo-runtime-${Date.now()}`;
  const { serverId, publicIp } = await createRuntimeServer({
    name: serverName,
    serverType: process.env.HETZNER_RUNTIME_SERVER_TYPE || 'cx42',
    location: process.env.HETZNER_RUNTIME_LOCATION || 'nbg1',
    imageId: process.env.HETZNER_RUNTIME_SNAPSHOT_ID || 'ubuntu-24.04',
    sshKeyIds: (process.env.HETZNER_RUNTIME_SSH_KEY_IDS || '').split(',').map(Number),
    networkId: Number(process.env.HETZNER_RUNTIME_NETWORK_ID),
    firewallIds: (process.env.HETZNER_RUNTIME_FIREWALL_IDS || '').split(',').map(Number),
    labels: { 'myclawgo-type': 'runtime-host', 'provision-job': job.id },
    userData: cloudInit,
  });

  // 5. 记录到数据库（provisioning 状态）
  await db.insert(runtimeHost).values({
    provider: 'hetzner',
    providerServerId: String(serverId),
    providerServerName: serverName,
    region: process.env.HETZNER_RUNTIME_LOCATION || 'nbg1',
    publicIp,
    serverType: process.env.HETZNER_RUNTIME_SERVER_TYPE || 'cx42',
    totalCpu: HETZNER_SERVER_SPECS[process.env.HETZNER_RUNTIME_SERVER_TYPE || 'cx42'].cpu,
    totalMemoryMb: HETZNER_SERVER_SPECS[...].memoryMb,
    totalDiskGb: HETZNER_SERVER_SPECS[...].diskGb,
    allocatableCpu: ...,   // total × 0.8
    allocatableMemoryMb: ...,
    allocatableDiskGb: ...,
    status: 'provisioning',
  });

  // 6. 更新 job 状态
  await db.update(runtimeProvisionJob)
    .set({
      status: 'waiting_host_register',
      hetznerServerId: String(serverId),
      updatedAt: new Date(),
    })
    .where(eq(runtimeProvisionJob.id, job.id));

  // 7. 等待 host-agent 主动调 /api/internal/runtime-hosts/register
  // provision-worker 不需要 polling，注册接口会触发"创建容器"下一步
}
```

### Task 3.5 注册超时检测

Worker 额外检查：若某 job 在 `waiting_host_register` 状态超过 30 分钟未注册：

```typescript
// 在 provision-worker 的 setInterval 中额外运行
async function checkRegistrationTimeouts(db: DB) {
  const threshold = new Date(Date.now() - 30 * 60 * 1000);
  const timedOutJobs = await db.select()
    .from(runtimeProvisionJob)
    .where(and(
      eq(runtimeProvisionJob.status, 'waiting_host_register'),
      lt(runtimeProvisionJob.updatedAt, threshold)
    ));

  for (const job of timedOutJobs) {
    if (job.hetznerServerId) {
      // 删除无法注册的 Hetzner 机器
      await deleteServer(Number(job.hetznerServerId)).catch(console.error);
    }
    // 重置 job 为 pending，触发重新购机
    await db.update(runtimeProvisionJob)
      .set({ status: 'pending', attemptCount: job.attemptCount + 1, updatedAt: new Date() })
      .where(eq(runtimeProvisionJob.id, job.id));
  }
}
```

### Task 3.6 host-agent 提供下载接口

**文件**：`src/app/api/downloads/host-agent/route.ts`（新建）

在购机时 cloud-init 从 control plane 下载最新的 host-agent 二进制（或者打包到 snapshot 中）：

```typescript
// 返回最新版 host-agent 二进制文件（从 /public/downloads/ 提供）
// 或者重定向到 R2 存储的下载 URL
```

---

## 8. Phase 4 详细任务：预热与自动缩容

> **目标**：用户不感知买机时间（预热池），长期空闲机器自动回收。

### Task 4.1 Warm Spare 预热池

监控逻辑：若所有 ready host 的剩余容量低于阈值（如 2 个 Pro 容量），提前购机备用。

```typescript
// 每 5 分钟检查一次
async function ensureWarmCapacity(db: DB) {
  const totalAvailableProSlots = await calcTotalAvailableSlots(db, 'pro');
  if (totalAvailableProSlots < WARM_SPARE_THRESHOLD) {
    // 触发购机（不需要关联 userId，status 设为 ready 即可等待分配）
    await purchaseWarmSpareHost(db);
  }
}
```

### Task 4.2 空闲容器自动停机

检测 `runtimeAllocation.lastStartedAt` 超过 20 分钟无活动，调 host-agent 停止容器（数据保留）。

### Task 4.3 Host 自动 Drain + 删机

当某台 host 的 `containerCount = 0` 且已 `draining` 超过 1 小时，自动调 Hetzner API 删除该服务器。

### Task 4.4 套餐分池

Ultra 套餐用户使用独立的 host 池（标签 `pool=ultra`），不与 Pro/Premium 混用。

---

## 9. 容量规划与机型选择

### 9.1 推荐机型（第一版）

| 机型 | vCPU | RAM | 磁盘 | 月费 | 推荐承载量 |
|------|------|-----|------|------|-----------|
| cx22 | 2 | 4 GB | 40 GB | €3.79 | 最多 1 个 Pro |
| cx32 | 4 | 8 GB | 80 GB | €7.49 | 2–3 个 Pro 或 1 个 Premium |
| **cx42** | **8** | **16 GB** | **160 GB** | **€14.99** | **5–6 个 Pro 或 2–3 个 Premium** |
| cx52 | 16 | 32 GB | 320 GB | €37.99 | 12 个 Pro 或 6 个 Premium |

**第一版统一使用 cx42**，理由：
- 承载 ~5–6 个 Pro 用户（内存维度），避免碎片小机器
- 月费 €14.99，分摊到 5 个 Pro 用户约 €3/人/月（低于 AWS 类似规格的 1/3）
- 升级路径清晰：单台换 cx52 即可

### 9.2 资源分配规则

保留 20% 给宿主机（Docker 守护进程、host-agent、系统进程）：

| 机型 | Allocatable CPU | Allocatable RAM | Allocatable Disk |
|------|----------------|----------------|-----------------|
| cx42 | 6 vCPU | 12.8 GB | 128 GB |

套餐资源占用：

| 套餐 | CPU | RAM | 磁盘 |
|------|-----|-----|------|
| Pro | 1 | 2 GB | 20 GB |
| Premium | 2 | 4 GB | 40 GB |
| Ultra | 4 | 8 GB | 80 GB |

cx42 单台最大承载（内存维度为瓶颈）：

| 套餐组合 | 最大用户数 |
|---------|-----------|
| 全 Pro | 6 |
| 全 Premium | 3 |
| 全 Ultra | 1（Ultra 建议独立 host） |

### 9.3 容量判断 SQL

```typescript
// src/lib/myclawgo/runtime-capacity.ts
export async function findAvailableHost(db: DB, plan: 'pro' | 'premium' | 'ultra') {
  const req = PLAN_RESOURCE_REQUIREMENTS[plan];
  const hosts = await db.select()
    .from(runtimeHost)
    .where(and(
      eq(runtimeHost.status, 'ready'),
      sql`(${runtimeHost.allocatableCpu} - ${runtimeHost.reservedCpu}) >= ${req.cpu}`,
      sql`(${runtimeHost.allocatableMemoryMb} - ${runtimeHost.reservedMemoryMb}) >= ${req.memoryMb}`,
      sql`(${runtimeHost.allocatableDiskGb} - ${runtimeHost.reservedDiskGb}) >= ${req.diskGb}`,
      lt(runtimeHost.containerCount, MAX_CONTAINERS_PER_HOST)
    ))
    .orderBy(desc(sql`(${runtimeHost.allocatableMemoryMb} - ${runtimeHost.reservedMemoryMb})`))
    .limit(1);
  return hosts[0]?.id ?? null;
}
```

---

## 10. 网络拓扑与安全设计

### 10.1 Hetzner Private Network 拓扑

```
Private Network: 10.0.0.0/24

Control Plane:    10.0.0.1
Runtime Host 1:   10.0.0.10
Runtime Host 2:   10.0.0.11
Runtime Host N:   10.0.0.1N
```

所有通信走私网，不走公网：
- Control Plane → Host Agent：`http://10.0.0.1N:8090`（host-agent）
- Control Plane → Container Bridge：`http://10.0.0.1N:1800X`（用户容器端口映射）

### 10.2 Firewall 规则

**Control Plane Firewall：**
```
入站允许：
  - 80/443（用户访问 Next.js）
  - 22（SSH，限运维 IP）
  - 私网段（10.0.0.0/24）所有端口（供 host-agent 心跳 + 注册）
入站拒绝：
  - 其他所有公网流量
出站允许：
  - 所有（访问 Stripe、Hetzner API、OpenRouter、DB 等）
```

**Runtime Host Firewall：**
```
入站允许：
  - 私网段（10.0.0.0/24）所有端口（供 control plane 访问 host-agent 和容器 bridge）
  - 22（SSH，限运维 IP）
入站拒绝：
  - 所有公网入站（容器 bridge 不对外暴露！）
出站允许：
  - 所有（容器内可访问 OpenRouter API 等外部服务）
```

### 10.3 Host Agent Secret 管理

- 所有机器使用同一个 `HETZNER_RUNTIME_AGENT_SECRET`（随机 32 字节）
- 通过 cloud-init 写入 `/etc/host-agent/env`（权限 `0600`），不进版本控制
- 如需轮换：更新环境变量并滚动重启所有 host-agent

---

## 11. 异常处理策略

### 11.1 六类失败场景

| 场景 | 检测方式 | 处理策略 |
|------|---------|---------|
| Hetzner API 创建失败 | API 返回非 2xx | `attemptCount+1`，延迟重试（最多 3 次） |
| Hetzner 项目配额不足 | 错误码 `resource_limit_exceeded` | 发 Telegram 告警，job 进入 failed，人工处理 |
| 目标机型当前 location 无库存 | 错误码 `server_type_not_available` | 尝试备用 location（hel1/fsn1），失败则告警 |
| cloud-init 失败，30 分钟内未收到注册 | `checkRegistrationTimeouts` | 删除 Hetzner 机器，job 重置为 pending 重新购机 |
| host 注册成功但容器创建失败 | host-agent 返回错误 | 重试容器创建（最多 3 次） |
| job 超过 30 分钟仍未 ready | 定时检查 `updatedAt` | 发站内通知 + Telegram 告警，支持人工重试 |

### 11.2 告警触发条件

在以下事件发生时向 Telegram/邮件发告警：
- 任意 job 最终进入 `failed`（3 次重试后）
- Hetzner API 连续 3 次调用失败
- 某台 host 超过 5 分钟没有 heartbeat
- 购买新机器后 30 分钟未收到注册请求

---

## 12. 用户前台状态展示

### 12.1 状态 API（改造现有接口）

```
GET /api/chat/runtime-status

返回：
{
  ok: true,
  state: 'not_started' | 'pending' | 'provisioning_host' | 'creating_container' | 'ready' | 'failed',
  message: '工作区准备中...',
  estimatedSeconds: 120,    // 可选，供前台进度条使用
}
```

### 12.2 前台文案

| 状态 | 展示文案 | 预计等待 |
|------|---------|---------|
| `not_started` | 请先订阅套餐以开启专属工作区 | — |
| `pending` | 工作区准备中，正在分配资源... | <1 分钟 |
| `provisioning_host` | 正在启动新服务器，预计需要 1-3 分钟... | 1–3 分钟 |
| `waiting_host_register` | 服务器初始化中，即将完成... | 30–60 秒 |
| `creating_container` | 正在创建您的专属容器... | <1 分钟 |
| `ready` | 工作区已就绪！正在跳转... | 立即 |
| `failed` | 工作区创建失败，已通知客服介入，请稍候 | 人工处理 |

### 12.3 前台轮询实现

```typescript
// 每 5 秒轮询一次，直到 state = ready 或 failed
useEffect(() => {
  const interval = setInterval(async () => {
    const res = await fetch('/api/chat/runtime-status');
    const data = await res.json();
    if (data.state === 'ready') {
      clearInterval(interval);
      router.push('/chat');  // 跳转到聊天页
    }
    if (data.state === 'failed') {
      clearInterval(interval);
      setError('工作区创建失败，请联系客服');
    }
    setStatus(data);
  }, 5000);
  return () => clearInterval(interval);
}, []);
```

---

## 13. 所有需要修改/新建的文件清单

### 需要修改的现有文件

| 文件 | 改造内容 | 阶段 |
|------|---------|------|
| `src/db/schema.ts` | 新增三张表 | Phase 1 |
| `src/lib/myclawgo/session-store.ts` | 内部实现换成查 `runtimeAllocation` DB | Phase 1 |
| `src/lib/myclawgo/bridge-target.ts` | 改为查 DB + `bridgeBaseUrl`，Phase 1 保留 docker inspect 回退 | Phase 1/2 |
| `src/lib/myclawgo/runtime-warmup.ts` | 改为只写 `runtimeProvisionJob`，不做 docker 操作 | Phase 1 |
| `src/payment/provider/stripe.ts` | `warmupRuntimeForUser` 调用点保持不变（函数签名不变，内部实现变） | Phase 1 |
| `src/app/api/chat/runtime-status/route.ts` | 改为查 DB 返回详细状态枚举 | Phase 1 |

### 需要新建的文件（Control Plane）

| 文件 | 说明 | 阶段 |
|------|------|------|
| `src/lib/myclawgo/runtime-capacity.ts` | 套餐资源映射 + `findAvailableHost` 容量判断 | Phase 1 |
| `src/lib/myclawgo/provision-worker.ts` | Provisioner Worker 主逻辑 | Phase 1 |
| `src/lib/myclawgo/worker-bootstrap.ts` | Worker 启动注册 | Phase 1 |
| `src/lib/hetzner/client.ts` | Hetzner Cloud API 封装 | Phase 3 |
| `src/lib/hetzner/register-token.ts` | 一次性 JWT 注册 token | Phase 3 |
| `src/lib/hetzner/cloud-init.ts` | cloud-init YAML 模板生成 | Phase 3 |
| `src/app/api/internal/runtime-hosts/register/route.ts` | Host 注册接口 | Phase 2 |
| `src/app/api/internal/runtime-hosts/[id]/heartbeat/route.ts` | Heartbeat 接口 | Phase 2 |
| `src/app/api/internal/runtime-hosts/[id]/container-ready/route.ts` | 容器创建完成通知 | Phase 2 |
| `src/app/api/downloads/host-agent/route.ts` | Host Agent 二进制下载 | Phase 3 |
| `scripts/migrate-sessions-to-db.ts` | 一次性迁移 sessions.json → DB | Phase 1 |
| `scripts/insert-existing-host.ts` | 手动插入现有机器 runtimeHost 记录 | Phase 1 |

### 需要新建的 Host Agent 项目

| 目录/文件 | 说明 | 阶段 |
|----------|------|------|
| `host-agent/` | 独立 Node.js + TypeScript 项目 | Phase 2 |
| `host-agent/src/index.ts` | Fastify 入口 | Phase 2 |
| `host-agent/src/routes/containers.ts` | 容器管理接口 | Phase 2 |
| `host-agent/src/routes/health.ts` | 健康检查 + metrics | Phase 2 |
| `host-agent/src/services/docker.ts` | docker run/start/stop/rm 封装 | Phase 2 |
| `host-agent/src/services/port-manager.ts` | 端口分配管理 | Phase 2 |
| `host-agent/src/services/heartbeat.ts` | 向 control plane 定时上报 | Phase 2 |
| `host-agent/src/services/openclaw.ts` | keep-gateway.sh 注入 + auth-profiles 写入 | Phase 2 |
| `host-agent/package.json` | 独立 package，不进 Next.js build | Phase 2 |

---

## 14. 环境变量清单

### Phase 1 新增（control plane）

```env
ENABLE_PROVISION_WORKER=true          # 启用 provision worker
```

### Phase 2 新增（control plane）

```env
HETZNER_RUNTIME_AGENT_SECRET=         # Host Agent 鉴权 Secret（openssl rand -hex 32）
MYCLAWGO_BRIDGE_PORT=18080            # 容器内 bridge 端口（固定值，已有）
```

### Phase 2（每台 runtime host 的 /etc/host-agent/env）

```env
AGENT_SECRET=                         # 同 HETZNER_RUNTIME_AGENT_SECRET
CONTROL_PLANE_URL=https://myclawgo.com
OPENCLAW_IMAGE=                       # 与 control plane 一致
MYCLAWGO_BRIDGE_TOKEN=                # 与 control plane 一致
DATA_DIR=/runtime-data                # 用户数据根目录（host 上）
PORT=8090                             # host-agent 监听端口
```

### Phase 3 新增（control plane）

```env
HETZNER_API_TOKEN=                    # Hetzner Cloud API Token（Read & Write）
HETZNER_RUNTIME_SERVER_TYPE=cx42     # Runtime host 机型
HETZNER_RUNTIME_LOCATION=nbg1        # 区域（nbg1/hel1/fsn1）
HETZNER_RUNTIME_SNAPSHOT_ID=         # Snapshot ID（留空则用基础镜像）
HETZNER_RUNTIME_NETWORK_ID=          # Private Network ID
HETZNER_RUNTIME_FIREWALL_IDS=        # Firewall ID，逗号分隔
HETZNER_RUNTIME_SSH_KEY_IDS=         # SSH Key ID，逗号分隔
HETZNER_RUNTIME_REGISTER_TOKEN_SECRET= # 注册 token 签名密钥（openssl rand -hex 32）
```

---

## 附：开发开始前需要你手动做的事

详见配套文档：**`HETZNER_MANUAL_SETUP_GUIDE_2026-04-22.md`**

主要包括：
1. 在 Hetzner Console 创建 API Token
2. 上传 SSH 公钥
3. 创建 Private Network
4. 创建 Firewall
5. 确认现有 Control Plane 服务器的私网 IP
6. 准备 Snapshot（可选，但强烈推荐）
7. 在 `.env` 中填写上述 ID

完成以上手动配置后，开发即可开始。
