# VPS 云服务商备选方案

> 日期：2026-05-04  
> 背景：Hetzner 配额申请长期未通过，当前单项目限额 90 台，无法扩展。

---

## 一、现状与问题

当前系统 **强依赖 Hetzner Cloud**，所有 VPS 创建、开机、关机、删除操作都通过 Hetzner API 完成。主要代码路径：

```
src/lib/hetzner/client.ts       ← Hetzner API 封装
src/lib/hetzner/projects.ts     ← 多项目配置解析
src/lib/myclawgo/provision-worker.ts   ← 调用 hetznerClient
src/lib/myclawgo/runtime-provision.ts  ← 调用 hetznerClient
```

**当前瓶颈：**
- 单 Hetzner Project 限额 90 台
- 配额申请长期无回音
- 无法水平扩展，制约用户增长

---

## 二、需求分析

备选云服务商必须支持以下操作（对应当前 Hetzner 5 个 API 方法）：

| 操作 | Hetzner 方法 | 说明 |
|------|-------------|------|
| 创建 VPS | `createServer` | 含 cloud-init、SSH Key、防火墙 |
| 关机（保留数据） | `poweroff` | 订阅到期时调用 |
| 开机 | `poweron` | 用户续订时调用 |
| 删除 | `deleteServer` | 数据保留期满后调用 |
| 变更规格 | `changeType` | 升降套餐（目前未用，预留） |

**其他必要条件：**
- ✅ 快照（Snapshot）支持：用于存储预装 OpenClaw 网关的镜像
- ✅ Ubuntu 24.04 基础镜像（无快照时回退）
- ✅ SSH Key 注入
- ✅ Firewall / Security Group
- ✅ 固定公网 IPv4（创建后立即可用）
- ✅ `user_data` / cloud-init 支持
- ✅ 按需计费，无月度最小使用量
- ✅ 无严格配额限制（或申请容易）

---

## 三、候选服务商对比

### 3.1 综合评分

| 服务商 | Pro 对等机型 | 月费(美元) | 快照 | API 易用性 | 配额限制 | 推荐优先级 |
|--------|-------------|-----------|------|-----------|---------|-----------|
| **DigitalOcean** | s-2vcpu-4gb | $18 | ✅ | ⭐⭐⭐⭐⭐ | 宽松 | 🥇 首选 |
| **Vultr** | vc2-2c-4gb | $18 | ✅ | ⭐⭐⭐⭐⭐ | 宽松 | 🥈 次选 |
| **Linode/Akamai** | g6-standard-2 | $18 | ✅ | ⭐⭐⭐⭐ | 宽松 | 🥉 备选 |
| OVH Public Cloud | s1-2 | ~€7 | ✅ | ⭐⭐⭐ | 中等 | 4 |
| AWS EC2 | t3.medium | ~$33 | ✅ | ⭐⭐⭐ | 需申请 | 5（运维复杂） |
| Contabo | VPS S | €5.99 | ❌ | ⭐⭐ | 无 | 不推荐（无快照） |

### 3.2 各方案规格对比（Pro 套餐）

| 服务商 | 实例名 | vCPU | RAM | SSD | 月费 | Hetzner 倍率 |
|--------|--------|------|-----|-----|------|------------|
| Hetzner | cx23 | 2 | 4 GB | 40 GB | ~$4.3 | 1× |
| DigitalOcean | s-2vcpu-4gb | 2 | 4 GB | 80 GB | $18 | 4.2× |
| Vultr | vc2-2c-4gb | 2 | 4 GB | 80 GB | $18 | 4.2× |
| Linode | g6-standard-2 | 1 | 2 GB | 50 GB | $12 | 2.8× |
| Linode | g6-standard-4 | 2 | 4 GB | 80 GB | $18 | 4.2× |

### 3.3 Premium / Ultra 规格

| 套餐 | Hetzner | DigitalOcean | Vultr |
|------|---------|-------------|-------|
| Premium (4C/8G) | cx33 $8.6/mo | s-4vcpu-8gb $36/mo | vc2-4c-8gb $36/mo |
| Ultra (8C/16G) | cx53 $17/mo | s-8vcpu-16gb $72/mo | vc2-8c-16gb $72/mo |

---

## 四、推荐方案：DigitalOcean（首选）

### 4.1 选择理由

- **API 最接近 Hetzner**：Droplet 模型与 Hetzner Server 几乎一一对应
- **快照支持完善**：可将预装 OpenClaw 网关的镜像存为 Snapshot，复用现有部署流程
- **无配额问题**：默认允许大量 Droplet，申请提额也很快
- **全球数据中心**：纽约、旧金山、伦敦、新加坡、悉尼等
- **文档质量高**：SDK 完善，API 稳定
- **按小时计费**：最小使用单位 = 1 小时，适合按需创建/删除

