# Hetzner 付费触发自动购机完整技术方案 2026-04-21

> 日期：2026-04-21  
> 定位：这是一份可直接落地的实施方案，覆盖从支付触发到容器就绪的完整链路。  
> 依赖前提：已有 `paid-user-triggered-vps-provisioning-plan-2026-04-21.md` 作为背景分析。

---

## 1. 核心设计目标

用一句话描述最终行为：

**当付费用户到来时，系统检查当前 runtime host 池是否还有容量承接该用户的套餐资源需求；如果没有，自动调用 Hetzner Cloud API 购买新服务器，通过 cloud-init 完成初始化后，在新机器上创建该用户的 Docker 容器，整个过程对支付 webhook 完全异步。**

这个设计的三个核心约束：

1. Stripe webhook 不能被购机时间拖住（Hetzner 新机从创建到可用通常需要 60–180 秒）
2. 容量判断必须基于"已分配上限"而非"实时 free -m"
3. 单机假设必须在这个版本里彻底拆掉

---

## 2. 现有代码中必须改造的 5 个单机假设

在开始实施之前，必须清楚当前代码的约束边界。

### 2.1 支付 webhook 直接本机建容器

文件：`src/payment/provider/stripe.ts:828`

```typescript
warmupRuntimeForUser(userId, 'subscription-paid');
```

`warmupRuntimeForUser` 内部调用 `ensureSessionById` + `ensureUserContainer`，后者直接在当前机器上执行 `docker run`。

**必须改成**：只写入一条 `runtime_provision_job`，不在 webhook 内做任何 Docker 操作。

### 2.2 Session 存在本地 JSON 文件

文件：`src/lib/myclawgo/session-store.ts:20`

```typescript
const SESSIONS_FILE = path.join(BASE_DIR, 'sessions.json');
```

多机场景下这个文件只存在于一台机器，其他机器无法读到。

**必须改成**：Drizzle `runtime_allocation` 表，以数据库为事实源。

### 2.3 Bridge Target 通过本机 docker inspect 取容器 IP

文件：`src/lib/myclawgo/bridge-target.ts:17`

```typescript
const { stdout } = await execFileAsync('docker', [
  'inspect', '-f', '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
  containerName,
]);
```

这意味着 Web 进程和 Docker 必须在同一台机器上。

**必须改成**：查 `runtime_allocation` → 查 `runtime_host`，取该 host 的 agent 地址和 bridge 端口，直接拼出完整 URL。

### 2.4 Docker Manager 假设 Docker 就在本机

文件：`src/lib/myclawgo/docker-manager.ts:331`

直接调用 `execFileAsync('docker', ...)` 而不指定远程 host。

**必须改成**：control plane 侧只负责"调度和 API 调用"，真正的 `docker run` 操作通过 host agent 的 HTTP 接口在目标 runtime host 上执行。

### 2.5 数据库没有多机调度所需的表

文件：`src/db/schema.ts`

当前没有 `runtimeHost`、`runtimeAllocation`、`runtimeProvisionJob` 三张表。

**必须新增**：这三张表是整个方案的数据基础，缺一不可。

---

## 3. 目标系统架构

```
                         ┌─────────────────────────────────┐
                         │         Control Plane            │
                         │  (当前机器：Next.js + Stripe +   │
                         │   Drizzle DB + Provision Worker) │
                         └──────────────┬──────────────────┘
                                        │ HTTP (private network)
                      ┌─────────────────┼─────────────────┐
                      │                 │                  │
               ┌──────┴──────┐  ┌───────┴──────┐  ┌──────┴──────┐
               │ Runtime Host│  │ Runtime Host │  │ Runtime Host│
               │     #1      │  │     #2       │  │     #3      │
               │  (现有机器) │  │  (已有备用)  │  │  (自动购买) │
               │             │  │              │  │             │
               │ host-agent  │  │  host-agent  │  │  host-agent │
               │ [8080]      │  │  [8080]      │  │  [8080]     │
               │             │  │              │  │             │
               │ user-A-ctr  │  │  user-C-ctr  │  │  user-E-ctr │
               │ user-B-ctr  │  │  user-D-ctr  │  │             │
               └─────────────┘  └──────────────┘  └─────────────┘
```

**角色划分：**

- **Control Plane**：现有机器继续运行 Next.js / Auth / Stripe / DB。新增 Provision Worker 进程。
- **Runtime Host**：每台机器只跑用户 Docker 容器 + Host Agent，不跑任何主站服务。
- **Host Agent**：每台 runtime host 上的轻量 Fastify HTTP 服务，对 control plane 提供容器管理接口。

---

## 4. 完整数据库 Schema

### 4.1 `runtimeHost` 表

