# 多机 Runtime 架构改造完整开发指南 2026-04-21

> 定位：可直接作为开发任务拆解依据的技术指南。覆盖：消息路由、VPS 动态创建、VPS 动态回收、用户生命周期、状态机、Stripe 事件、代码改造清单。

---

## 1. 现有单机架构的真实链路

在开始改造之前，必须先准确理解当前系统的运行方式，避免踩坑。

### 1.1 容器内部结构

`docker run` 时使用的关键参数（`docker-manager.ts:418`）：

```
docker run -d --name {containerName}
  --cpus {limits.cpus}
  --memory {limits.memory}
  -v {userDataDir}:/home/openclaw/.openclaw      # 用户数据持久化
  -v {HOST_OPENCLAW_CONFIG}:/seed/openclaw.json:ro
  -v {HOST_BRIDGE_ROOT}:/opt/myclawgo-bridge:ro  # ← 关键：bridge 代码挂载到容器内
  myclawgo-openclaw:xxx sleep-infinity
```

`HOST_BRIDGE_ROOT` 把 bridge 代码挂载进每个容器的 `/opt/myclawgo-bridge`。

**容器内实际运行的进程：**

```
容器内
├── sleep-infinity（主进程，保持容器存活）
├── openclaw gateway run --bind loopback --port 18789
│     └── 监听 127.0.0.1:18789（容器内回环，只有容器内可访问）
└── bridge server（从 /opt/myclawgo-bridge 启动）
      └── 监听 0.0.0.0:18080（容器内所有接口）
            └── 连接 ws://127.0.0.1:18789（同一容器内的 gateway）
```

### 1.2 消息路由链路（单机）

```
用户浏览器
    │ POST /api/chat/send
    ▼
Next.js（主机上）
    │ resolveUserBridgeTarget(userId)
    │ → 读 sessions.json → containerName
    │ → docker inspect → 取容器的 Docker 网络 IP（如 172.17.0.5）
    │ → baseUrl = http://172.17.0.5:18080
    ▼
容器内的 bridge server（172.17.0.5:18080）
    │ 连 ws://127.0.0.1:18789
    ▼
容器内的 OpenClaw gateway（127.0.0.1:18789）
    ▼
OpenClaw agent 处理消息，返回结果
```

### 1.3 为什么多机会直接失效

`172.17.0.5` 是 Docker 创建的内部网络地址，**只有宿主机本身可以路由到这个地址**。

一旦用户容器在 Host-B 上，但 Next.js 在 Host-A 上：

- Host-A 执行 `docker inspect` → 找不到容器（容器不在本机）→ 报错
- 即使拿到了 IP，Host-A 也无法访问 Host-B 上的 `172.17.x.x`

**结论：必须将容器的 bridge 端口映射到 runtime host 的真实 IP 上，才能实现跨机访问。**

---

## 2. 多机目标架构

### 2.1 整体拓扑

```
                    ┌──────────────────────────────────────┐
                    │          Control Plane               │
                    │   Next.js / Stripe / DB / Worker     │
                    │   私网 IP: 10.0.0.1                  │
                    └──────────┬───────────────────────────┘
                               │ HTTP，走 Hetzner Private Network
              ┌────────────────┼────────────────┐
              │                │                │
   ┌──────────▼──────┐ ┌───────▼──────┐ ┌──────▼────────┐
   │  Runtime Host 1  │ │Runtime Host 2│ │Runtime Host 3 │
   │  10.0.0.10       │ │ 10.0.0.11   │ │ 10.0.0.12     │
   │                  │ │             │ │  (自动购买)   │
   │ host-agent:8090  │ │host-agent:  │ │ host-agent:   │
   │                  │ │8090         │ │ 8090          │
   │ ctr-A  :18001    │ │ ctr-C:18001 │ │ ctr-E:18001   │
   │ ctr-B  :18002    │ │ ctr-D:18002 │ │               │
   └──────────────────┘ └─────────────┘ └───────────────┘
```

**角色说明：**

| 角色 | 运行内容 | 数量 |
|------|---------|------|
| Control Plane | Next.js + Stripe Webhook + Provision Worker + DB | 1 台（现有机器） |
| Runtime Host | Host Agent + 多个用户容器 | N 台（动态增减） |
| 用户容器 | OpenClaw gateway + Bridge server（端口映射到 host） | 每用户 1 个 |

### 2.2 端口映射策略（解决多机路由问题）

每个用户容器在创建时，host-agent 分配一个唯一的 host 端口（范围 18001–19000）：

```
docker run -d --name {containerName}
  ...
  -p {assignedPort}:18080    # ← 关键改动：bridge 端口映射到 host
  myclawgo-openclaw:xxx sleep-infinity
```

`runtimeAllocation.bridgeBaseUrl` 存储：

```
http://{host.privateIp}:{assignedPort}
```

Control plane 通过 Hetzner 私网访问这个 URL，完全跨机可达。

### 2.3 多机消息路由链路

```
用户浏览器
    │ POST /api/chat/send
    ▼
Next.js（Control Plane，10.0.0.1）
    │ resolveUserBridgeTarget(userId)
    │ → 查 DB: runtimeAllocation → bridgeBaseUrl = http://10.0.0.11:18001
    ▼
Runtime Host 2 上的容器 bridge（10.0.0.11:18001）
    │ 容器内连 ws://127.0.0.1:18789
    ▼
容器内 OpenClaw gateway → 处理消息 → 返回
    ▼
Next.js → 浏览器
```

整个转发逻辑在 `bridge-fetch.ts` 里已经实现，**只需要 `bridgeBaseUrl` 指向正确的 host:port，其他代码无需修改。**

---

## 3. WebSocket 路由问题

### 3.1 当前状态

`/api/chat/gateway-proxy` 当前返回 426，代码注释写着 "Step 3 will wire the actual WebSocket upgrade + frame forwarding"，尚未实现。

### 3.2 多机场景下的 WebSocket 方案

Next.js App Router 不支持 WebSocket 升级（底层 http server 不暴露）。多机场景下有三种方案：

**方案 A：前端直连 bridge（推荐第一版）**

control plane 给前端返回一个临时 token，前端直接建立：
```
ws://{host.privateIp}:{assignedPort}/gateway-ws?token=xxx
```

问题：runtime host 的私网 IP 不对公网暴露，需要 NAT 或内网穿透。

**方案 B：在 control plane 启 Standalone WebSocket Server（推荐生产）**

用一个独立 Node.js 进程（不是 Next.js）做 WS 代理：

```
浏览器 WS → standalone-ws-proxy（control plane 上）
                → 查 DB 找 bridgeBaseUrl
                → 建立 ws://{host.privateIp}:{assignedPort}/gateway-ws
                → 双向 pipe
```

这个 standalone proxy 可以用 `ws` 或 `Fastify + @fastify/websocket` 实现。

**方案 C：用 SSE 替代 WS（最简单）**

把实时 agent 推送从 WebSocket 改成 HTTP SSE：

```
GET /api/chat/stream/{taskId}    → SSE 流式推送
```

Next.js App Router 原生支持 SSE（`ReadableStream` response），无需额外基础设施。**如果 gateway-proxy WS 尚未被正式使用，优先选这个方案。**

---

## 4. 完整状态机

### 4.1 Host 生命周期

