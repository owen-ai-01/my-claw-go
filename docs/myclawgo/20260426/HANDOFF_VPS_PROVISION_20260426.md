# 开发交接文档：VPS 自动开机系统（2026-04-26）

> 本文档用于向下一个开发会话交接当前进度。  
> 对应 Git 分支：`main`，最新 commit：`5b990e6`

> 2026-04-26 更新：本文早期版本写的是 `hetznerProject` 表手动插入方案。当前实现已改为从 `HETZNER_PROJECTS` 环境变量读取 Hetzner 项目配置，不再需要 `hetznerProject` 表，也不要把 Hetzner API Token 写进数据库。最新开发执行说明见 `DEV_RUNTIME_VPS_NEXT_STEPS_20260426.md`，测试库 SQL 见 `dev-runtime-vps-sql.sql`。

> 2026-04-26 测试排查更新：测试用户 `ouyanghuiping@gmail.com` 已支付成功，`payment.status = active`，但 `runtimeProvisionJob/runtimeHost/runtimeAllocation` 都为空。原因是支付时 `my-claw-go-test` 仍运行旧构建且 PM2 环境没有 `NEXT_PUBLIC_APP_URL`/`HETZNER_PROJECTS`。已补 `NEXT_PUBLIC_APP_URL=https://test.myclawgo.com` 并执行 `pm2 restart my-claw-go-test --update-env`，日志已出现 `[provision] Worker started, interval: 30000ms`。这次已支付用户需要手动补 `runtimeProvisionJob` 后才会创建测试 VPS；具体 SQL 见 `DEV_RUNTIME_VPS_NEXT_STEPS_20260426.md` 第 9 节。

---

## 一、本阶段完成的工作

### 核心功能：一用户一 VPS 自动开机系统

用户付款后，系统自动在 Hetzner Cloud 为其创建专属 VPS，部署 OpenClaw Gateway + Bridge，最终 `runtimeAllocation.status = ready`，用户即可正常使用聊天功能。

**整体流程：**
```
用户付款
  → Stripe webhook (invoice.paid)
  → queueRuntimeProvision()  插入 runtimeProvisionJob
  → provision-worker (每 30s 轮询)  调用 Hetzner API 创建 VPS
  → cloud-init 在新 VPS 上启动 openclaw-gateway，回调 /api/internal/runtime/register
  → register 路由 SCP 推送 Bridge 代码，SSH 启动 myclawgo-bridge
  → health check 通过 → runtimeAllocation.status = ready
```

---

## 二、新增/修改的文件

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/lib/hetzner/client.ts` | Hetzner API 封装：createServer / poweroff / poweron / deleteServer / changeType |
| `src/lib/myclawgo/cloud-init.ts` | 生成 cloud-init bash 脚本：启动 openclaw-gateway → 回调注册 |
| `src/lib/myclawgo/provision-worker.ts` | Provision Worker 主逻辑：轮询 pending job、买 VPS、清理过期 VPS |
| `src/lib/myclawgo/runtime-provision.ts` | `queueRuntimeProvision()` + `stopRuntimeForUser()` |
| `src/app/api/internal/runtime/register/route.ts` | VPS 注册回调：验证 JWT → SCP Bridge → SSH 启动 → health check |
| `src/instrumentation.ts` | Next.js 启动钩子：`ENABLE_PROVISION_WORKER=true` 时启动定时 Worker |
| `scripts/update-openclaw.sh` | 批量更新所有 ready VPS 上的 openclaw 版本 |

### 修改文件

| 文件 | 改动说明 |
|------|---------|
| `src/db/schema.ts` | 新增 4 张表：`hetznerProject`、`runtimeHost`、`runtimeAllocation`、`runtimeProvisionJob` |
| `src/lib/myclawgo/bridge-target.ts` | 改为从 `runtimeAllocation` 表读取 Bridge 地址和 Token |
| `src/app/api/chat/runtime-status/route.ts` | 改为从 `runtimeAllocation` 表读取状态并返回 |
| `src/payment/provider/stripe.ts` | `invoice.paid` → `queueRuntimeProvision()`；订阅到期（非立即取消）→ `stopRuntimeForUser()` |

### 文档

| 文件 | 说明 |
|------|------|
| `docs/myclawgo/20260426/VPS_FINAL_PLAN_ONE_USER_ONE_VPS.md` | 完整架构方案文档（v4） |
| `docs/myclawgo/HETZNER_MANUAL_SETUP_GUIDE_2026-04-22.md` | Hetzner 手动操作指南（含 Snapshot 制作步骤、SQL INSERT） |

---

## 三、数据库新表结构

```
hetznerProject      ← 手动插入，每个 Hetzner 项目一行
  id, name, api_token, region, max_servers, ssh_key_id, firewall_id, snapshot_id, status

runtimeHost         ← provision worker 创建 VPS 后插入
  id, user_id(unique), project_id→hetznerProject, hetzner_server_id,
  name, plan, server_type, region, public_ip, bridge_base_url, bridge_token,
  status(waiting_init→ready→stopped→deleted), stopped_at

runtimeAllocation   ← 面向业务查询的视图行（一用户一行）
  id, user_id(unique), host_id→runtimeHost,
  plan, bridge_base_url, bridge_token,
  status(pending→ready→stopped→failed)

runtimeProvisionJob ← 异步 job 队列
  id, user_id, plan, trigger_type(payment_new/payment_resubscribe),
  status(pending→buying_vps→waiting_init→done/failed),
  project_id, hetzner_server_id, last_error, attempt_count
```

**VPS 生命周期状态机：**
```
pending → buying_vps → waiting_init → ready → stopped → deleted
                                              (7天后删除，VPS_DATA_RETENTION_DAYS=7)