```typescript
// src/db/schema.ts 新增

export const runtimeHost = pgTable('runtime_host', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Hetzner 侧信息
  provider: text('provider').notNull().default('hetzner'),
  providerServerId: text('provider_server_id'),      // Hetzner server.id
  providerServerName: text('provider_server_name'),  // Hetzner server.name

  // 网络
  region: text('region').notNull(),                  // nbg1 / hel1 / fsn1
  privateIp: text('private_ip'),                     // Hetzner private network IP
  publicIp: text('public_ip'),
  agentBaseUrl: text('agent_base_url'),              // http://{privateIp}:8080

  // 硬件规格
  serverType: text('server_type').notNull(),         // cx42 / cpx41 等
  totalCpu: integer('total_cpu').notNull(),
  totalMemoryMb: integer('total_memory_mb').notNull(),
  totalDiskGb: integer('total_disk_gb').notNull(),

  // 可分配容量（扣除宿主机保留后的上限）
  allocatableCpu: integer('allocatable_cpu').notNull(),
  allocatableMemoryMb: integer('allocatable_memory_mb').notNull(),
  allocatableDiskGb: integer('allocatable_disk_gb').notNull(),

  // 当前已分配量（逻辑累加，非实时测量）
  reservedCpu: integer('reserved_cpu').notNull().default(0),
  reservedMemoryMb: integer('reserved_memory_mb').notNull().default(0),
  reservedDiskGb: integer('reserved_disk_gb').notNull().default(0),
  containerCount: integer('container_count').notNull().default(0),

  // host 状态
  status: text('status').notNull().default('provisioning'),
  // 取值：provisioning | registering | ready | draining | unhealthy | failed

  agentVersion: text('agent_version'),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

### 4.2 `runtimeAllocation` 表

```typescript
export const runtimeAllocation = pgTable('runtime_allocation', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text('user_id').notNull().unique(), // 一个用户只有一个 allocation
  hostId: text('host_id').notNull().references(() => runtimeHost.id),

  plan: text('plan').notNull(), // pro | premium | ultra

  // 分配的资源量（供 reserved 累加/扣减使用）
  allocatedCpu: integer('allocated_cpu').notNull(),
  allocatedMemoryMb: integer('allocated_memory_mb').notNull(),
  allocatedDiskGb: integer('allocated_disk_gb').notNull(),

  containerName: text('container_name').notNull(),
  containerStatus: text('container_status').notNull().default('pending'),
  // 取值：pending | running | stopped | failed

  userDataDir: text('user_data_dir').notNull(),
  bridgeBaseUrl: text('bridge_base_url'),

  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
  lastStartedAt: timestamp('last_started_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

### 4.3 `runtimeProvisionJob` 表

```typescript
export const runtimeProvisionJob = pgTable('runtime_provision_job', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text('user_id').notNull(),
  hostId: text('host_id'), // 确定分配到的 host 后填入

  triggerType: text('trigger_type').notNull(),
  // 取值：payment_capacity_shortage | manual | warmup_retry

  plan: text('plan').notNull(),
  requiredCpu: integer('required_cpu').notNull(),
  requiredMemoryMb: integer('required_memory_mb').notNull(),
  requiredDiskGb: integer('required_disk_gb').notNull(),

  status: text('status').notNull().default('pending'),
  // 取值：
  //   pending               → 等待 worker 拾取
  //   selecting_host        → 正在查找可用 host
  //   provisioning_host     → 正在 Hetzner 购机
  //   waiting_host_register → 等待 host agent 注册
  //   creating_container    → 正在 host 上建容器
  //   ready                 → 容器已就绪
  //   failed                → 最终失败

  hetznerServerId: text('hetzner_server_id'), // 购机后记录
  attemptCount: integer('attempt_count').notNull().default(0),
  lastError: text('last_error'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

---

## 5. Hetzner Cloud API 集成细节

### 5.1 认证

所有请求使用 Bearer Token：

```
Authorization: Bearer {HETZNER_API_TOKEN}
```

环境变量：`HETZNER_API_TOKEN`，在 Hetzner Cloud Console → Security → API Tokens 创建，权限选 `Read & Write`。

### 5.2 推荐的 Runtime Host 机型

根据当前套餐资源承诺，推荐使用以下机型（参考 2026 年价格，含 20 TB 流量）：

| 机型    | vCPU | RAM  | 磁盘 | 价格约  | 建议承载用户数              |
|---------|------|------|------|--------|---------------------------|
| cx22    | 2    | 4 GB | 40 GB | €3.79  | 最多 1 个 Pro              |
| cx32    | 4    | 8 GB | 80 GB | €7.49  | 最多 3 个 Pro 或 1 个 Premium |
| **cx42**| 8    | 16 GB| 160 GB| €14.99 | **推荐：6 Pro 或 3 Premium** |
| cx52    | 16   | 32 GB| 320 GB| €37.99 | 12 Pro 或 6 Premium       |
| cpx41   | 8    | 16 GB| 240 GB| €18.32 | 同 cx42，磁盘更大            |
| cpx51   | 16   | 32 GB| 360 GB| €47.99 | 同 cx52，磁盘更大            |

**第一版推荐统一使用 `cx42`**，原因：
- 能同时承载 ~5-6 个 Pro 用户或 ~2-3 个 Premium 用户
- 价格合理，不会产生大量碎片小机器
- 后续可升级为 `cx52` 或 `cpx51` 的机型

### 5.3 创建服务器的 API 调用

```typescript
// src/lib/hetzner/client.ts

const HETZNER_API = 'https://api.hetzner.cloud/v1';

export async function createRuntimeHost(params: {
  name: string;
  serverType: string;
  location: string;
  snapshotId?: number;     // 优先使用 snapshot
  imageId?: string;        // 没 snapshot 时用基础镜像如 'ubuntu-24.04'
  sshKeyIds: number[];
  networkId: number;
  firewallIds: number[];
  labels: Record<string, string>;
  cloudInit: string;       // cloud-init YAML，base64 之前的原始字符串
}) {
  const body = {
    name: params.name,
    server_type: params.serverType,
    location: params.location,
    image: params.snapshotId ? String(params.snapshotId) : params.imageId,
    ssh_keys: params.sshKeyIds,
    networks: [params.networkId],
    firewalls: params.firewallIds.map((id) => ({ firewall: id })),
    labels: params.labels,
    user_data: params.cloudInit,
    start_after_create: true,
  };

  const resp = await fetch(`${HETZNER_API}/servers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`Hetzner create server failed: ${JSON.stringify(err)}`);
  }

  const data = await resp.json();
  return {
    serverId: data.server.id as number,
    serverName: data.server.name as string,
    publicIp: data.server.public_net.ipv4?.ip as string,
    status: data.server.status as string,    // initializing | starting | running
    actionId: data.action.id as number,
  };
}

export async function getServerStatus(serverId: number) {
  const resp = await fetch(`${HETZNER_API}/servers/${serverId}`, {
    headers: { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}` },
  });
  const data = await resp.json();
  return {
    status: data.server.status as string,
    privateNetworks: data.server.private_net as Array<{
      network: number;
      ip: string;
    }>,
  };
}