```
                    Hetzner API 创建
                         │
                    provisioning
                         │ cloud-init 完成，host-agent 启动
                    registering
                         │ 注册到 control plane 成功
                       ready ◄──────────── unhealthy（心跳超时后尝试恢复）
                         │                     │
                         │ 人工/自动触发 drain  │ 无法恢复
                      draining                 │
                         │ 所有容器已停止/迁移  ▼
                        empty              failed
                         │ 确认无容器
                      deleting
                         │ Hetzner API 删除
                       deleted
```

**状态转换规则：**

| 当前状态 | 触发条件 | 目标状态 |
|---------|---------|---------|
| `provisioning` | host-agent 启动并发起注册 | `registering` |
| `registering` | control plane 注册接口验证通过 | `ready` |
| `ready` | 心跳超过 5 分钟未收到 | `unhealthy` |
| `unhealthy` | 心跳恢复 | `ready` |
| `unhealthy` | 心跳超过 30 分钟 | `failed` |
| `ready` | 管理员/自动触发 | `draining` |
| `draining` | `containerCount = 0` | `empty` |
| `empty` | 确认后触发删除 | `deleting` |
| `deleting` | Hetzner API 返回成功 | `deleted` |

### 4.2 用户 Runtime 生命周期

```
not_provisioned
     │ 支付成功（订阅/终身/积分）
  pending（创建 provision job）
     │ worker 拾取
  selecting_host
     │ 有可用 host
  creating_container ──── 没有可用 host ──→ provisioning_host
     │                                            │
     │                                   waiting_host_register
     │                                            │ host ready
     │ ◄──────────────────────────────────────────┘
     │ 容器健康检查通过
   active
     │
     ├── 用户正常使用
     │
     │ 订阅取消 / 逾期未续费
  grace_period（7天，容器继续运行）
     │ 7天后仍未续费
  suspended（容器停止，数据保留）
     │ 30天后仍未续费
  archived（容器删除，reserved 资源释放）
```

### 4.3 Provision Job 状态

```
pending
→ selecting_host
→ provisioning_host        (无可用 host 时触发购机)
→ waiting_host_register    (等待 host-agent 注册)
→ creating_container       (在目标 host 上建容器)
→ ready                    (容器健康检查通过)
→ failed                   (超过最大重试次数)
```

---

## 5. 数据库 Schema

### 5.1 三张核心表

```typescript
// src/db/schema.ts 新增

import { integer, pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// ── Runtime Host ─────────────────────────────────────────
export const runtimeHost = pgTable('runtime_host', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Hetzner 侧
  provider:           text('provider').notNull().default('hetzner'),
  providerServerId:   text('provider_server_id').unique(),
  providerServerName: text('provider_server_name'),

  // 网络
  region:        text('region').notNull(),
  privateIp:     text('private_ip'),
  publicIp:      text('public_ip'),
  agentBaseUrl:  text('agent_base_url'),   // http://{privateIp}:8090

  // 硬件规格（不变）
  serverType:     text('server_type').notNull(),
  totalCpu:       integer('total_cpu').notNull(),
  totalMemoryMb:  integer('total_memory_mb').notNull(),
  totalDiskGb:    integer('total_disk_gb').notNull(),

  // 可分配上限（总量 × 0.8）
  allocatableCpu:       integer('allocatable_cpu').notNull(),
  allocatableMemoryMb:  integer('allocatable_memory_mb').notNull(),
  allocatableDiskGb:    integer('allocatable_disk_gb').notNull(),

  // 当前已分配量（逻辑累加，不是实时测量）
  reservedCpu:       integer('reserved_cpu').notNull().default(0),
  reservedMemoryMb:  integer('reserved_memory_mb').notNull().default(0),
  reservedDiskGb:    integer('reserved_disk_gb').notNull().default(0),
  containerCount:    integer('container_count').notNull().default(0),

  // 状态
  status: text('status').notNull().default('provisioning'),
  // provisioning | registering | ready | draining | empty | failed | deleted

  agentVersion:    text('agent_version'),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});

// ── Runtime Allocation（用户 ↔ Host 绑定）─────────────────
export const runtimeAllocation = pgTable('runtime_allocation', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text('user_id').notNull().unique(), // 一用户一条
  hostId: text('host_id').notNull().references(() => runtimeHost.id),

  plan: text('plan').notNull(), // pro | premium | ultra

  // 已分配资源量（用于 host reserved 计算）
  allocatedCpu:       integer('allocated_cpu').notNull(),
  allocatedMemoryMb:  integer('allocated_memory_mb').notNull(),
  allocatedDiskGb:    integer('allocated_disk_gb').notNull(),

  containerName:   text('container_name').notNull(),
  assignedHostPort: integer('assigned_host_port').notNull(), // 端口映射
  bridgeBaseUrl:   text('bridge_base_url').notNull(), // http://{host.privateIp}:{port}

  containerStatus: text('container_status').notNull().default('pending'),
  // pending | running | stopped | failed

  userDataDir: text('user_data_dir').notNull(),

  // 用户 runtime 生命周期
  runtimeStatus: text('runtime_status').notNull().default('pending'),
  // active | grace_period | suspended | archived

  gracePeriodStartAt: timestamp('grace_period_start_at'),
  suspendedAt:        timestamp('suspended_at'),
  archivedAt:         timestamp('archived_at'),

  lastStartedAt: timestamp('last_started_at'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
});

// ── Provision Job（异步购机和建容器任务）──────────────────
export const runtimeProvisionJob = pgTable('runtime_provision_job', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId:      text('user_id').notNull(),
  hostId:      text('host_id'),          // 确定分配到的 host 后填入

  triggerType: text('trigger_type').notNull(),
  // payment_subscription | payment_lifetime | payment_credit | manual | retry

  plan:             text('plan').notNull(),
  requiredCpu:      integer('required_cpu').notNull(),
  requiredMemoryMb: integer('required_memory_mb').notNull(),
  requiredDiskGb:   integer('required_disk_gb').notNull(),

  status: text('status').notNull().default('pending'),
  // pending | selecting_host | provisioning_host | waiting_host_register
  // | creating_container | ready | failed

  hetznerServerId: text('hetzner_server_id'), // 购机后记录
  registerToken:   text('register_token'),     // 一次性注册 JWT

  attemptCount: integer('attempt_count').notNull().default(0),
  lastError:    text('last_error'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Deprovision Job（停机/删容器/删 VPS 任务）────────────
export const runtimeDeprovisionJob = pgTable('runtime_deprovision_job', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId:      text('user_id').notNull(),
  allocationId: text('allocation_id').notNull(),
  hostId:      text('host_id').notNull(),

  triggerType: text('trigger_type').notNull(),
  // subscription_cancelled | subscription_expired | manual | grace_period_end

  status: text('status').notNull().default('pending'),
  // pending | stopping_container | container_stopped | deleting_container
  // | container_deleted | done | failed

  attemptCount: integer('attempt_count').notNull().default(0),
  lastError:    text('last_error'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

---

## 6. Hetzner Cloud API 集成

### 6.0 API Token：所有 Hetzner 操作的前提

**是的，调用 Hetzner Cloud API 的任何操作——创建 VPS、删除 VPS、查询 IP、绑定网络、挂载防火墙——都必须携带有效的 API Token。** 没有 token 的请求会直接返回 `401 Unauthorized`。

#### 6.0.1 Token 的作用范围

Hetzner Cloud API Token 是项目级别的，不是账号级别的。一个 Hetzner 账号下可以有多个 Project，每个 Project 独立生成 Token。Token 对该 Project 内的所有资源有权限，包括：

| API 操作 | 需要的权限 |
|---------|-----------|
| `GET /servers` 查服务器列表 | Read |
| `POST /servers` 创建 VPS | Read & Write |
| `DELETE /servers/{id}` 删除 VPS | Read & Write |
| `GET /servers/{id}` 查询服务器状态、IP | Read |
| `POST /servers/{id}/actions/create_image` 创建 Snapshot | Read & Write |
| `GET /networks` 查私有网络 | Read |
| `GET /firewalls` 查防火墙 | Read |
| `GET /ssh_keys` 查 SSH Key 列表 | Read |

**结论：只需要创建一个 `Read & Write` 权限的 Token 即可覆盖所有操作。**

#### 6.0.2 如何创建 Token

1. 登录 [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. 选择对应的 **Project**（runtime host 要放在哪个 Project 下）
3. 左侧菜单 → **Security** → **API Tokens**
4. 点击 **Generate API Token**
5. 填写描述（如 `myclawgo-runtime-provisioner`）
6. 权限选择 **Read & Write**
7. 点击 **Generate API Token**
8. **立即复制 Token**（只显示一次，关闭后无法再查看）

生成的 Token 格式示例：
```
hetzner-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### 6.0.3 Token 的安全存储