```

---

## 四、关键设计决策（避免踩坑）

1. **DB 查询方式**：项目不使用 Drizzle relational API（`db.query.xxx`），统一用 `db.select().from(table).where(...).limit(1)` 模式。

2. **JWT 库**：用 `jose`（已加入 direct dep），不用 `jsonwebtoken`。

3. **SSH 私钥**：`/home/openclaw/.ssh/myclawgo_runtime`，已在 SaaS VPS 上，无需额外操作。

4. **Bridge 部署**：不在 Snapshot 里，每次 VPS 注册回调时由 Control Plane SCP 推送 `bridge/dist/`。Bridge 源码在 `/home/openclaw/project/my-claw-go/bridge/`，需要先 `pnpm build` 构建。

5. **openclaw 安装**：必须指定版本号 `npm install -g openclaw@2026.4.11`（不加版本会装到 npm 上的占位包 `0.0.1`）。需要 Node.js v22.12+，二进制路径 `/usr/bin/openclaw`。

6. **poweroff 时机**：`customer.subscription.deleted` 同时触发立即取消和到期取消，用 `current_period_end * 1000 <= Date.now() + 300_000` 区分——只在到期时 poweroff，立即取消的用户还有剩余付费时间。

7. **`hetznerProject` 表**：provision-worker 从 DB 读，不读 env。需要手动执行一次 SQL INSERT（见步骤 6.5 文档），不自动同步。

8. **多项目支持**：`selectAvailableProject()` 按 `max_servers` 判断容量，满了自动选下一个项目（需提前 INSERT 新行）。

---

## 五、当前测试环境状态

| 项目 | 状态 |
|------|------|
| DB 数据 | **已全部清空**（user、payment、runtime 等所有表） |
| Docker 容器 | `myclawgo-test-*` 已删除，生产容器未动 |
| `hetznerProject` 表 | **空**，需手动执行 SQL INSERT |
| Next.js | 需要重启（`pnpm dev` 或 pm2） |

---

## 六、下一步：走完整流程测试

按以下顺序操作：

### 步骤 1：填入 `hetznerProject` 数据

用实际的 Hetzner 配置执行（见 `docs/myclawgo/HETZNER_MANUAL_SETUP_GUIDE_2026-04-22.md` 步骤 6.5）：

```sql
INSERT INTO "hetznerProject" (
  id, name, api_token, region, max_servers,
  ssh_key_id, firewall_id, snapshot_id, status
) VALUES (
  'proj-01',
  'myclawgo-runtime-01',
  '<Hetzner API Token>',
  'fsn1',
  90,
  <SSH Key ID>,
  <Firewall ID>,
  <Snapshot ID 或 NULL>,
  'active'
);
```

### 步骤 2：确认 bridge 已构建

```bash
cd /home/openclaw/project/my-claw-go/bridge
ls dist/   # 应有 index.js 等文件
# 如果没有：pnpm build
```

### 步骤 3：重启 Next.js

```bash
# pm2 或直接 pnpm dev
```

启动日志应出现：
```
[provision] Worker started, interval: 30000ms
```

### 步骤 4：注册新用户 + Stripe 测试支付

1. 访问测试环境注册一个新账号
2. 进入付款页面，使用 Stripe 测试卡 `4242 4242 4242 4242` 购买订阅
3. Stripe 触发 `invoice.paid` webhook → `queueRuntimeProvision()` 自动执行

### 步骤 5：监控 provision 进度

```bash
# 实时查看 job 状态（每 3 秒刷新）
watch -n 3 'source ~/.env 2>/dev/null; psql $DATABASE_URL -c "SELECT status, trigger_type, attempt_count, last_error, created_at FROM \"runtimeProvisionJob\""'

# 查看 VPS 状态
watch -n 5 'source ~/.env 2>/dev/null; psql $DATABASE_URL -c "SELECT status, public_ip, bridge_base_url FROM \"runtimeHost\""'

# 查看用户 allocation
watch -n 5 'source ~/.env 2>/dev/null; psql $DATABASE_URL -c "SELECT status, bridge_base_url FROM \"runtimeAllocation\""'
```

### 步骤 6：验证完成

`runtimeAllocation.status = ready` 后，在前端聊天界面验证是否能正常发送消息（走 Bridge → openclaw-gateway 路径）。

---

## 七、相关环境变量（.env 中已配置）

```env
HETZNER_PROJECTS='[{"id":"proj-01","name":"myclawgo-runtime-01","apiToken":"...","region":"fsn1","maxServers":90,"sshKeyId":...,"firewallId":...,"snapshotId":...}]'
RUNTIME_REGISTER_TOKEN_SECRET=<hex32>
ENABLE_PROVISION_WORKER=true
PROVISION_WORKER_INTERVAL_MS=30000
VPS_DATA_RETENTION_DAYS=7
NEXT_PUBLIC_APP_URL=<测试环境 URL>
```

> `HETZNER_PROJECTS` 仅供参考/备查，实际运行读的是 `hetznerProject` DB 表。

---

## 八、常见问题排查

| 现象 | 原因 | 解决 |
|------|------|------|
| Job 一直 `pending` | Worker 未启动 / `ENABLE_PROVISION_WORKER` 未设 true | 重启 Next.js，检查日志 |
| Job 变 `failed`，`last_error` 含 "All Hetzner projects full" | `hetznerProject` 表为空或全满 | 执行步骤 1 的 SQL |
| register 回调返回 "No host in waiting_init state" | VPS 创建成功但 runtimeHost 未插入 | 查 provision-worker 日志 |
| Bridge health check timeout | bridge/dist 不存在 / npm install 失败 | 确认 `bridge/dist/index.js` 存在 |
| 聊天无响应 | runtimeAllocation 不是 ready | 查 allocation 状态 |
