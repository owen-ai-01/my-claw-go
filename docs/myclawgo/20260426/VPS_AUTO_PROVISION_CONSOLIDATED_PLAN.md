# VPS 自动购机完整方案（汇总 + 架构决策）

> 版本：2026-04-26  
> 定位：汇总之前所有相关文档，形成可直接开发的最终方案，并新增"一用户一 VPS"vs"多用户共享主机"的架构决策分析。

---

## 目录

1. [之前所有文档结论汇总](#1-之前所有文档结论汇总)
2. [架构决策：一用户一 VPS vs 共享主机](#2-架构决策一用户一-vps-vs-共享主机)
3. [一用户一 VPS 成本分析](#3-一用户一-vps-成本分析)
4. [Hetzner 扩容上限与配额规划](#4-hetzner-扩容上限与配额规划)
5. [最终选型：一用户一 VPS（简化版）](#5-最终选型一用户一-vps简化版)
6. [简化后的系统架构](#6-简化后的系统架构)
7. [三个核心数据库表（不变）](#7-三个核心数据库表不变)
8. [简化后的 Provision 流程](#8-简化后的-provision-流程)
9. [必须改造的单机假设代码（不变）](#9-必须改造的单机假设代码不变)
10. [开发阶段拆分](#10-开发阶段拆分)
11. [你需要提前做的 Hetzner 手动操作](#11-你需要提前做的-hetzner-手动操作)

---

## 1. 之前所有文档结论汇总

### 文档列表

| 文档 | 核心结论 |
|------|---------|
| `paid-user-triggered-vps-provisioning-plan-2026-04-21.md` | 必须做成异步 job，不能在 webhook 里同步买机；先拆单机假设 |
| `hetzner-auto-scale-runtime-host-plan-2026-04-21.md` | 建议"按容量扩主机池"，不建议"一用户一 VPS"（当时的观点） |
| `current-runtime-capacity-estimate-3g-available-ram-2026-04-21.md` | 当前单机 3GB available，只能稳定承载 1 个 Pro 用户 |
| `multi-host-architecture-guide-2026-04-21.md` | 详细说明多机路由：私网通信、端口映射、Host Agent 设计、3 个新 DB 表 |
| `hetzner-paid-trigger-auto-provision-technical-2026-04-21.md` | 完整技术方案：5 个单机假设代码改造、Host Agent API 设计、Provision Worker、cloud-init |
| `COMPLETE_MULTI_HOST_AUTO_PROVISION_PLAN_2026-04-22.md` | 4 阶段实施计划、DB Schema 完整定义、文件清单、环境变量 |
| `HETZNER_PROJECT_STRUCTURE_FAQ_2026-04-22.md` | SaaS 和 runtime host 必须在同一 Hetzner 项目（Private Network 不跨项目） |
| `HETZNER_MANUAL_SETUP_GUIDE_2026-04-22.md` | 你需要手动做的 7 个操作：API Token、SSH Key、私网、防火墙、Snapshot、.env |
| `BRIDGE_ARCHITECTURE_RISK_ANALYSIS_2026-04-22.md` | Bridge 主要风险：无 streaming（同步 agent.wait 90s）、in-memory relay 状态、无 keep-bridge.sh |

### 之前文档的核心共识（不变）

1. **必须做成异步 Provision Job**：webhook 不能同步等购机（60–180 秒）
2. **必须拆掉 3 个单机假设**：sessions.json → DB、docker inspect → DB 查 bridgeUrl、本机 docker run → Host Agent 接口
3. **必须新建 3 张 DB 表**：`runtimeHost`、`runtimeAllocation`、`runtimeProvisionJob`
4. **必须在同一 Hetzner 项目**：Private Network 要求
5. **用户前台状态**：`pending → provisioning → ready`，不能假设"支付即可用"

---

## 2. 架构决策：一用户一 VPS vs 共享主机

之前文档（`hetzner-auto-scale-runtime-host-plan-2026-04-21.md`）推荐"多用户共享主机池"，主要理由是防止资源浪费。  
**但在你现在的阶段，重新评估，"一用户一 VPS"反而更合适。**

### 两种方案对比

| 维度 | 多用户共享主机 | **一用户一 VPS（推荐）** |
|------|--------------|----------------------|
| 实现复杂度 | 高：需要调度器、容量计算、Host Agent、端口分配、用户隔离 | **低**：支付后直接购一台机，无需调度逻辑 |
| 隔离性 | 弱：一个用户跑满 CPU 影响同机所有用户 | **完全隔离**：专属 VPS，互不影响 |
| 资源利用率 | 高：多人共享，浪费少 | 低：用户不活跃时机器空转 |
| VPS 成本占比 | 低（多人分摊） | Pro: ~15%，Premium: ~13%，Ultra: ~8%（见下节详细分析） |
| 产品价值主张 | 普通共享云服务 | **"你专属的 AI 工作站"** → 更好卖 |
| 用户迁移风险 | 高：一台主机挂了影响所有用户 | 低：只影响该用户自己 |
| Hetzner 配额压力 | 低：50 用户只需 5–10 台主机 | 高：50 用户需要 50 台机（需提前申请配额） |
| 调试和运维 | 复杂：需要跨机追踪 | 简单：每台机独立，ssh 进去直接看 |
| 适用阶段 | 大规模（1000+ 用户） | **早期到中期（0–500 用户）** |

### 为什么现阶段选"一用户一 VPS"更合适

1. **你是早期 SaaS，用户量还小**：共享主机的复杂调度逻辑是为了高密度省钱，你现在不需要
2. **成本可以接受**：Pro 用 cx22（约 ¥30/月），售价 ¥217/月，成本占比 ~14%，合理
3. **"专属服务器"是竞争优势**：UniClaw、MyClaw 都是共享基础设施，你可以主打"独占资源"
4. **实现周期大幅缩短**：从 4 个 Phase 降到 2 个 Phase，可以快 2–3 倍落地
5. **调度复杂度为零**：不需要容量计算、不需要端口分配、不需要 Host Selector

---

## 3. 一用户一 VPS 成本分析

### 容器资源需求（现有代码）

```
Pro:     1 vCPU, 2 GB RAM, 20 GB disk
Premium: 2 vCPU, 4 GB RAM, 40 GB disk
Ultra:   4 vCPU, 8 GB RAM, 80 GB disk
```

### 对应 Hetzner 机型（2026 年价格，含 VAT）

| 订阅套餐 | 推荐机型 | 规格 | 月费（约） | 年费（约） |
|---------|--------|------|----------|---------|
| Pro（¥218/月） | **cx22** | 2 vCPU，4 GB RAM，40 GB disk | ~€3.79 ≈ ¥29 | ~€45 ≈ ¥352 |
| Premium（¥436/月） | **cx32** | 4 vCPU，8 GB RAM，80 GB disk | ~€7.52 ≈ ¥58 | ~€90 ≈ ¥700 |
| Ultra（¥1454/月） | **cx42** | 8 vCPU，16 GB RAM，160 GB disk | ~€14.99 ≈ ¥116 | ~€180 ≈ ¥1396 |

> 注：cx22 给 Pro 用户有冗余（给了 4GB RAM，Pro 只用 2GB），但这正好是安全余量，无需精确匹配。

### 毛利率分析

| 套餐 | 月收入 | VPS 月成本 | 成本占比 | 剩余（不含 AI token 等） |
|------|-------|-----------|---------|------------------------|
| Pro | $29.90 | ~$4.10 | **13.7%** | $25.80 |
| Premium | $59.90 | ~$8.15 | **13.6%** | $51.75 |
| Ultra | $199.90 | ~$16.25 | **8.1%** | $183.65 |

**结论：成本完全可以接受。即使加上 AI token 成本，毛利仍然健康。**

### 用户不活跃时的 VPS 保留策略

- **活跃用户**：VPS 全程保持运行
- **30 天无登录**：发邮件提醒，可设置"暂停"（Hetzner 支持关机，关机后只收磁盘费）
- **用户退订**：VPS 删除（删前 24 小时告知），数据可选导出
- **Hetzner 关机省钱**：Server 关机后只收磁盘存储费（约 €0.012/GB/月），一台 cx22 关机后约 €0.50/月（节省 87%）

---

## 4. Hetzner 扩容上限与配额规划

### 默认配额

Hetzner 新项目默认 Server 上限约 **10 台**（不同账号历史可能不同）。

### 一用户一 VPS 需要多少台？

| 用户规模 | 所需 VPS 数量 | 配额要求 |
|---------|-------------|---------|
| 10 个付费用户 | ~10 台 | 默认配额可能够 |
| 50 个付费用户 | ~50 台 | 需要申请提升到 100 |
| 200 个付费用户 | ~200 台 | 需要申请提升到 300 |
| 500 个付费用户 | ~500 台 | 需要提前沟通 Hetzner |

### 如何申请配额提升

**Hetzner 很愿意批准合法商业用途的配额请求。**

申请方式：
1. 登录 Hetzner Console → 右上角头像 → **Support**
2. 发邮件，说明：
   - 公司名/项目名：MyClawGo
   - 用途：SaaS 平台，每个付费用户独享一台 runtime VPS
   - 当前配额：X 台
   - 申请配额：200 台（或更高）
   - 预计时间线：6–12 个月内增长

**通常 1–2 个工作日批复，批到 100–500 台没有问题。**

### 备用方案：多 Hetzner 项目 + 公网通信

如果配额紧张，可以使用多个 Hetzner 项目：

```
项目 A（myclawgo-production）：Control Plane + 前 50 个用户 VPS
项目 B（myclawgo-runtime-2）：第 51–100 个用户 VPS
项目 C（myclawgo-runtime-3）：第 101–150 个用户 VPS
```

**注意**：多项目方案中 Private Network 不跨项目，需要走公网通信（加 TLS + Agent Secret 保护）。

对于一用户一 VPS 方案，这其实不是问题：
- 每台用户 VPS 只和 Control Plane 通信
- 用户 VPS 之间不需要互通
- 走公网（HTTPS）+  Agent Secret 鉴权，安全可接受

**推荐先用单项目，等配额问题出现再拆。**

---

## 5. 最终选型：一用户一 VPS（简化版）

### 模型定义

```
用户支付订阅
    ↓
写入 runtimeProvisionJob（异步）
    ↓
Provision Worker 调用 Hetzner API 购买专属 VPS
    ↓
cloud-init 初始化（Docker + Bridge + OpenClaw）
    ↓
VPS ready，写入 runtimeHost + runtimeAllocation
    ↓
用户可以开始聊天
```

### 与共享主机方案的核心区别

| 操作 | 共享主机 | **一用户一 VPS** |
|------|---------|----------------|
| Host 选择 | 需要调度器计算容量 → 选一台现有主机 | **直接购买新机** |
| 端口分配 | 需要在主机上分配空闲端口（18001–19000） | **固定端口 18080**（整台机只跑这一个用户） |
| 资源隔离 | Docker `--cpus` `--memory` 软限制 | **VPS 级别硬隔离** |
| 容量规划 | 复杂：每台主机记录 reserved/allocatable | **不需要**：一机一用户，永远有容量 |
| Bridge URL | `http://10.0.0.X:{端口}/` | **`http://10.0.0.X:18080/`**（固定） |

---

## 6. 简化后的系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    Control Plane                         │
│   Hetzner 私网 IP: 10.0.0.1                             │
│                                                          │
│   Next.js + Stripe Webhook                               │
│   Provision Worker（每 30 秒轮询 pending job）            │
│   runtimeHost 表（每行 = 1 台用户专属 VPS）               │
│   runtimeAllocation 表（用户 → VPS 的映射）              │
└──────────────┬──────────────────────────────────────────┘
               │ Hetzner Private Network（10.0.0.0/24）
               │
       ┌───────┴────────────────────────────────────┐
       │                                            │
       ▼                                            ▼
┌──────────────┐                          ┌──────────────┐
│ 用户 A 专属  │                          │ 用户 B 专属  │
│ cx22 VPS     │                          │ cx32 VPS     │
│ 10.0.0.101  │                          │ 10.0.0.102  │
│              │                          │              │
│ Bridge:18080 │                          │ Bridge:18080 │
│ GW:18789     │                          │ GW:18789     │
│ HostAgent:   │                          │ HostAgent:   │
│   19090      │                          │   19090      │
└──────────────┘                          └──────────────┘
```

### 通信路径

```
用户 A 发消息
    ↓ POST /api/chat/send
Next.js（Control Plane）
    ↓ 查 runtimeAllocation → bridgeBaseUrl = http://10.0.0.101:18080
    ↓ HTTP（私网）
用户 A 的 cx22 Bridge（10.0.0.101:18080）
    ↓ WebSocket（本机回环）
OpenClaw Gateway（127.0.0.1:18789）
    ↓
OpenClaw Agent 回复
```

---

## 7. 三个核心数据库表（不变）

与之前文档定义一致，但一用户一 VPS 模型下，`runtimeHost` 和用户是 1:1 关系。

### 7.1 `runtimeHost`

```ts
export const runtimeHost = pgTable('runtimeHost', {
  id: text('id').primaryKey().$defaultFn(generateId),
  userId: text('userId').references(() => user.id),      // 1:1 用户关系
  provider: text('provider').notNull().default('hetzner'),
  providerServerId: text('providerServerId'),
  name: text('name').notNull(),
  region: text('region').notNull().default('nbg1'),
  privateIp: text('privateIp'),
  publicIp: text('publicIp'),
  serverType: text('serverType').notNull(),              // cx22 / cx32 / cx42
  status: text('status').notNull().default('provisioning'),
  // provisioning | registering | ready | stopped | deleting | failed
  agentBaseUrl: text('agentBaseUrl'),                    // http://10.0.0.X:19090
  agentSecret: text('agentSecret'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

### 7.2 `runtimeAllocation`

```ts
export const runtimeAllocation = pgTable('runtimeAllocation', {
  id: text('id').primaryKey().$defaultFn(generateId),
  userId: text('userId').notNull().unique().references(() => user.id),
  hostId: text('hostId').references(() => runtimeHost.id),
  plan: text('plan').notNull(),                         // pro | premium | ultra
  bridgeBaseUrl: text('bridgeBaseUrl'),                 // http://10.0.0.X:18080
  status: text('status').notNull().default('pending'),
  // pending | provisioning | ready | stopped | failed
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

### 7.3 `runtimeProvisionJob`

```ts
export const runtimeProvisionJob = pgTable('runtimeProvisionJob', {
  id: text('id').primaryKey().$defaultFn(generateId),
  userId: text('userId').notNull().references(() => user.id),
  plan: text('plan').notNull(),
  triggerType: text('triggerType').notNull(),           // payment_new | payment_upgrade | manual_retry
  status: text('status').notNull().default('pending'),
  // pending | buying_vps | waiting_init | ready | failed
  hetznerServerId: text('hetznerServerId'),
  lastError: text('lastError'),
  attemptCount: integer('attemptCount').default(0),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

---

## 8. 简化后的 Provision 流程

### 8.1 触发（支付 webhook，已有代码位置）

**文件：`src/payment/provider/stripe.ts:828`**

```ts
// 现在：warmupRuntimeForUser(userId, 'subscription-paid');
// 改为：
await db.insert(runtimeProvisionJob).values({
  userId,
  plan: derivePlanFromStripe(subscription),
  triggerType: 'payment_new',
  status: 'pending',
});
```

### 8.2 Provision Worker（新建文件）

**文件：`src/lib/myclawgo/provision-worker.ts`**

```ts
// 每 30 秒轮询 pending jobs
async function processPendingJobs() {
  const jobs = await db
    .select()
    .from(runtimeProvisionJob)
    .where(
      and(
        eq(runtimeProvisionJob.status, 'pending'),
        lt(runtimeProvisionJob.attemptCount, 3)
      )
    )
    .for('update', { skipLocked: true })  // 防止多 Worker 重复处理
    .limit(5);

  for (const job of jobs) {
    await provisionUserVps(job);
  }
}

async function provisionUserVps(job: ProvisionJob) {
  // Step 1: 确定机型
  const serverType = {
    pro: 'cx22',
    premium: 'cx32',
    ultra: 'cx42',
  }[job.plan];

  // Step 2: 调用 Hetzner API 购机
  const server = await hetznerClient.servers.create({
    name: `myclawgo-user-${job.userId.slice(0, 8)}`,
    server_type: serverType,
    image: process.env.HETZNER_RUNTIME_SNAPSHOT_ID
      ? { id: parseInt(process.env.HETZNER_RUNTIME_SNAPSHOT_ID) }
      : { name: 'ubuntu-24.04' },
    networks: [parseInt(process.env.HETZNER_RUNTIME_NETWORK_ID)],
    firewalls: [{ firewall: { id: parseInt(process.env.HETZNER_RUNTIME_FIREWALL_IDS) } }],
    ssh_keys: process.env.HETZNER_RUNTIME_SSH_KEY_IDS.split(',').map(id => ({ id: parseInt(id) })),
    user_data: generateCloudInit({ userId: job.userId, registrationToken }),
    labels: { type: 'runtime-host', userId: job.userId, plan: job.plan },
  });

  // Step 3: 更新 job 状态
  await db.update(runtimeProvisionJob)
    .set({ status: 'waiting_init', hetznerServerId: String(server.id) })
    .where(eq(runtimeProvisionJob.id, job.id));

  // Step 4: 写入 runtimeHost（pending 状态）
  await db.insert(runtimeHost).values({
    userId: job.userId,
    providerServerId: String(server.id),
    name: server.name,
    serverType,
    status: 'provisioning',
  });
}
```

### 8.3 cloud-init 模板

新 VPS 启动后自动执行，完成后回调 Control Plane 注册：

```bash
#!/bin/bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker

# 如果使用 snapshot，Docker 和镜像已经预装，跳过上面步骤
# 仅需：启动 OpenClaw + Bridge

# 创建用户数据目录
mkdir -p /runtime-data/openclaw

# 启动 Bridge + OpenClaw（以 systemd service 方式）
# 这里使用宿主机的 Docker 直接运行（不再是容器内的 bridge 挂载方式）
# 用户 A 的 VPS 整台机就是他的"容器"
docker run -d \
  --name openclaw-runtime \
  --restart always \
  -p 18080:18080 \
  -v /runtime-data/openclaw:/home/openclaw/.openclaw \
  myclawgo-openclaw:latest

# 等待 bridge 健康
sleep 10

# 回调 Control Plane 注册（带一次性 registration token）
curl -X POST https://myclawgo.com/api/internal/runtime/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${REGISTRATION_TOKEN}" \
  -d "{
    \"userId\": \"${USER_ID}\",
    \"privateIp\": \"$(hostname -I | awk '{print $2}')\",
    \"publicIp\": \"$(curl -s ifconfig.me)\"
  }"
```

### 8.4 注册回调（新建 API Route）

**文件：`src/app/api/internal/runtime/register/route.ts`**

```ts
// VPS cloud-init 完成后回调此接口
export async function POST(req: Request) {
  // 验证 registration token（JWT，含 userId）
  const { userId, privateIp, publicIp } = await req.json();

  const bridgeBaseUrl = `http://${privateIp}:18080`;
  const agentBaseUrl = `http://${privateIp}:19090`;

  // 更新 runtimeHost 状态
  await db.update(runtimeHost)
    .set({ privateIp, publicIp, agentBaseUrl, status: 'ready' })
    .where(eq(runtimeHost.userId, userId));

  // 写入 runtimeAllocation
  await db.insert(runtimeAllocation).values({
    userId,
    plan: job.plan,
    bridgeBaseUrl,
    status: 'ready',
  });

  // 更新 provision job 完成
  await db.update(runtimeProvisionJob)
    .set({ status: 'ready' })
    .where(eq(runtimeProvisionJob.userId, userId));

  // 发邮件通知用户"工作区已就绪"
  await sendWorkspaceReadyEmail(userId);
}
```

---

## 9. 必须改造的单机假设代码（不变）

与之前文档一致，以下代码必须改：

| 文件 | 当前问题 | 改造方向 |
|------|---------|---------|
| `src/payment/provider/stripe.ts:828` | 直接调 `warmupRuntimeForUser()` | 改为写 `runtimeProvisionJob` |
| `src/lib/myclawgo/runtime-warmup.ts` | 同步建容器 | 删除或改为只写 job |
| `src/lib/myclawgo/session-store.ts` | 读写本地 `sessions.json` | 改为查 `runtimeAllocation` 表 |
| `src/lib/myclawgo/bridge-target.ts` | `docker inspect` 取本机 IP | 改为查 `runtimeAllocation.bridgeBaseUrl` |
| `src/lib/myclawgo/docker-manager.ts` | 本机 `docker run` | 一用户一 VPS 模式下，**整台机是用户的** → cloud-init 替代 docker-manager |
| `src/db/schema.ts` | 无相关表 | 新增 3 张表 |

### bridge-target 改造后（极简）

```ts
// 改造前：8 行 shell exec
const { stdout } = await execFileAsync('docker', ['inspect', ...]);
const ip = stdout.trim();
return { bridgeBaseUrl: `http://${ip}:18080`, ... };

// 改造后：2 行 DB 查询
const alloc = await db.query.runtimeAllocation.findFirst({
  where: eq(runtimeAllocation.userId, userId),
});
return { ok: true, target: { bridge: { baseUrl: alloc.bridgeBaseUrl, token: BRIDGE_TOKEN } } };
```

---

## 10. 开发阶段拆分

一用户一 VPS 模型大幅简化实现，从 4 个 Phase 缩减到 2 个：

### Phase 1：拆单机假设 + 手动首台机（约 1 周）

**目标**：现有单台机器手动注册进 DB，代码改到支持多机路由

**任务清单：**

- [ ] `src/db/schema.ts`：新增 3 张表，`pnpm db:generate && pnpm db:migrate`
- [ ] `src/lib/myclawgo/bridge-target.ts`：改为查 `runtimeAllocation` 表
- [ ] `src/lib/myclawgo/session-store.ts`：读写改到 `runtimeAllocation`
- [ ] `src/payment/provider/stripe.ts`：webhook 改为写 provision job（不直接建容器）
- [ ] `src/app/api/chat/runtime-status/route.ts`：改为查 `runtimeAllocation.status`
- [ ] 手动插入当前机器为第一条 `runtimeHost` 记录（SQL 直接 INSERT）
- [ ] 手动插入测试用户的 `runtimeAllocation` 记录（模拟 ready 状态）
- [ ] 验证：测试用户可以正常聊天（路由走 DB，不走 docker inspect）

**验收标准**：现有用户聊天不受影响，路由链路走 DB。

### Phase 2：自动购机（约 1 周）

**目标**：支付后全自动购买 Hetzner VPS，cloud-init 完成后用户可用

**任务清单：**

- [ ] `src/lib/hetzner/client.ts`：封装 Hetzner API（购机、查询、删除）
- [ ] `src/lib/myclawgo/provision-worker.ts`：Provision Worker 主逻辑
- [ ] cloud-init 脚本：Docker 启动 + Bridge 启动 + 注册回调
- [ ] `src/app/api/internal/runtime/register/route.ts`：注册回调端点
- [ ] 前端状态展示：`/chat` 页面显示"工作区准备中（预计 2–3 分钟）"
- [ ] Provision Worker 启动方式（建议用 `setInterval` 挂在 Next.js `instrumentation.ts`）
- [ ] 测试：新用户支付 → 等待 → VPS ready → 聊天可用

**验收标准**：全流程自动化，人不需要介入。

---

## 11. 你需要提前做的 Hetzner 手动操作

详见 `HETZNER_MANUAL_SETUP_GUIDE_2026-04-22.md`，以下是最关键的：

### 现在（Phase 1 开始前）

- [ ] 确保当前服务器已加入 Private Network（`ip addr show` 看到 `10.0.0.1`）
- [ ] 在 DB 手动 INSERT 当前机器为 `runtimeHost`（Phase 1 开发完再做）

### Phase 2 开始前

- [ ] 创建 Hetzner API Token（Read & Write）
- [ ] 制作 Snapshot（包含 Docker + OpenClaw 镜像，节省初始化时间）
- [ ] 确认 Firewall 规则（私网全放行，公网只开 SSH）
- [ ] 填写 `.env` 中的 Hetzner 相关变量

### 提前申请配额提升（现在就做，不要等到满了再申请）

向 Hetzner Support 申请把当前项目的 Server 上限提升到 **100 台**。

邮件模板：

```
Subject: Server quota increase request

Hi Hetzner support,

We are building MyClawGo (myclawgo.com), a SaaS platform where each 
paid user gets a dedicated VPS to run their AI workspace. 

We would like to request an increase in our server quota from the 
default to 100 servers in our project [project ID].

We expect to grow to 50-100 paid users in the next 3-6 months.
Machine type: mostly cx22 and cx32.

Thank you.
```

---

## 附：VPS 生命周期管理

| 事件 | 操作 |
|------|------|
| 用户首次支付 Pro | 自动购买 cx22，运行 cloud-init |
| 用户升级到 Premium | 购买 cx32，迁移数据，删除旧 cx22 |
| 用户降级 | 购买小机型，迁移，删旧机 |
| 用户取消订阅 | 发邮件告知，7 天后删除 VPS |
| 用户 30 天无活动 | 可选：关机（只收磁盘费） |
| 用户重新订阅 | 重新购机或从上次快照恢复 |

> **数据持久化**：取消前可以 tar + 上传用户数据到 R2，用户重订阅时恢复。  
> 这也是一个留存钩子："随时可以恢复你的历史对话和 AI 配置"。