Token 具有对整个 Project 的完整控制权，泄露后攻击者可以删除所有服务器。

**必须做的：**

- 只存在服务器的环境变量中（`.env` 文件或 systemd `EnvironmentFile`）
- 永远不要提交到 git 仓库
- 在生产环境用 Secret Manager（如 Hetzner 无内置的，可用 Vault、Doppler、或直接用服务器 env）
- `env.example` 里只写变量名，不写真实值

**`.env`（本地/生产）：**
```env
HETZNER_API_TOKEN=hetzner-token-xxxxxxxxxx...
```

**`env.example`（提交到 git）：**
```env
HETZNER_API_TOKEN=          # Hetzner Cloud Project API Token（Read & Write）
```

#### 6.0.4 Token 在代码中的使用方式

每个请求的 `Authorization` 请求头携带 Bearer Token：

```typescript
// src/lib/hetzner/client.ts
function headers() {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) throw new Error('HETZNER_API_TOKEN is not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// 创建 VPS
await fetch('https://api.hetzner.cloud/v1/servers', {
  method: 'POST',
  headers: headers(),
  body: JSON.stringify({ name: 'runtime-001', server_type: 'cx42', ... }),
});

// 删除 VPS
await fetch(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
  method: 'DELETE',
  headers: headers(),
});

// 查询 VPS 状态和 IP
await fetch(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
  headers: headers(),
});
```

#### 6.0.5 其他需要提前在 Hetzner Console 配置的资源 ID

Hetzner API 创建 VPS 时需要引用几个已存在的资源 ID，这些 ID 需要提前在 Console 创建好，然后记录到环境变量：

| 资源 | 如何获取 ID | 用途 |
|------|-----------|------|
| SSH Key | Console → Security → SSH Keys → 上传公钥后查看 ID | 让你 SSH 进 runtime host 排查问题 |
| Private Network | Console → Networks → 创建私有网络 → 查看 ID | runtime host 之间和 control plane 通过内网通信 |
| Firewall | Console → Firewalls → 创建防火墙规则 → 查看 ID | 控制 runtime host 的入站出站规则 |
| Snapshot（可选） | Console → Servers → 对模板机做 Snapshot → 查看 Image ID | 加速新机器初始化 |

**Private Network 的 IP 段规划（重要）：**

创建私有网络时设置 IP 段，建议 `10.0.0.0/16`：
- Control Plane（现有机器）：手动指定 `10.0.0.1`
- Runtime Host 1：`10.0.0.10`
- Runtime Host 2：`10.0.0.11`
- 自动购买的新机器：Hetzner 自动从网段分配，通过 `GET /servers/{id}` 的 `private_net[].ip` 字段获取

#### 6.0.6 快速获取所有已有资源 ID 的方法

在有 Token 后，可以用以下命令查询：

```bash
# 查 SSH Keys
curl -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  https://api.hetzner.cloud/v1/ssh_keys | jq '.ssh_keys[] | {id, name}'

# 查 Networks
curl -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  https://api.hetzner.cloud/v1/networks | jq '.networks[] | {id, name, ip_range}'

# 查 Firewalls
curl -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  https://api.hetzner.cloud/v1/firewalls | jq '.firewalls[] | {id, name}'

# 查 Snapshots（type=snapshot 的 images）
curl -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  "https://api.hetzner.cloud/v1/images?type=snapshot" | jq '.images[] | {id, description, created}'

# 查 Server Types（确认 cx42 在当前 location 是否有库存）
curl -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  https://api.hetzner.cloud/v1/server_types | jq '.server_types[] | select(.name=="cx42") | {id, name, cores, memory, disk}'
```

### 6.1 环境变量

```env
HETZNER_API_TOKEN=                      # Read & Write 权限的 API Token
HETZNER_RUNTIME_SERVER_TYPE=cx42        # 默认机型
HETZNER_RUNTIME_LOCATION=nbg1          # nbg1 / hel1 / fsn1
HETZNER_RUNTIME_SNAPSHOT_ID=           # Snapshot ID（留空则用基础镜像）
HETZNER_RUNTIME_NETWORK_ID=            # Private Network ID
HETZNER_RUNTIME_FIREWALL_IDS=          # Firewall ID（逗号分隔）
HETZNER_RUNTIME_SSH_KEY_IDS=           # SSH Key ID（逗号分隔）
HETZNER_RUNTIME_AGENT_SECRET=          # Host Agent 鉴权 Secret（32 位随机）
HETZNER_RUNTIME_REGISTER_TOKEN_SECRET= # 注册 token JWT 签名密钥
CONTROL_PLANE_URL=https://myclawgo.com # Control Plane 公网 URL（cloud-init 回调用）
```

### 6.2 推荐机型（按套餐容量）

| 机型 | vCPU | RAM | 可分配后(×0.8) | 可容纳用户数 |
|------|------|-----|----------------|-------------|
| cx22 | 2 | 4GB | 1.6C/3.2GB | 1 Pro |
| cx32 | 4 | 8GB | 3.2C/6.4GB | 3 Pro 或 1 Premium |
| **cx42** | **8** | **16GB** | **6.4C/12.8GB** | **6 Pro 或 3 Premium** |
| cx52 | 16 | 32GB | 12.8C/25.6GB | 12 Pro 或 6 Premium |

**第一版统一用 `cx42`**，理由：在容量和成本之间最平衡，单机可承接 5-6 个 Pro 或 2-3 个 Premium。

### 6.3 Hetzner Client

```typescript
// src/lib/hetzner/client.ts

const API = 'https://api.hetzner.cloud/v1';

function headers() {
  return {
    Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export async function createServer(params: {
  name: string;
  serverType: string;
  location: string;
  snapshotId?: string;
  imageSlug?: string;       // 'ubuntu-24.04'
  sshKeyIds: number[];
  networkId: number;
  firewallIds: number[];
  labels: Record<string, string>;
  cloudInit: string;
}) {
  const res = await fetch(`${API}/servers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: params.name,
      server_type: params.serverType,
      location: params.location,
      image: params.snapshotId ?? params.imageSlug ?? 'ubuntu-24.04',
      ssh_keys: params.sshKeyIds,
      networks: [params.networkId],
      firewalls: params.firewallIds.map((id) => ({ firewall: id })),
      labels: params.labels,
      user_data: params.cloudInit,
      start_after_create: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Hetzner createServer failed: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return {
    serverId: String(data.server.id),
    serverName: data.server.name as string,
    publicIp: data.server.public_net.ipv4?.ip as string | undefined,
    status: data.server.status as string,
  };
}