export async function deleteServer(serverId: number) {
  await fetch(`${HETZNER_API}/servers/${serverId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}` },
  });
}
```

### 5.4 创建服务器所需的环境变量

```env
HETZNER_API_TOKEN=               # Hetzner Cloud API Token
HETZNER_RUNTIME_SERVER_TYPE=cx42 # runtime host 机型
HETZNER_RUNTIME_LOCATION=nbg1    # 区域（nbg1/hel1/fsn1）
HETZNER_RUNTIME_SNAPSHOT_ID=     # 已有 snapshot ID（留空则用基础镜像+全量 cloud-init）
HETZNER_RUNTIME_NETWORK_ID=      # Private Network ID
HETZNER_RUNTIME_FIREWALL_IDS=    # Firewall ID，逗号分隔
HETZNER_RUNTIME_SSH_KEY_IDS=     # SSH Key ID，逗号分隔
HETZNER_RUNTIME_AGENT_SECRET=    # Host Agent 鉴权 Secret（随机 32 位）
HETZNER_RUNTIME_REGISTER_TOKEN_SECRET= # 注册 token 签名密钥
```

---

## 6. Cloud-init 脚本设计

Cloud-init 在新机器开机后自动执行，完成从系统到容器环境的完整初始化。

### 6.1 两种策略对比

| 策略 | 优点 | 缺点 |
|------|------|------|
| **基础镜像 + 完整 cloud-init** | 不需要维护 snapshot | 初始化时间长（3-8 分钟） |
| **Snapshot + 轻量 cloud-init** | 初始化快（1-2 分钟） | 需要维护 snapshot，snapshot 价格额外计费 |

**第一版推荐：Snapshot + 轻量 cloud-init**，原因是用户付费后的等待体验很重要。

### 6.2 Snapshot 应该包含的内容

提前在一台 runtime host 上手动完成以下步骤，再做 snapshot：

- Ubuntu 24.04 LTS
- Docker Engine（最新稳定版）
- `docker pull {OPENCLAW_IMAGE}` 预拉镜像
- 安装 host-agent（见第 7 节）
- 创建 `/etc/host-agent/` 目录和配置目录结构

### 6.3 轻量 Cloud-init 脚本（snapshot 场景）

```yaml
#cloud-config
write_files:
  - path: /etc/host-agent/env
    permissions: '0600'
    content: |
      AGENT_SECRET=${HETZNER_RUNTIME_AGENT_SECRET}
      CONTROL_PLANE_URL=${CONTROL_PLANE_URL}
      REGISTER_TOKEN=${ONE_TIME_REGISTER_TOKEN}
      HOST_ID_HINT=${PROVISION_JOB_ID}
      OPENCLAW_IMAGE=${OPENCLAW_IMAGE}
      MYCLAWGO_CONTAINER_PREFIX=myclawgo
      DATA_DIR=/runtime-data