### 4.2 DigitalOcean API 映射

| 当前 Hetzner 操作 | DigitalOcean 对应 API |
|-----------------|---------------------|
| `createServer` | `POST /v2/droplets` |
| `poweroff` | `POST /v2/droplets/{id}/actions` body: `{"type":"power_off"}` |
| `poweron` | `POST /v2/droplets/{id}/actions` body: `{"type":"power_on"}` |
| `deleteServer` | `DELETE /v2/droplets/{id}` |
| `changeType` | `POST /v2/droplets/{id}/actions` body: `{"type":"resize","size":"s-4vcpu-8gb"}` |

### 4.3 DigitalOcean 项目配置结构

```json
[
  {
    "id": "do-proj-01",
    "provider": "digitalocean",
    "name": "myclawgo-runtime-do-01",
    "apiToken": "dop_v1_xxxx",
    "region": "sgp1",
    "maxServers": 200,
    "sshKeyId": "12345678",
    "firewallId": "uuid-of-firewall",
    "snapshotId": "123456789"
  }
]
```

**区域选项（就近推荐）：**
- `sgp1` — 新加坡（亚太首选）
- `sfo3` — 旧金山
- `nyc3` — 纽约
- `lon1` — 伦敦
- `fra1` — 法兰克福

### 4.4 cloud-init 适配

当前 cloud-init 获取公网 IP 的代码：

```bash
# 当前（Hetzner 专用元数据 URL + ifconfig.me 回退）
PUBLIC_IP=$(curl -fsS --max-time 3 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 \
  || curl -s -4 --max-time 5 --retry 2 --retry-delay 1 ifconfig.me)
```

各服务商元数据 URL：

| 服务商 | 元数据 URL |
|--------|-----------|
| Hetzner | `http://169.254.169.254/hetzner/v1/metadata/public-ipv4` |
| DigitalOcean | `http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address` |
| Vultr | `http://169.254.169.254/v1.json` → 解析 JSON |
| Linode | `curl -H "Metadata-Token: ..." http://169.254.169.254/v1/instance` → 解析 |
| 通用回退 | `curl -s ifconfig.me` |

**解决方案：** 通过 `cloud-init.ts` 接收 `provider` 参数，生成各自的 IP 获取命令；其余逻辑完全一致。

---

## 五、架构设计：Provider 抽象层

### 5.1 接口定义

新建 `src/lib/cloud/provider.ts`：

```typescript
export interface VpsCreateParams {
  name: string;
  serverType: string;    // 对应各服务商的实例类型字符串
  region: string;
  snapshotId?: string;   // 快照 ID（字符串化）
  sshKeyId: string;      // SSH Key ID（字符串化）
  firewallId?: string;   // 防火墙 ID（字符串化，可选）
  userData: string;      // cloud-init script
  labels?: Record<string, string>;
}

export interface VpsCreateResult {
  id: string;            // 服务商的服务器 ID（字符串化）
  name: string;
  publicIp: string;
}

export interface VpsProvider {
  createServer(params: VpsCreateParams): Promise<VpsCreateResult>;
  poweroff(serverId: string): Promise<void>;
  poweron(serverId: string): Promise<void>;
  deleteServer(serverId: string): Promise<void>;
  changeType(serverId: string, newType: string): Promise<void>;
}
```

### 5.2 项目配置统一接口

新建 `src/lib/cloud/projects.ts`：

```typescript
export type ProviderType = 'hetzner' | 'digitalocean' | 'vultr' | 'linode';

export interface CloudProjectConfig {
  id: string;
  provider: ProviderType;
  name: string;
  apiToken: string;
  region: string;
  maxServers: number;
  sshKeyId: string;      // 统一为字符串
  firewallId?: string;   // 可选
  snapshotId?: string;   // 可选
}
```

**环境变量改为 `CLOUD_PROJECTS`（向下兼容 `HETZNER_PROJECTS`）：**

```json
[
  {
    "id": "htz-proj-01",
    "provider": "hetzner",
    "name": "myclawgo-hetzner-01",
    "apiToken": "xxx",
    "region": "fsn1",
    "maxServers": 90,
    "sshKeyId": "111379580",
    "firewallId": "10891954",
    "snapshotId": "382764811"
  },
  {
    "id": "do-proj-01",
    "provider": "digitalocean",
    "name": "myclawgo-do-01",
    "apiToken": "dop_v1_xxx",
    "region": "sgp1",
    "maxServers": 200,
    "sshKeyId": "12345678",
    "firewallId": "uuid-firewall",
    "snapshotId": "123456789"
  }
]
```