export async function getServerInfo(serverId: string) {
  const res = await fetch(`${API}/servers/${serverId}`, { headers: headers() });
  const data = await res.json();
  return {
    status: data.server.status as string, // initializing | starting | running | off
    privateIps: (data.server.private_net as Array<{ ip: string }>).map(
      (n) => n.ip
    ),
    publicIp: data.server.public_net.ipv4?.ip as string | undefined,
  };
}

export async function deleteServer(serverId: string) {
  await fetch(`${API}/servers/${serverId}`, {
    method: 'DELETE',
    headers: headers(),
  });
}

export async function createSnapshot(serverId: string, description: string) {
  const res = await fetch(`${API}/servers/${serverId}/actions/create_image`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ type: 'snapshot', description }),
  });
  const data = await res.json();
  return { imageId: String(data.image.id) };
}
```

---

## 7. Cloud-init 脚本

### 7.1 Snapshot 版（推荐，初始化时间 60–90 秒）

Snapshot 应提前包含：Docker、OpenClaw 镜像、host-agent 二进制和 systemd service 文件。

```yaml
#cloud-config
# 只需写入配置，host-agent 已预装在 snapshot 中
write_files:
  - path: /etc/host-agent/env
    permissions: '0600'
    content: |
      AGENT_SECRET=${AGENT_SECRET}
      CONTROL_PLANE_URL=${CONTROL_PLANE_URL}
      REGISTER_TOKEN=${REGISTER_TOKEN}
      PROVISION_JOB_ID=${PROVISION_JOB_ID}
      OPENCLAW_IMAGE=${OPENCLAW_IMAGE}
      BRIDGE_ROOT=/opt/myclawgo-bridge
      DATA_DIR=/runtime-data

runcmd:
  - sleep 10
  - systemctl enable host-agent
  - systemctl start host-agent
```

### 7.2 基础镜像版（全量初始化，初始化时间 3–6 分钟）

```yaml
#cloud-config
packages:
  - curl
  - ca-certificates
  - gnupg

write_files:
  - path: /etc/host-agent/env
    permissions: '0600'
    content: |
      AGENT_SECRET=${AGENT_SECRET}
      CONTROL_PLANE_URL=${CONTROL_PLANE_URL}
      REGISTER_TOKEN=${REGISTER_TOKEN}
      PROVISION_JOB_ID=${PROVISION_JOB_ID}
      OPENCLAW_IMAGE=${OPENCLAW_IMAGE}
      BRIDGE_ROOT=/opt/myclawgo-bridge
      DATA_DIR=/runtime-data

  - path: /etc/systemd/system/host-agent.service
    content: |
      [Unit]
      Description=MyClawGo Host Agent
      After=docker.service
      Requires=docker.service

      [Service]
      EnvironmentFile=/etc/host-agent/env
      ExecStart=/usr/local/bin/host-agent
      Restart=always
      RestartSec=5

      [Install]
      WantedBy=multi-user.target

runcmd:
  # 安装 Docker
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update -y
  - apt-get install -y docker-ce docker-ce-cli containerd.io
  - systemctl enable docker && systemctl start docker
  # 下载 host-agent 二进制
  - curl -fsSL "${CONTROL_PLANE_URL}/downloads/host-agent-linux-amd64" -o /usr/local/bin/host-agent
  - chmod +x /usr/local/bin/host-agent
  # 下载 bridge 代码（供容器挂载）
  - mkdir -p /opt/myclawgo-bridge
  - curl -fsSL "${CONTROL_PLANE_URL}/downloads/bridge.tar.gz" | tar -xz -C /opt/myclawgo-bridge
  # 预拉镜像（后台，不阻塞注册）
  - docker pull "${OPENCLAW_IMAGE}" &
  # 启动 host-agent
  - systemctl daemon-reload
  - systemctl enable host-agent && systemctl start host-agent
```

---

## 8. Host Agent 设计

### 8.1 职责

部署在每台 runtime host 上的轻量 Fastify 服务，**代替 control plane 直接操作 Docker**。

### 8.2 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 无鉴权，k8s/Hetzner 健康检查 |
| GET | `/metrics` | 返回实时资源使用情况 |
| POST | `/containers` | 创建容器（docker run + 端口映射） |
| GET | `/containers/:name` | 查询容器状态 |
| POST | `/containers/:name/start` | 启动已停止的容器 |
| POST | `/containers/:name/stop` | 停止容器 |
| DELETE | `/containers/:name` | 删除容器 |
| GET | `/ports/available` | 返回当前 host 上可用的端口号 |

所有接口（除 `/health`）校验请求头：
```
X-Agent-Secret: {HETZNER_RUNTIME_AGENT_SECRET}
```

### 8.3 创建容器的核心逻辑

```typescript
// host-agent/src/routes/containers.ts

interface CreateContainerBody {
  containerName: string;
  image: string;
  hostPort: number;         // 端口映射：hostPort → 18080（bridge）
  cpus: string;
  memoryMb: number;
  userDataDir: string;
  bridgeRoot: string;       // /opt/myclawgo-bridge
  openclawConfigPath: string;
  authProfilesPath: string;
  pwDir: string;
  bridgeToken: string;
  openrouterKey?: string;
  envVars?: Record<string, string>;
}

async function createContainer(body: CreateContainerBody) {
  const args = [
    'run', '-d',
    '--name', body.containerName,
    '--cpus', body.cpus,
    '--memory', `${body.memoryMb}m`,
    '--memory-swap', `${body.memoryMb}m`,
    '--restart', 'unless-stopped',
    '-p', `${body.hostPort}:18080`,          // ← 多机关键：端口映射
    '-v', `${body.userDataDir}:/home/openclaw/.openclaw`,
    '-v', `${body.openclawConfigPath}:/seed/openclaw.json:ro`,
    '-v', `${body.authProfilesPath}:/seed/auth-profiles.json:ro`,
    '-v', `${body.bridgeRoot}:/opt/myclawgo-bridge:ro`,
  ];

  const envs: Record<string, string> = {
    BRIDGE_TOKEN: body.bridgeToken,
    ...body.envVars,
  };
  if (body.openrouterKey) envs.OPENROUTER_API_KEY = body.openrouterKey;

  for (const [k, v] of Object.entries(envs)) {
    args.push('-e', `${k}=${v}`);
  }

  args.push(body.image, 'sleep-infinity');

  await execFileAsync('docker', args);
}
```

### 8.4 Host Agent 自注册（cloud-init 启动后执行）

```typescript
// host-agent/src/register.ts

async function selfRegister() {
  const privateIp = await getPrivateIp();     // 从 network interface 读取
  const publicIp = await getPublicIp();
  const metrics = await collectMetrics();

  const res = await fetch(
    `${process.env.CONTROL_PLANE_URL}/api/internal/runtime-hosts/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registerToken: process.env.REGISTER_TOKEN,   // 一次性 JWT
        provisionJobId: process.env.PROVISION_JOB_ID,
        privateIp,
        publicIp,
        agentBaseUrl: `http://${privateIp}:8090`,
        serverType: process.env.SERVER_TYPE,
        agentVersion: HOST_AGENT_VERSION,
        metrics,
      }),
    }
  );

  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  console.log('[host-agent] Registered to control plane');
}