runcmd:
  # 等网络稳定
  - sleep 5
  # 启动 host agent（已通过 systemd service 预装在 snapshot 中）
  - systemctl enable host-agent
  - systemctl start host-agent
  # host-agent 启动后会自行向 control plane 发注册请求
```

### 6.4 全量 Cloud-init 脚本（基础镜像场景）

```yaml
#cloud-config
packages:
  - apt-transport-https
  - ca-certificates
  - curl
  - gnupg

write_files:
  - path: /etc/host-agent/env
    permissions: '0600'
    content: |
      AGENT_SECRET=${HETZNER_RUNTIME_AGENT_SECRET}
      CONTROL_PLANE_URL=${CONTROL_PLANE_URL}
      REGISTER_TOKEN=${ONE_TIME_REGISTER_TOKEN}
      HOST_ID_HINT=${PROVISION_JOB_ID}
      OPENCLAW_IMAGE=${OPENCLAW_IMAGE}

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
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update -y
  - apt-get install -y docker-ce docker-ce-cli containerd.io
  - systemctl enable docker
  - systemctl start docker

  # 下载并安装 host-agent 二进制
  - curl -fsSL ${CONTROL_PLANE_URL}/downloads/host-agent-linux-amd64 -o /usr/local/bin/host-agent
  - chmod +x /usr/local/bin/host-agent

  # 预拉 OpenClaw 镜像（后台，不阻塞注册）
  - docker pull ${OPENCLAW_IMAGE} &

  # 启动 host-agent，它自动注册
  - systemctl daemon-reload
  - systemctl enable host-agent
  - systemctl start host-agent
```

### 6.5 一次性 Registration Token 生成

Cloud-init 中的 `REGISTER_TOKEN` 是一个一次性 JWT，用于防止非法 host 伪造注册请求：

```typescript
// src/lib/hetzner/register-token.ts

import jwt from 'jsonwebtoken';

const SECRET = process.env.HETZNER_RUNTIME_REGISTER_TOKEN_SECRET!;

export function createRegisterToken(provisionJobId: string) {
  return jwt.sign(
    { provisionJobId, type: 'host-register' },
    SECRET,
    { expiresIn: '30m' }  // 30 分钟内完成注册
  );
}

export function verifyRegisterToken(token: string): { provisionJobId: string } {
  return jwt.verify(token, SECRET) as { provisionJobId: string };
}
```

---

## 7. Host Agent 设计

Host Agent 是一个部署在每台 runtime host 上的轻量 Fastify HTTP 服务。

### 7.1 接口列表

| 方法   | 路径                           | 说明                       |
|--------|-------------------------------|---------------------------|
| GET    | `/health`                      | 健康检查（无鉴权）           |
| GET    | `/metrics`                     | CPU/内存/磁盘/容器数上报     |
| POST   | `/register`                    | 向 control plane 自注册     |
| POST   | `/containers`                  | 创建并启动容器              |
| GET    | `/containers/:name`            | 查询容器状态                |
| POST   | `/containers/:name/start`      | 启动已停止的容器            |
| POST   | `/containers/:name/stop`       | 停止容器                   |
| DELETE | `/containers/:name`            | 删除容器                   |

### 7.2 鉴权机制

所有接口（除 `/health`）要求请求头携带：

```
X-Agent-Secret: {HETZNER_RUNTIME_AGENT_SECRET}
```

Control plane 与 host agent 均持有同一个 `AGENT_SECRET`，通过 Hetzner Private Network 通信，不暴露公网。

### 7.3 关键接口实现思路

**`POST /containers`**

```typescript
// 接收 control plane 传来的容器配置
interface CreateContainerRequest {
  containerName: string;
  image: string;
  cpus: string;         // e.g. "2"
  memoryMb: number;     // e.g. 4096
  userDataDir: string;
  openrouterKey?: string;
  bridgeToken: string;
  runtimeModel: string;
  envVars?: Record<string, string>;
}