### 5.3 Provider 工厂

新建 `src/lib/cloud/factory.ts`：

```typescript
import { hetznerProvider } from './providers/hetzner';
import { digitaloceanProvider } from './providers/digitalocean';
import type { VpsProvider, ProviderType } from './provider';

export function getProvider(type: ProviderType, apiToken: string): VpsProvider {
  switch (type) {
    case 'hetzner': return hetznerProvider(apiToken);
    case 'digitalocean': return digitaloceanProvider(apiToken);
    // case 'vultr': return vultrProvider(apiToken);
    default: throw new Error(`Unknown provider: ${type}`);
  }
}
```

### 5.4 文件结构

```
src/lib/cloud/
  provider.ts          ← VpsProvider 接口定义
  projects.ts          ← CloudProjectConfig 解析（支持 CLOUD_PROJECTS 和旧 HETZNER_PROJECTS）
  factory.ts           ← getProvider() 工厂函数
  server-type-map.ts   ← 套餐 → 各服务商实例类型的映射
  providers/
    hetzner.ts         ← 现有 hetzner/client.ts 改造（实现 VpsProvider）
    digitalocean.ts    ← 新增 DigitalOcean 实现
    vultr.ts           ← 新增 Vultr 实现（可选）
```

---

## 六、DB Schema 变更

### 6.1 runtimeHost 表新增字段

```sql
ALTER TABLE "runtimeHost" ADD COLUMN "provider" text NOT NULL DEFAULT 'hetzner';
ALTER TABLE "runtimeHost" ADD COLUMN "provider_server_id" text;
-- 保留 hetzner_server_id 列以兼容历史数据
```

对应 Drizzle 变更（`src/db/schema.ts`）：

```typescript
export const runtimeHost = pgTable('runtimeHost', {
  // ... 现有字段 ...
  provider: text('provider').notNull().default('hetzner'), // 新增
  providerServerId: text('provider_server_id'),             // 新增（统一 ID 字段）
  hetznerServerId: text('hetzner_server_id'),               // 保留（历史兼容）
  // ...
});
```

### 6.2 runtimeProvisionJob 表新增字段

```typescript
export const runtimeProvisionJob = pgTable('runtimeProvisionJob', {
  // ... 现有字段 ...
  provider: text('provider'),                // 新增
  providerServerId: text('provider_server_id'), // 新增
  hetznerServerId: text('hetzner_server_id'),   // 保留
  // ...
});
```

### 6.3 迁移文件

执行 `pnpm db:generate` 生成迁移，然后 `pnpm db:migrate` 应用。

---

## 七、代码改动清单

### 7.1 新增文件（6 个）

| 文件 | 工作量 | 说明 |
|------|--------|------|
| `src/lib/cloud/provider.ts` | 小 | 接口定义，30 行 |
| `src/lib/cloud/projects.ts` | 小 | 配置解析，兼容旧 HETZNER_PROJECTS |
| `src/lib/cloud/factory.ts` | 小 | Provider 工厂函数 |
| `src/lib/cloud/server-type-map.ts` | 小 | 套餐 → 实例类型映射 |
| `src/lib/cloud/providers/hetzner.ts` | 小 | 现有代码迁移，适配新接口 |
| `src/lib/cloud/providers/digitalocean.ts` | 中 | 新写，~120 行 |

### 7.2 修改文件（4 个）

| 文件 | 改动内容 | 工作量 |
|------|---------|--------|
| `src/lib/myclawgo/provision-worker.ts` | 替换 `hetznerClient` → `getProvider()` | 小 |
| `src/lib/myclawgo/runtime-provision.ts` | 替换 `hetznerClient` → `getProvider()` | 小 |
| `src/lib/myclawgo/cloud-init.ts` | 接收 `provider` 参数，生成对应 IP 获取命令 | 小 |
| `src/db/schema.ts` | 新增 `provider`、`providerServerId` 字段 | 小 |

### 7.3 关键改动示例

**provision-worker.ts 改动点（核心 5 行变更）：**

```typescript
// 旧代码
import { hetznerClient } from '@/lib/hetzner/client';
import { getHetznerProjects, getHetznerProjectById } from '@/lib/hetzner/projects';

const client = hetznerClient(project.apiToken);
const server = await client.createServer({...});
```

```typescript
// 新代码
import { getProvider } from '@/lib/cloud/factory';
import { getCloudProjects, getCloudProjectById } from '@/lib/cloud/projects';

const client = getProvider(project.provider, project.apiToken);
const server = await client.createServer({...});
// server 返回 { id: string, name: string, publicIp: string }
```