// 启动时重试注册，最多 10 次，每次间隔 15 秒
async function registerWithRetry() {
  for (let i = 0; i < 10; i++) {
    try {
      await selfRegister();
      return;
    } catch (e) {
      console.warn(`[host-agent] Register attempt ${i + 1} failed:`, e);
      await sleep(15_000);
    }
  }
  process.exit(1); // 注册失败则退出，systemd 会重启
}
```

### 8.5 技术栈

- TypeScript + Fastify
- 用 `esbuild` 编译为单文件，`pkg` 或 `bun build --compile` 打包为可执行文件
- 通过 systemd service 管理，崩溃自动重启

---

## 9. Control Plane 新增接口

### 9.1 Host 注册接口

```typescript
// src/app/api/internal/runtime-hosts/register/route.ts

export async function POST(req: Request) {
  const body = await req.json();
  const { registerToken, provisionJobId, privateIp, publicIp,
          agentBaseUrl, serverType, agentVersion, metrics } = body;

  // 1. 验证 JWT（防止非法 host 注册）
  let payload: { provisionJobId: string };
  try {
    payload = verifyRegisterToken(registerToken);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // 2. 确认 provisionJobId 存在且状态为 waiting_host_register
  const db = await getDb();
  const [job] = await db.select().from(runtimeProvisionJob)
    .where(and(
      eq(runtimeProvisionJob.id, payload.provisionJobId),
      eq(runtimeProvisionJob.status, 'waiting_host_register')
    )).limit(1);

  if (!job) {
    return NextResponse.json({ error: 'Job not found or invalid state' }, { status: 400 });
  }

  // 3. 计算 allocatable（总量 × 0.8）
  const spec = HETZNER_SERVER_SPECS[serverType];
  const alloc = {
    allocatableCpu: Math.floor(spec.cpu * 0.8),
    allocatableMemoryMb: Math.floor(spec.memoryMb * 0.8),
    allocatableDiskGb: Math.floor(spec.diskGb * 0.8),
  };

  // 4. 写入 runtimeHost
  const [host] = await db.insert(runtimeHost).values({
    provider: 'hetzner',
    providerServerId: job.hetznerServerId ?? undefined,
    region: process.env.HETZNER_RUNTIME_LOCATION!,
    privateIp,
    publicIp,
    agentBaseUrl,
    serverType,
    totalCpu: spec.cpu,
    totalMemoryMb: spec.memoryMb,
    totalDiskGb: spec.diskGb,
    ...alloc,
    status: 'ready',
    agentVersion,
    lastHeartbeatAt: new Date(),
  }).returning();

  // 5. 更新 job 状态，触发创建容器
  await db.update(runtimeProvisionJob)
    .set({ status: 'creating_container', hostId: host.id, updatedAt: new Date() })
    .where(eq(runtimeProvisionJob.id, job.id));

  return NextResponse.json({ ok: true, hostId: host.id });
}
```

### 9.2 Heartbeat 接口（host-agent 每 60 秒上报）

```typescript
// src/app/api/internal/runtime-hosts/[hostId]/heartbeat/route.ts

export async function POST(req: Request, { params }: { params: { hostId: string } }) {
  const body = await req.json();
  if (body.agentSecret !== process.env.HETZNER_RUNTIME_AGENT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = await getDb();
  await db.update(runtimeHost)
    .set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
    .where(eq(runtimeHost.id, params.hostId));

  return NextResponse.json({ ok: true });
}
```

### 9.3 用户 Runtime 状态查询

```typescript
// src/app/api/user/runtime-status/route.ts

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const userId = session.user.id;

  // 先查 allocation
  const [alloc] = await db.select().from(runtimeAllocation)
    .where(eq(runtimeAllocation.userId, userId)).limit(1);

  if (alloc?.runtimeStatus === 'active' && alloc.containerStatus === 'running') {
    return NextResponse.json({ status: 'ready' });
  }

  // 再查进行中的 job
  const [job] = await db.select().from(runtimeProvisionJob)
    .where(and(
      eq(runtimeProvisionJob.userId, userId),
      inArray(runtimeProvisionJob.status, [
        'pending', 'selecting_host', 'provisioning_host',
        'waiting_host_register', 'creating_container',
      ])
    )).limit(1);

  const STATUS_MAP: Record<string, string> = {
    pending: 'pending',
    selecting_host: 'pending',
    provisioning_host: 'provisioning_host',
    waiting_host_register: 'provisioning_host',
    creating_container: 'creating_container',
  };

  if (job) {
    return NextResponse.json({
      status: STATUS_MAP[job.status] ?? 'pending',
      jobStatus: job.status,
    });
  }

  return NextResponse.json({ status: 'not_provisioned' });
}
```

---

## 10. Provision Worker（购机+建容器）

### 10.1 核心调度逻辑

```typescript
// src/lib/myclawgo/provision-worker.ts

export async function processNextProvisionJob(db: DB) {
  // SKIP LOCKED 确保多进程不会重复处理同一个 job
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
    // Step 1: 查可用 host
    const hostId = await findAvailableHost(db, job.plan as Plan);

    if (hostId) {
      // Step 2a: 直接建容器
      await createContainerOnHost(db, job, hostId);
    } else {
      // Step 2b: 没容量，触发购机
      await purchaseNewHost(db, job);
      // 购机后 job 进入 waiting_host_register
      // host-agent 注册后会把 job 推进到 creating_container
      // 由 worker 下一个循环继续处理
    }
  } catch (err) {
    const isFinal = job.attemptCount >= 2;
    await db.update(runtimeProvisionJob).set({
      status: isFinal ? 'failed' : 'pending',
      attemptCount: job.attemptCount + 1,
      lastError: err instanceof Error ? err.message : String(err),
      updatedAt: new Date(),
    }).where(eq(runtimeProvisionJob.id, job.id));

    if (isFinal) {
      await notifyAdminJobFailed(job);
    }
  }
}
```

### 10.2 购机逻辑

```typescript
async function purchaseNewHost(db: DB, job: ProvisionJob) {
  const registerToken = createRegisterToken(job.id);

  // 生成唯一机器名
  const serverName = `runtime-${Date.now()}`;

  // 渲染 cloud-init（替换占位符）
  const cloudInit = renderCloudInit({
    agentSecret: process.env.HETZNER_RUNTIME_AGENT_SECRET!,
    controlPlaneUrl: process.env.CONTROL_PLANE_URL!,
    registerToken,
    provisionJobId: job.id,
    openclawImage: process.env.MYCLAWGO_OPENCLAW_IMAGE!,
  });

  const server = await createServer({
    name: serverName,
    serverType: process.env.HETZNER_RUNTIME_SERVER_TYPE || 'cx42',
    location: process.env.HETZNER_RUNTIME_LOCATION || 'nbg1',
    snapshotId: process.env.HETZNER_RUNTIME_SNAPSHOT_ID,
    imageSlug: 'ubuntu-24.04',
    sshKeyIds: parseIds(process.env.HETZNER_RUNTIME_SSH_KEY_IDS),
    networkId: Number(process.env.HETZNER_RUNTIME_NETWORK_ID),
    firewallIds: parseIds(process.env.HETZNER_RUNTIME_FIREWALL_IDS),
    labels: { role: 'runtime', provisionJobId: job.id },
    cloudInit,
  });

  await db.update(runtimeProvisionJob).set({
    status: 'waiting_host_register',
    hetznerServerId: server.serverId,
    registerToken,
    updatedAt: new Date(),
  }).where(eq(runtimeProvisionJob.id, job.id));
}
```

### 10.3 在 Host 上建容器

```typescript
async function createContainerOnHost(db: DB, job: ProvisionJob, hostId: string) {
  await db.update(runtimeProvisionJob)
    .set({ status: 'creating_container', hostId, updatedAt: new Date() })
    .where(eq(runtimeProvisionJob.id, job.id));

  const [host] = await db.select().from(runtimeHost)
    .where(eq(runtimeHost.id, hostId)).limit(1);

  // 分配端口（从 host 已用端口中找空闲的）
  const usedPorts = await getUsedPortsOnHost(db, hostId);
  const assignedPort = findFreePort(18001, 19000, usedPorts);

  const containerName = `myclawgo-${job.userId.slice(0, 8)}`;
  const userDataDir = `/runtime-data/${job.userId}`;
  const limits = PLAN_RESOURCE_REQUIREMENTS[job.plan as Plan];

  // 调用 host-agent 创建容器
  const agentRes = await fetch(`${host.agentBaseUrl}/containers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Secret': process.env.HETZNER_RUNTIME_AGENT_SECRET!,
    },
    body: JSON.stringify({
      containerName,
      image: process.env.MYCLAWGO_OPENCLAW_IMAGE,
      hostPort: assignedPort,
      cpus: String(limits.cpu),
      memoryMb: limits.memoryMb,
      userDataDir,
      bridgeRoot: '/opt/myclawgo-bridge',
      openclawConfigPath: '/opt/seed/openclaw.json',
      authProfilesPath: '/opt/seed/auth-profiles.json',
      pwDir: '/runtime-pw',
      bridgeToken: process.env.MYCLAWGO_BRIDGE_TOKEN,
    }),
  });

  if (!agentRes.ok) {
    throw new Error(`host-agent create container failed: ${await agentRes.text()}`);
  }

  const bridgeBaseUrl = `http://${host.privateIp}:${assignedPort}`;

  // 写入 allocation
  await db.insert(runtimeAllocation).values({
    userId: job.userId,
    hostId,
    plan: job.plan,
    allocatedCpu: limits.cpu,
    allocatedMemoryMb: limits.memoryMb,
    allocatedDiskGb: limits.diskGb,
    containerName,
    assignedHostPort: assignedPort,
    bridgeBaseUrl,
    containerStatus: 'running',
    runtimeStatus: 'active',
    userDataDir,
    lastStartedAt: new Date(),
  });

  // 更新 host reserved 量
  await db.update(runtimeHost).set({
    reservedCpu: sql`${runtimeHost.reservedCpu} + ${limits.cpu}`,
    reservedMemoryMb: sql`${runtimeHost.reservedMemoryMb} + ${limits.memoryMb}`,
    reservedDiskGb: sql`${runtimeHost.reservedDiskGb} + ${limits.diskGb}`,
    containerCount: sql`${runtimeHost.containerCount} + 1`,
    updatedAt: new Date(),
  }).where(eq(runtimeHost.id, hostId));

  // 完成 job
  await db.update(runtimeProvisionJob)
    .set({ status: 'ready', updatedAt: new Date() })
    .where(eq(runtimeProvisionJob.id, job.id));
}
```

### 10.4 Worker 启动方式

```typescript
// src/lib/myclawgo/worker-bootstrap.ts

let workerInterval: NodeJS.Timeout | null = null;

export function startProvisionWorker() {
  if (process.env.ENABLE_PROVISION_WORKER !== 'true') return;
  if (workerInterval) return; // 防止重复启动

  console.log('[Worker] Provision worker started');
  workerInterval = setInterval(async () => {
    const db = await getDb();
    await processNextProvisionJob(db).catch(console.error);
    await processNextDeprovisionJob(db).catch(console.error);
    await checkStaleRegistrations(db).catch(console.error); // 超时购机检测
    await checkHostHeartbeats(db).catch(console.error);      // 心跳超时检测
  }, 15_000); // 每 15 秒一轮
}
```

---

## 11. 用户不续费的处理流程（动态删除）

### 11.1 Stripe Webhook 事件映射

| Stripe 事件 | 触发时机 | 处理动作 |
|-------------|---------|---------|
| `customer.subscription.deleted` | 用户主动取消且生效 | 进入 grace_period（7天） |
| `invoice.payment_failed`（逾期） | 续费失败，多次重试后 | 进入 grace_period（7天） |
| `customer.subscription.updated`（`cancel_at_period_end: true`） | 用户取消但未到期 | 记录取消意图，到期时再处理 |

### 11.2 Grace Period 逻辑

```typescript
// src/payment/provider/stripe.ts 中新增处理

async function handleSubscriptionCancelled(userId: string) {
  const db = await getDb();

  // 更新 allocation 状态
  await db.update(runtimeAllocation)
    .set({
      runtimeStatus: 'grace_period',
      gracePeriodStartAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(runtimeAllocation.userId, userId));

  // 创建 deprovision job（7 天后执行）
  await db.insert(runtimeDeprovisionJob).values({
    userId,
    allocationId: /* 查出 allocationId */,
    hostId: /* 查出 hostId */,
    triggerType: 'subscription_cancelled',
    status: 'pending',
  });
}
```

### 11.3 Deprovision Worker

```typescript
// src/lib/myclawgo/deprovision-worker.ts

export async function processNextDeprovisionJob(db: DB) {
  // 只处理 grace_period 已过的 job
  const [job] = await db.select()
    .from(runtimeDeprovisionJob)
    .innerJoin(runtimeAllocation, eq(runtimeDeprovisionJob.allocationId, runtimeAllocation.id))
    .where(and(
      eq(runtimeDeprovisionJob.status, 'pending'),
      eq(runtimeAllocation.runtimeStatus, 'grace_period'),
      // grace_period 已超过 7 天
      lt(runtimeAllocation.gracePeriodStartAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    ))
    .limit(1)
    .for('update', { skipLocked: true });

  if (!job) return;

  await runDeprovisionJob(db, job);
}

async function runDeprovisionJob(db: DB, job: DeprovisionJob) {
  const [alloc] = await db.select().from(runtimeAllocation)
    .where(eq(runtimeAllocation.id, job.allocationId)).limit(1);
  const [host] = await db.select().from(runtimeHost)
    .where(eq(runtimeHost.id, job.hostId)).limit(1);

  // Step 1: 停止容器
  await fetch(`${host.agentBaseUrl}/containers/${alloc.containerName}/stop`, {
    method: 'POST',
    headers: { 'X-Agent-Secret': process.env.HETZNER_RUNTIME_AGENT_SECRET! },
  });

  await db.update(runtimeAllocation)
    .set({ containerStatus: 'stopped', runtimeStatus: 'suspended', suspendedAt: new Date(), updatedAt: new Date() })
    .where(eq(runtimeAllocation.id, alloc.id));

  await db.update(runtimeDeprovisionJob)
    .set({ status: 'container_stopped', updatedAt: new Date() })
    .where(eq(runtimeDeprovisionJob.id, job.id));

  // Step 2: 30 天后如果还没续费，删除容器并释放资源
  // （由另一个定时检查处理，见下方 checkSuspendedUsers）
}

// 检查超过 30 天的 suspended 用户，删除容器
async function checkSuspendedUsers(db: DB) {
  const stale = await db.select().from(runtimeAllocation)
    .where(and(
      eq(runtimeAllocation.runtimeStatus, 'suspended'),
      lt(runtimeAllocation.suspendedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    ));

  for (const alloc of stale) {
    await archiveUserRuntime(db, alloc);
  }
}

async function archiveUserRuntime(db: DB, alloc: RuntimeAllocation) {
  const [host] = await db.select().from(runtimeHost)
    .where(eq(runtimeHost.id, alloc.hostId)).limit(1);

  // 删除容器
  await fetch(`${host.agentBaseUrl}/containers/${alloc.containerName}`, {
    method: 'DELETE',
    headers: { 'X-Agent-Secret': process.env.HETZNER_RUNTIME_AGENT_SECRET! },
  }).catch(() => {}); // 容器可能已不存在，忽略

  // 归还 host reserved 量
  await db.update(runtimeHost).set({
    reservedCpu: sql`${runtimeHost.reservedCpu} - ${alloc.allocatedCpu}`,
    reservedMemoryMb: sql`${runtimeHost.reservedMemoryMb} - ${alloc.allocatedMemoryMb}`,
    reservedDiskGb: sql`${runtimeHost.reservedDiskGb} - ${alloc.allocatedDiskGb}`,
    containerCount: sql`${runtimeHost.containerCount} - 1`,
    updatedAt: new Date(),
  }).where(eq(runtimeHost.id, alloc.hostId));

  // 标记 allocation 为 archived
  await db.update(runtimeAllocation)
    .set({ runtimeStatus: 'archived', containerStatus: 'stopped', archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(runtimeAllocation.id, alloc.id));

  // 检查该 host 是否已空（触发 VPS 删除逻辑）
  await checkAndDrainEmptyHost(db, alloc.hostId);
}
```

### 11.4 VPS 自动删除（Host Drain）

**重要安全规则：永远不要在 host 还有容器时删除 VPS。**

```typescript
async function checkAndDrainEmptyHost(db: DB, hostId: string) {
  const [host] = await db.select().from(runtimeHost)
    .where(eq(runtimeHost.id, hostId)).limit(1);

  if (!host) return;
  if (host.status !== 'draining') return; // 只有 draining 状态的 host 才会自动删除
  if (host.containerCount > 0) return;    // 还有容器，不删

  // 确认 host 上确实没有 running 的 allocation
  const activeAllocs = await db.select({ count: count() }).from(runtimeAllocation)
    .where(and(
      eq(runtimeAllocation.hostId, hostId),
      inArray(runtimeAllocation.containerStatus, ['running', 'stopped'])
    ));

  if (activeAllocs[0].count > 0) return;

  // 标记为 empty，准备删除
  await db.update(runtimeHost)
    .set({ status: 'empty', updatedAt: new Date() })
    .where(eq(runtimeHost.id, hostId));

  // 调用 Hetzner API 删除服务器
  if (host.providerServerId) {
    await deleteServer(host.providerServerId);
  }

  await db.update(runtimeHost)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(eq(runtimeHost.id, hostId));
}
```

**何时标记 host 为 `draining`？**

- 管理员手动触发
- Host 长时间 `unhealthy`
- Host 上所有用户都已 churn（空闲超过阈值）

**绝对禁止的操作：**

- 自动把 `ready` 状态的 host 直接标记为删除
- 在 `containerCount > 0` 时调用 Hetzner delete API
- 未经 drain 流程删除任何 host

---

## 12. Bridge Target 改造（关键文件）

```typescript
// src/lib/myclawgo/bridge-target.ts（完整替换）

import { getDb } from '@/db';
import { runtimeAllocation, runtimeHost } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export async function resolveUserBridgeTarget(userId: string) {
  const db = await getDb();

  const [alloc] = await db.select({
    containerName: runtimeAllocation.containerName,
    bridgeBaseUrl: runtimeAllocation.bridgeBaseUrl,
    containerStatus: runtimeAllocation.containerStatus,
    runtimeStatus: runtimeAllocation.runtimeStatus,
    hostStatus: runtimeHost.status,
  })
  .from(runtimeAllocation)
  .innerJoin(runtimeHost, eq(runtimeAllocation.hostId, runtimeHost.id))
  .where(eq(runtimeAllocation.userId, userId))
  .limit(1);

  if (!alloc) {
    return { ok: false as const, code: 'runtime-not-provisioned',
             error: 'No runtime allocation found. Please wait for workspace setup.' };
  }

  if (alloc.runtimeStatus === 'suspended' || alloc.runtimeStatus === 'archived') {
    return { ok: false as const, code: 'runtime-suspended',
             error: 'Workspace suspended. Please renew your subscription.' };
  }

  if (alloc.containerStatus !== 'running') {
    return { ok: false as const, code: 'runtime-not-ready',
             error: `Container not ready (${alloc.containerStatus})` };
  }

  if (alloc.hostStatus !== 'ready') {
    return { ok: false as const, code: 'runtime-host-unavailable',
             error: `Host not ready (${alloc.hostStatus})` };
  }

  return {
    ok: true as const,
    userId,
    containerName: alloc.containerName,
    bridge: {
      baseUrl: alloc.bridgeBaseUrl,
      token: process.env.MYCLAWGO_BRIDGE_TOKEN!,
    },
  };
}
```

---

## 13. 预热策略（减少用户等待时间）

当前触发自动购机，用户可能需要等待 1–6 分钟。预热可以消除这个等待。

### 13.1 预热触发时机

在 worker 的每次循环中，额外检查：

```typescript
async function checkWarmSpare(db: DB) {
  // 统计当前 ready host 中，还能再接 1 个 Premium 用户的 host 数量
  const availableForPremium = await db.select({ count: count() })
    .from(runtimeHost)
    .where(and(
      eq(runtimeHost.status, 'ready'),
      sql`(${runtimeHost.allocatableMemoryMb} - ${runtimeHost.reservedMemoryMb}) >= 4096`,
      sql`(${runtimeHost.allocatableCpu} - ${runtimeHost.reservedCpu}) >= 2`
    ));

  // 如果没有 host 能承接新的 Premium 用户，提前购机
  if (availableForPremium[0].count === 0) {
    await triggerPreemptivePurchase(db);
  }
}
```

### 13.2 预热购机与普通购机的区别

| | 普通购机 | 预热购机 |
|--|---------|---------|
| 触发条件 | 有用户付款且无容量 | 容量低于阈值（无付款事件） |
| provision job | 有 userId 关联 | userId = '_warmup' |
| 购机后 | 立即建用户容器 | 只建 host，等待下一个付款用户 |

---

## 14. 注册超时与购机失败兜底

```typescript
// worker 每轮检查超过 30 分钟还未注册的 provision job
async function checkStaleRegistrations(db: DB) {
  const stale = await db.select().from(runtimeProvisionJob)
    .where(and(
      eq(runtimeProvisionJob.status, 'waiting_host_register'),
      lt(runtimeProvisionJob.updatedAt, new Date(Date.now() - 30 * 60 * 1000))
    ));

  for (const job of stale) {
    // 删除 Hetzner 机器（防止僵尸机器）
    if (job.hetznerServerId) {
      await deleteServer(job.hetznerServerId).catch(() => {});
    }

    // 重置 job 让 worker 重试（限制最多 3 次）
    const isFinal = job.attemptCount >= 2;
    await db.update(runtimeProvisionJob).set({
      status: isFinal ? 'failed' : 'pending',
      hetznerServerId: null,
      registerToken: null,
      attemptCount: job.attemptCount + 1,
      lastError: 'Registration timed out after 30 minutes',
      updatedAt: new Date(),
    }).where(eq(runtimeProvisionJob.id, job.id));

    if (isFinal) await notifyAdminJobFailed(job);
  }
}
```

---

## 15. 心跳超时检测

```typescript
async function checkHostHeartbeats(db: DB) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  // ready → unhealthy
  await db.update(runtimeHost).set({
    status: 'unhealthy', updatedAt: new Date(),
  }).where(and(
    eq(runtimeHost.status, 'ready'),
    lt(runtimeHost.lastHeartbeatAt, fiveMinutesAgo)
  ));

  // unhealthy 超过 30 分钟 → failed
  await db.update(runtimeHost).set({
    status: 'failed', updatedAt: new Date(),
  }).where(and(
    eq(runtimeHost.status, 'unhealthy'),
    lt(runtimeHost.lastHeartbeatAt, thirtyMinutesAgo)
  ));
}
```

---

## 16. 前台状态展示

| 状态值 | 前台展示 | 建议展示样式 |
|--------|---------|------------|
| `not_provisioned` | 请先订阅套餐以开启专属工作区 | 引导购买按钮 |
| `pending` | 工作区准备中，正在分配资源... | 进度条 |
| `provisioning_host` | 正在启动新服务器，预计需要 1–3 分钟... | 进度条 + 倒计时 |
| `creating_container` | 正在创建您的专属容器... | 进度条 |
| `ready` | 工作区已就绪 | 跳转到聊天 |
| `suspended` | 订阅已过期，工作区已暂停。续费后可恢复数据。 | 续费按钮 |
| `failed` | 工作区创建遇到问题，已通知客服，通常 10 分钟内解决 | 客服入口 |

前台轮询：每 5 秒调用 `/api/user/runtime-status`，状态为 `ready` 时停止轮询并跳转。

---

## 17. 代码改造清单（按优先级）

### Phase 1：解耦支付与容器创建（1 周）

- [ ] `src/db/schema.ts`：新增 `runtimeHost`、`runtimeAllocation`、`runtimeProvisionJob`、`runtimeDeprovisionJob`
- [ ] `pnpm db:generate && pnpm db:migrate`：生成并执行迁移
- [ ] `src/lib/myclawgo/runtime-warmup.ts`：改为只写 `runtimeProvisionJob`
- [ ] `src/lib/myclawgo/bridge-target.ts`：改为查 DB（用现有单机 host 的记录）
- [ ] 手动在 DB 插入现有机器的 `runtimeHost` 记录，status = ready
- [ ] 手动迁移现有用户的容器信息到 `runtimeAllocation`（写一次性迁移脚本）
- [ ] `src/app/api/user/runtime-status/route.ts`：新建状态查询接口
- [ ] 前台增加状态轮询组件

**Phase 1 完成标志：支付后 webhook 不再直接建容器，routing 走 DB，现有单机正常运行。**

### Phase 2：Host Agent + 多机调度（2 周）

- [ ] `host-agent/`：实现 Fastify host agent
  - [ ] `/health`、`/metrics`
  - [ ] `/containers`（创建，含端口映射）
  - [ ] `/containers/:name/start|stop`、`DELETE /containers/:name`
  - [ ] 自注册逻辑（startup + retry）
- [ ] `src/lib/hetzner/client.ts`：Hetzner API 封装
- [ ] `src/lib/hetzner/register-token.ts`：一次性注册 JWT
- [ ] `src/app/api/internal/runtime-hosts/register/route.ts`：注册接口
- [ ] `src/app/api/internal/runtime-hosts/[hostId]/heartbeat/route.ts`：心跳接口
- [ ] `src/lib/myclawgo/provision-worker.ts`：完整 worker（查 host → 调 agent 建容器）
- [ ] `src/lib/myclawgo/worker-bootstrap.ts`：worker 启动
- [ ] `src/lib/myclawgo/runtime-capacity.ts`：容量判断逻辑
- [ ] 手动部署第二台 runtime host，端到端测试

**Phase 2 完成标志：新用户可以被调度到第二台机器，消息正常路由。**

### Phase 3：自动购机（1 周）

- [ ] `provision-worker.ts`：补全 `purchaseNewHost`（调用 Hetzner API）
- [ ] cloud-init 模板（snapshot 版）
- [ ] 购机超时检测（30 分钟未注册则删机重试）
- [ ] 端到端测试：模拟容量满 → 付款 → 自动购机 → 容器就绪

**Phase 3 完成标志：无需人工干预，容量满时自动购机。**

### Phase 4：动态删除 VPS（1 周）

- [ ] `src/payment/provider/stripe.ts`：处理 `customer.subscription.deleted`，创建 deprovision job
- [ ] `src/lib/myclawgo/deprovision-worker.ts`：停容器 → 归还资源 → 检查 host 是否可删
- [ ] `checkSuspendedUsers`：30 天后删容器
- [ ] `checkAndDrainEmptyHost`：host 为空时删 VPS
- [ ] 测试：取消订阅 → 7 天后停容器 → 30 天后删容器 → host 空后删 VPS

**Phase 4 完成标志：用户流失后资源自动回收，Hetzner 费用随用户数线性变化。**

### Phase 5：预热与优化（后期）

- [ ] Warm spare 预热策略
- [ ] Pro / Premium / Ultra 分池
- [ ] 空闲容器自动停机（20 分钟无活动）
- [ ] WebSocket 代理（standalone proxy 或 SSE 替代）
- [ ] 管理员 Dashboard（host 状态、容量、job 列表）

---

## 18. 安全要点

| 场景 | 措施 |
|------|------|
| Control plane → Host Agent 通信 | `X-Agent-Secret` 请求头，走 Hetzner 私网，不对公网暴露 |
| Cloud-init 中的 secret | 通过 `write_files` 写入 `/etc/host-agent/env`，权限 0600 |
| Host 注册防伪造 | 一次性 JWT（30 分钟有效），包含 `provisionJobId` |
| 容器间隔离 | Docker 资源限制 + 各容器独立端口映射 |
| 用户数据删除 | `suspended` 状态保留数据 30 天，`archived` 后物理删除 |
| Hetzner API Token | 最小权限（只需 Server: Read/Write），不要 Network/Firewall admin |

---

## 19. 相关代码入口

| 文件 | 现状 | 需改造 |
|------|------|--------|
| `src/payment/provider/stripe.ts:828,896,900` | 直接调 warmupRuntimeForUser | 改为写 provision job |
| `src/lib/myclawgo/runtime-warmup.ts` | 直接建容器 | 改为只创建 job |
| `src/lib/myclawgo/bridge-target.ts` | docker inspect 取 IP | 查 DB allocation |
| `src/lib/myclawgo/gateway-proxy-target.ts` | docker ps 查本机 | 查 DB |
| `src/lib/myclawgo/session-store.ts` | 本地 sessions.json | 废弃，改为 DB |
| `src/lib/myclawgo/docker-manager.ts` | 本机 docker run | 逻辑迁移到 host-agent |
| `src/db/schema.ts` | 无多机表 | 新增 4 张表 |