// 内部执行 docker run
// 相当于把现有 docker-manager.ts 的 ensureUserContainer 逻辑搬过来
// 区别在于：这里的 docker 命令执行在 host agent 所在的机器上，不是 control plane 上
```

**`GET /metrics`**

```typescript
// 返回实时指标，供 control plane heartbeat 更新用
interface HostMetrics {
  cpuUsagePercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  containerCount: number;
  runningContainerCount: number;
}
```

**`POST /register`**（由 cloud-init 启动后 host-agent 自动调用）

Host-agent 启动后，读取 `/etc/host-agent/env` 中的配置，向 control plane 发注册请求：

```typescript
// Host agent 侧：主动注册到 control plane
async function selfRegister() {
  const metrics = await getMetrics();
  await fetch(`${CONTROL_PLANE_URL}/api/internal/runtime-hosts/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registerToken: process.env.REGISTER_TOKEN,
      provisionJobId: process.env.HOST_ID_HINT,
      privateIp: await getPrivateIp(),
      publicIp: await getPublicIp(),
      serverType: process.env.SERVER_TYPE,
      agentSecret: process.env.AGENT_SECRET,
      agentVersion: HOST_AGENT_VERSION,
      metrics,
    }),
  });
}
```

### 7.4 Host Agent 技术栈

- **语言**：TypeScript（编译为单文件 Node.js 二进制，用 `esbuild` + `pkg` 打包）
- **框架**：Fastify（和现有 bridge 一致）
- **部署**：systemd service，自动重启

---

## 8. Control Plane 新增接口

### 8.1 Host 注册接口

```typescript
// src/app/api/internal/runtime-hosts/register/route.ts

POST /api/internal/runtime-hosts/register

// 请求体
{
  registerToken: string;   // 一次性 JWT
  provisionJobId: string;
  privateIp: string;
  publicIp: string;
  serverType: string;
  agentSecret: string;
  agentVersion: string;
  metrics: HostMetrics;
}

// 处理流程
// 1. 验证 registerToken（JWT 签名 + 未过期 + provisionJobId 匹配）
// 2. 从 runtimeProvisionJob 取出 hetznerServerId、plan 等信息
// 3. 查 Hetzner API 确认该服务器确实存在且属于我们项目
// 4. 计算 allocatable 资源（总量 × 0.8，留 20% 给宿主机）
// 5. 写入 runtimeHost 表，status 设为 ready
// 6. 更新 runtimeProvisionJob.status = 'creating_container'
// 7. 触发"给该用户创建容器"的下一步
```

### 8.2 Heartbeat 接口（host agent 定期上报）

```typescript
POST /api/internal/runtime-hosts/:hostId/heartbeat

// 请求体
{
  agentSecret: string;
  metrics: HostMetrics;
}

// 处理流程
// 更新 runtimeHost.lastHeartbeatAt
// 更新实时指标（仅用于监控展示，不作为容量调度依据）
```

---

## 9. 容量判断逻辑

### 9.1 套餐资源映射

```typescript
// src/lib/myclawgo/runtime-capacity.ts

export const PLAN_RESOURCE_REQUIREMENTS = {
  pro:     { cpu: 1, memoryMb: 2048, diskGb: 20 },
  premium: { cpu: 2, memoryMb: 4096, diskGb: 40 },
  ultra:   { cpu: 4, memoryMb: 8192, diskGb: 80 },
} as const;

export const MAX_CONTAINERS_PER_HOST = 10;
// 建议 cx42 上不超过 10 个容器，不管资源数字是否还够
```

### 9.2 找可用 Host

```typescript
export async function findAvailableHost(
  db: DB,
  plan: 'pro' | 'premium' | 'ultra'
): Promise<string | null> {
  const req = PLAN_RESOURCE_REQUIREMENTS[plan];

  // 查找 status=ready，且剩余资源 >= 该套餐需求，且容器数未超上限
  const hosts = await db
    .select()
    .from(runtimeHost)
    .where(
      and(
        eq(runtimeHost.status, 'ready'),
        // 剩余 CPU >= 需求
        sql`(${runtimeHost.allocatableCpu} - ${runtimeHost.reservedCpu}) >= ${req.cpu}`,
        // 剩余内存 >= 需求
        sql`(${runtimeHost.allocatableMemoryMb} - ${runtimeHost.reservedMemoryMb}) >= ${req.memoryMb}`,
        // 剩余磁盘 >= 需求
        sql`(${runtimeHost.allocatableDiskGb} - ${runtimeHost.reservedDiskGb}) >= ${req.diskGb}`,
        // 容器数未满
        lt(runtimeHost.containerCount, MAX_CONTAINERS_PER_HOST)
      )
    )
    // 优先选剩余内存最多的 host（least-loaded 策略）
    .orderBy(
      desc(
        sql`(${runtimeHost.allocatableMemoryMb} - ${runtimeHost.reservedMemoryMb})`
      )
    )
    .limit(1);

  return hosts[0]?.id ?? null;
}
```

### 9.3 计算 Allocatable（新机注册时）

```typescript
function calcAllocatable(serverType: string) {
  const specs = HETZNER_SERVER_SPECS[serverType]; // { cpu, memoryMb, diskGb }
  const OVERHEAD_RATIO = 0.2; // 保留 20% 给宿主机
  return {
    allocatableCpu: Math.floor(specs.cpu * (1 - OVERHEAD_RATIO)),
    allocatableMemoryMb: Math.floor(specs.memoryMb * (1 - OVERHEAD_RATIO)),
    allocatableDiskGb: Math.floor(specs.diskGb * (1 - OVERHEAD_RATIO)),
  };
}

const HETZNER_SERVER_SPECS: Record<string, { cpu: number; memoryMb: number; diskGb: number }> = {
  cx22: { cpu: 2,  memoryMb: 4096,  diskGb: 40  },
  cx32: { cpu: 4,  memoryMb: 8192,  diskGb: 80  },
  cx42: { cpu: 8,  memoryMb: 16384, diskGb: 160 },
  cx52: { cpu: 16, memoryMb: 32768, diskGb: 320 },
  cpx41: { cpu: 8, memoryMb: 16384, diskGb: 240 },
  cpx51: { cpu: 16, memoryMb: 32768, diskGb: 360 },
};
```

---

## 10. Provisioner Worker 完整流程

### 10.1 Worker 实现方式

用 PostgreSQL `SKIP LOCKED` 实现分布式锁，避免多实例同时处理同一个 job：

```typescript
// src/lib/myclawgo/provision-worker.ts

export async function processNextProvisionJob(db: DB) {
  // 用事务 + SKIP LOCKED 拾取一个待处理 job
  const job = await db.transaction(async (tx) => {
    const [j] = await tx
      .select()
      .from(runtimeProvisionJob)
      .where(eq(runtimeProvisionJob.status, 'pending'))
      .orderBy(asc(runtimeProvisionJob.createdAt))
      .limit(1)
      .for('update', { skipLocked: true });

    if (!j) return null;

    await tx
      .update(runtimeProvisionJob)
      .set({ status: 'selecting_host', updatedAt: new Date() })
      .where(eq(runtimeProvisionJob.id, j.id));

    return j;
  });

  if (!job) return;

  try {
    await runProvisionJob(db, job);
  } catch (err) {
    await db
      .update(runtimeProvisionJob)
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

### 10.2 `runProvisionJob` 主流程

```
runProvisionJob(job)
  │
  ├─→ Step 1: findAvailableHost(plan)
  │     │
  │     ├── 找到 → Step 4: createContainerOnHost(hostId, job)
  │     │
  │     └── 没找到 → Step 2: checkIfHostAlreadyProvisioning(job)
  │                    │
  │                    ├── 已有正在购机的 job → 等待，不重复购机
  │                    │
  │                    └── 没有 → Step 3: purchaseNewHost(job)
  │
  ├─→ Step 3: purchaseNewHost(job)
  │     │
  │     ├── 调用 Hetzner API 创建服务器
  │     ├── 记录 hetznerServerId 到 job
  │     ├── 更新 job.status = 'waiting_host_register'
  │     └── 返回（等待 host-agent 主动注册回来）
  │
  └─→ Step 4: createContainerOnHost(hostId, job)
        │
        ├── 更新 job.status = 'creating_container'
        ├── 调用 host agent POST /containers
        ├── 等待容器健康检查通过
        ├── 写入 runtimeAllocation
        ├── 更新 runtimeHost.reserved* 和 containerCount
        └── 更新 job.status = 'ready'
```

### 10.3 Worker 调度方式

有两种方式，选其一：

**方式 A：setInterval 轮询（简单，第一版推荐）**

```typescript
// 在 Next.js 服务启动时注册（src/lib/myclawgo/worker-bootstrap.ts）
if (process.env.ENABLE_PROVISION_WORKER === 'true') {
  setInterval(async () => {
    const db = await getDb();
    await processNextProvisionJob(db).catch(console.error);
  }, 10_000); // 每 10 秒检查一次
}
```

**方式 B：pg-boss 或 BullMQ（更完善的队列，后期推荐）**

---

## 11. 支付侧改造

### 11.1 改造 `warmupRuntimeForUser`

```typescript
// src/lib/myclawgo/runtime-warmup.ts

export async function warmupRuntimeForUser(
  userId: string,
  reason = 'payment'
) {
  // 防重复：同一用户 10 分钟内只创建一个 job
  const db = await getDb();
  const existing = await db
    .select({ id: runtimeProvisionJob.id })
    .from(runtimeProvisionJob)
    .where(
      and(
        eq(runtimeProvisionJob.userId, userId),
        inArray(runtimeProvisionJob.status, [
          'pending', 'selecting_host', 'provisioning_host',
          'waiting_host_register', 'creating_container',
        ])
      )
    )
    .limit(1);

  if (existing.length > 0) return; // 已有进行中的 job

  // 也检查是否已有就绪的 allocation
  const existingAlloc = await db
    .select({ id: runtimeAllocation.id })
    .from(runtimeAllocation)
    .where(
      and(
        eq(runtimeAllocation.userId, userId),
        eq(runtimeAllocation.containerStatus, 'running')
      )
    )
    .limit(1);

  if (existingAlloc.length > 0) return; // 已经 ready 了

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

  console.log(`[Provision] Job created for ${userId}, plan=${plan}, reason=${reason}`);
}
```

---

## 12. Bridge Target 改造

```typescript
// src/lib/myclawgo/bridge-target.ts（改造后）

export async function resolveUserBridgeTarget(userId: string) {
  const db = await getDb();

  // 1. 查用户的 allocation
  const [alloc] = await db
    .select()
    .from(runtimeAllocation)
    .where(eq(runtimeAllocation.userId, userId))
    .limit(1);

  if (!alloc) {
    return { ok: false as const, code: 'runtime-not-provisioned', error: 'No runtime allocation found' };
  }

  if (alloc.containerStatus !== 'running') {
    return { ok: false as const, code: 'runtime-not-ready', error: `Container status: ${alloc.containerStatus}` };
  }

  // 2. 查该 host
  const [host] = await db
    .select()
    .from(runtimeHost)
    .where(eq(runtimeHost.id, alloc.hostId))
    .limit(1);

  if (!host || host.status !== 'ready') {
    return { ok: false as const, code: 'runtime-host-unavailable', error: 'Runtime host not ready' };
  }

  // 3. 拼出 bridge URL（不再 docker inspect，直接用 host 记录的 IP）
  const bridgeBaseUrl = alloc.bridgeBaseUrl
    ?? `http://${host.privateIp}:${process.env.MYCLAWGO_BRIDGE_PORT || 18080}`;

  return {
    ok: true as const,
    userId,
    containerName: alloc.containerName,
    bridge: {
      host: host.privateIp!,
      port: Number(process.env.MYCLAWGO_BRIDGE_PORT || 18080),
      token: process.env.MYCLAWGO_BRIDGE_TOKEN!,
      baseUrl: bridgeBaseUrl,
    },
  };
}
```

---

## 13. 用户前台状态展示

### 13.1 Runtime 状态 API

```typescript
// src/app/api/user/runtime-status/route.ts

GET /api/user/runtime-status

// 返回
{
  status: 'not_started' | 'pending' | 'provisioning_host' | 'creating_container' | 'ready' | 'failed',
  message: string,
  estimatedSeconds?: number,
}
```

### 13.2 前台展示文案

| 状态                   | 前台展示                                 |
|------------------------|------------------------------------------|
| `not_started`          | 请先订阅套餐以开启专属工作区              |
| `pending`              | 工作区准备中，正在分配资源...            |
| `provisioning_host`    | 正在启动新服务器，预计需要 1-3 分钟...  |
| `waiting_host_register`| 服务器初始化中，即将完成...             |
| `creating_container`   | 正在创建您的专属容器...                  |
| `ready`                | 工作区已就绪，正在跳转...               |
| `failed`               | 工作区创建失败，已通知客服介入，请稍候 |

前台可用轮询（每 5 秒）或 SSE 推送来更新状态。

---

## 14. 异常处理策略

### 14.1 6 类失败场景

| 场景                              | 检测方式                           | 处理策略                                      |
|-----------------------------------|------------------------------------|----------------------------------------------|
| 1. Hetzner API 创建失败           | API 返回非 2xx                    | 记录 lastError，attemptCount+1，延迟重试      |
| 2. Hetzner 项目配额不足           | 错误码 `resource_limit_exceeded`  | 发告警邮件，job 进入 failed，人工处理         |
| 3. 目标机型当前 location 无库存   | 错误码 `server_type_not_available`| 尝试备用 location，失败则告警                 |
| 4. cloud-init / host-agent 启动失败 | 30 分钟内未收到注册请求           | 删除 Hetzner 机器，job 重新 pending            |
| 5. host 注册成功但容器创建失败    | host agent 返回错误              | 重试容器创建（最多 3 次），记录 lastError      |
| 6. 用户付款后 provisioning 超时   | job 超过 30 分钟仍未 ready       | 发站内通知 + 告警，支持人工触发重试           |

### 14.2 告警推送

建议集成 Telegram Bot 或邮件，当以下事件发生时立即通知：

- 任意 job 最终进入 `failed`
- Hetzner API 连续调用失败
- 某台 host 超过 5 分钟没有 heartbeat

---

## 15. 网络拓扑与安全

### 15.1 Hetzner Private Network

- 所有 runtime host 加入同一个 Hetzner Private Network
- Control plane 通过内网 IP 与 host agent 通信，不走公网
- host agent 不对公网暴露（Firewall 只开 SSH 和内网段）

### 15.2 Firewall 配置

```
Runtime Host Firewall 规则：
  入站允许：
    - 内网段（10.0.0.0/8）的所有 TCP 端口（供 control plane 访问 host agent）
    - 任意来源 TCP 22（SSH，可限制为运维 IP）
  入站拒绝：
    - 所有其他公网入站
  出站允许：
    - 所有（让容器内可访问外部 AI Provider API）
```

### 15.3 Host Agent Secret

- 每台 host 使用同一个 `HETZNER_RUNTIME_AGENT_SECRET`
- 该 Secret 通过 cloud-init 写入机器，不走版本控制
- 如需更换 Secret，滚动更新所有 host 的环境变量并重启 host-agent

---

## 16. 实施阶段与里程碑

### Phase 1：数据结构 + 支付解耦（1-2 周）

目标：支付 webhook 不再直接建容器，改为异步 job。

里程碑：
- [ ] 新增 `runtimeHost`、`runtimeAllocation`、`runtimeProvisionJob` 三张表
- [ ] `warmupRuntimeForUser` 改为只写 job，不做 docker 操作
- [ ] 手动在数据库里插入现有机器的 `runtimeHost` 记录
- [ ] `bridge-target.ts` 改为从 DB 查 allocation + host
- [ ] 把现有用户的容器信息手动迁移到 `runtimeAllocation`
- [ ] 前台增加 runtime 状态轮询

**这一阶段完成后，系统已经能从数据库路由到正确的 runtime host，即使还只有一台机器。**

### Phase 2：Host Agent + 多机调度（2-3 周）

目标：可以手动加第二台机器，系统自动将新用户分配过去。

里程碑：
- [ ] 实现 host-agent（Fastify 服务）
- [ ] 实现 control plane 的注册接口 `/api/internal/runtime-hosts/register`
- [ ] 实现 provision worker（setInterval 方式）
- [ ] 手动部署第二台 runtime host，验证用户分配逻辑
- [ ] 容量判断 + 调度策略

### Phase 3：Hetzner 自动购机（2-3 周）

目标：容量不足时，系统自动调用 Hetzner API 购买新机器。

里程碑：
- [ ] 实现 `createRuntimeHost`（Hetzner API 封装）
- [ ] 实现 cloud-init 模板（snapshot 版本）
- [ ] 实现一次性 registration token 机制
- [ ] provision worker 集成"无可用 host 时自动购机"逻辑
- [ ] 注册超时检测（30 分钟未注册则删机重试）
- [ ] 完整测试：付款 → 等待 → 容器就绪 → 前台跳转

### Phase 4：预热与自动缩容（后期）

目标：用户不感知买机时间，长期空闲机器自动回收。

里程碑：
- [ ] 容量低于阈值时预先购机（warm spare 策略）
- [ ] 空闲容器自动停机（超过 20 分钟无活动）
- [ ] 长期空闲 host 自动 drain + 删机
- [ ] Pro / Premium / Ultra 分池（Ultra 独立 host）
- [ ] host 健康监控 + 自动 unhealthy 下线

---

## 17. 关键代码入口汇总

需要改造的现有文件：

| 文件                                           | 改造内容                                       |
|------------------------------------------------|----------------------------------------------|
| `src/payment/provider/stripe.ts:828`           | `warmupRuntimeForUser` → 写 job，不建容器      |
| `src/payment/provider/stripe.ts:896,900`       | 同上                                           |
| `src/lib/myclawgo/runtime-warmup.ts`           | 改为只创建 `runtimeProvisionJob`               |
| `src/lib/myclawgo/bridge-target.ts`            | 改为从 DB 查 allocation + host                 |
| `src/lib/myclawgo/session-store.ts`            | 废弃本地文件，改为查 DB                         |
| `src/db/schema.ts`                             | 新增三张表                                     |

需要新建的文件：

| 文件                                                      | 说明                          |
|-----------------------------------------------------------|-------------------------------|
| `src/lib/hetzner/client.ts`                              | Hetzner API 封装               |
| `src/lib/hetzner/register-token.ts`                      | 一次性注册 token                |
| `src/lib/myclawgo/runtime-capacity.ts`                   | 套餐资源映射 + 容量判断逻辑     |
| `src/lib/myclawgo/provision-worker.ts`                   | Provisioner Worker 主逻辑      |
| `src/app/api/internal/runtime-hosts/register/route.ts`   | Host 注册接口                  |
| `src/app/api/internal/runtime-hosts/[id]/heartbeat/route.ts` | Heartbeat 接口             |
| `src/app/api/user/runtime-status/route.ts`               | 用户 runtime 状态查询          |
| `host-agent/` (独立项目目录)                              | Host Agent Fastify 服务        |

---

## 18. 最终判断

这套方案本质上是"把单机 Docker 调度改造成多机 Docker 调度"，Hetzner 自动购机只是其中的一个触发点。

正确的落地顺序是：

1. 先把数据结构建好（三张表），先让现有机器通过 DB 路由（Phase 1）
2. 再接入第二台手动部署的 host，验证多机调度（Phase 2 前半段）
3. 再实现 host-agent + 自动购机（Phase 2 后半段 + Phase 3）
4. 最后做预热和自动缩容（Phase 4）

如果跳过前两步直接做"自动购机"，很可能买回来了机器，但 control plane 还不知道怎么把用户的请求路由过去。

---

## 19. 参考

- Hetzner Cloud API：https://docs.hetzner.cloud/
- Hetzner 服务器机型列表：https://docs.hetzner.com/cloud/servers/overview
- Hetzner Private Networks：https://docs.hetzner.com/cloud/networks/overview
- Hetzner Snapshots：https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/
- 现有代码入口：
  - `src/lib/myclawgo/docker-manager.ts`
  - `src/lib/myclawgo/session-store.ts`
  - `src/lib/myclawgo/bridge-target.ts`
  - `src/lib/myclawgo/runtime-warmup.ts`
  - `src/payment/provider/stripe.ts`