**cloud-init.ts 改动点：**

```typescript
// 新增 provider 参数，生成对应 IP 获取命令
function getPublicIpCommand(provider: string): string {
  switch (provider) {
    case 'digitalocean':
      return `curl -fsS --max-time 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address \
        || curl -s -4 --max-time 5 ifconfig.me`;
    case 'hetzner':
    default:
      return `curl -fsS --max-time 3 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 \
        || curl -s -4 --max-time 5 ifconfig.me`;
  }
}
```

---

## 八、DigitalOcean 接入操作步骤

### Step 1：注册并获取 API Token

1. 登录 [DigitalOcean](https://cloud.digitalocean.com/)
2. API → Personal access tokens → Generate New Token（读写权限）
3. 记录 Token

### Step 2：准备快照

> 快照是最重要的前提。当前 Hetzner 快照（ID: 382764811）已预装 OpenClaw 网关，必须在 DigitalOcean 上重建等效快照。

**方法 A（推荐）：从头制作 DigitalOcean 快照**
1. 创建一个 Ubuntu 24.04 Droplet
2. SSH 进入，按 [Hetzner 手动安装指南](./HETZNER_MANUAL_SETUP_GUIDE_2026-04-22.md) 安装 OpenClaw 网关
3. DigitalOcean 控制台 → Droplet → Snapshots → Take Snapshot
4. 关闭 Droplet，记录 Snapshot ID（数字）

**方法 B：机器迁移（复杂，不推荐）**
- 将 Hetzner 快照导出为 raw，再上传到 DigitalOcean Custom Images（格式限制多，容易失败）

### Step 3：配置 SSH Key

1. DigitalOcean → Settings → Security → SSH keys → Add SSH Key
2. 粘贴 `/home/openclaw/.ssh/myclawgo_runtime.pub` 的内容
3. 记录 Key ID（数字）

### Step 4：配置 Firewall

1. DigitalOcean → Networking → Firewalls → Create Firewall
2. 入站规则：

| 类型 | 协议 | 端口 | 来源 |
|------|------|------|------|
| SSH | TCP | 22 | 控制平面 IP（46.225.210.174/32） |
| Custom | TCP | 18080 | 控制平面 IP（46.225.210.174/32） |
| 其他 | — | — | 拒绝 |

3. 记录 Firewall ID（UUID 格式）

### Step 5：更新环境变量

```bash
# .env（或生产的 /home/openclaw/project/my-claw-go-online/.env）

# 新增（支持多 provider）
CLOUD_PROJECTS='[
  {
    "id": "htz-proj-01",
    "provider": "hetzner",
    "name": "myclawgo-hetzner-01",
    "apiToken": "NXXycrDk17P...",
    "region": "fsn1",
    "maxServers": 90,
    "sshKeyId": "111379580",
    "firewallId": "10891954",
    "snapshotId": "382764811"
  },
  {
    "id": "do-proj-01",
    "provider": "digitalocean",
    "name": "myclawgo-do-01",
    "apiToken": "dop_v1_xxx...",
    "region": "sgp1",
    "maxServers": 200,
    "sshKeyId": "12345678",
    "firewallId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "snapshotId": "123456789"
  }
]'
```

配置好后，`selectAvailableProject()` 自动轮询：先填满 Hetzner（90台），满后切到 DigitalOcean（200台）。

---

## 九、开发任务分解

### Phase 1：抽象层 + DigitalOcean（约 2-3 天）

| # | 任务 | 文件 | 优先级 |
|---|------|------|--------|
| 1 | 定义 VpsProvider 接口 | `src/lib/cloud/provider.ts` | P0 |
| 2 | 迁移 Hetzner client → 实现接口 | `src/lib/cloud/providers/hetzner.ts` | P0 |
| 3 | 实现 DigitalOcean provider | `src/lib/cloud/providers/digitalocean.ts` | P0 |
| 4 | 统一项目配置解析（兼容旧 HETZNER_PROJECTS） | `src/lib/cloud/projects.ts` | P0 |
| 5 | Provider 工厂函数 | `src/lib/cloud/factory.ts` | P0 |
| 6 | 套餐 → 实例类型映射表 | `src/lib/cloud/server-type-map.ts` | P0 |
| 7 | 更新 provision-worker.ts | `src/lib/myclawgo/provision-worker.ts` | P0 |
| 8 | 更新 runtime-provision.ts | `src/lib/myclawgo/runtime-provision.ts` | P0 |
| 9 | 更新 cloud-init.ts（IP 获取适配） | `src/lib/myclawgo/cloud-init.ts` | P0 |
| 10 | DB schema 新增 provider 字段 | `src/db/schema.ts` + migration | P0 |

### Phase 2：制作 DigitalOcean 快照（约 1-2 小时）

| # | 任务 |
|---|------|
| 11 | 在 DigitalOcean 创建临时 Droplet |
| 12 | 安装 OpenClaw 网关 |
| 13 | 制作快照，记录 ID |
| 14 | 配置 SSH Key + Firewall，记录 ID |
| 15 | 更新 .env，测试 VPS 创建流程 |

### Phase 3：测试验证（约 1 天）

| # | 测试项 |
|---|--------|
| 16 | 新用户付款 → DigitalOcean Droplet 创建 → 聊天正常 |
| 17 | 订阅到期 → Droplet poweroff → DB 状态正确 |
| 18 | 续订 → Droplet poweron → 聊天正常 |
| 19 | 数据保留期满 → Droplet 删除 → DB 状态正确 |
| 20 | 混合模式：Hetzner 满（90台）后自动切到 DigitalOcean |

---

## 十、Vultr 备选方案（次选）

Vultr API 与 DigitalOcean 几乎相同，若 DigitalOcean 也有问题可快速切换。

### Vultr API 映射

| 操作 | Vultr API |
|------|-----------|
| 创建 | `POST /v2/instances` |
| 关机 | `POST /v2/instances/{id}/halt` |
| 开机 | `POST /v2/instances/{id}/start` |
| 删除 | `DELETE /v2/instances/{id}` |
| 变更规格 | `POST /v2/instances/{id}/upgrades` |

### Vultr 项目配置

```json
{
  "id": "vultr-proj-01",
  "provider": "vultr",
  "name": "myclawgo-vultr-01",
  "apiToken": "xxxx",
  "region": "sgp",
  "maxServers": 200,
  "sshKeyId": "vultr-ssh-key-id",
  "firewallId": "vultr-firewall-group-id",
  "snapshotId": "vultr-snapshot-id"
}
```

### Vultr 实例类型映射

| 套餐 | Vultr 类型 | vCPU | RAM | 月费 |
|------|-----------|------|-----|------|
| pro | vc2-2c-4gb | 2 | 4 GB | $18 |
| premium | vc2-4c-8gb | 4 | 8 GB | $36 |
| ultra | vc2-8c-16gb | 8 | 16 GB | $72 |

---

## 十一、成本影响分析

### 现有用户成本对比（每月每用户）

| 套餐 | Hetzner | DigitalOcean | 差价 |
|------|---------|-------------|------|
| Pro ($29.90) | $4.3/mo | $18/mo | +$13.7 |
| Premium ($59.90) | $8.6/mo | $36/mo | +$27.4 |
| Ultra ($199.90) | $17/mo | $72/mo | +$55 |

**影响评估：**
- Pro 套餐：VPS 成本从 14% → 60%（利润率从 85% → 40%）
- 短期过渡可接受；长期需重新审视定价或继续争取 Hetzner 配额

### 成本控制建议

1. **混合部署**：优先使用 Hetzner（已有 90 台配额），溢出才切到 DigitalOcean
2. **积极申诉 Hetzner**：DigitalOcean 作为备用，Hetzner 恢复后优先回迁
3. **订阅到期后 poweroff**（已实现）：减少闲置 Droplet 计费
4. **考虑 OVH**：欧洲区成本接近 Hetzner（s1-2 约 €7/mo），但 API 相对复杂

---

## 十二、不需要修改的部分

以下代码**无需改动**，完全与 Provider 无关：

| 组件 | 原因 |
|------|------|
| `src/app/api/internal/runtime/register/route.ts` | SSH 部署逻辑与 Provider 无关 |
| `bridge/` 整个目录 | 运行在 VPS 上，不关心创建者 |
| `src/payment/provider/stripe.ts` | 支付与 VPS Provider 解耦 |
| `src/lib/myclawgo/openrouter-key-provisioner.ts` | OpenRouter 逻辑独立 |
| `src/lib/myclawgo/user-chat.ts` | 聊天逻辑与 VPS Provider 无关 |
| 所有前端组件 | 只看 bridge URL，不关心 Provider |

---

## 附：各服务商 API 参考

| 服务商 | API 文档 |
|--------|---------|
| DigitalOcean | https://docs.digitalocean.com/reference/api/api-reference/ |
| Vultr | https://www.vultr.com/api/ |
| Linode/Akamai | https://www.linode.com/docs/api/ |
| Hetzner（现有） | https://docs.hetzner.cloud/ |
