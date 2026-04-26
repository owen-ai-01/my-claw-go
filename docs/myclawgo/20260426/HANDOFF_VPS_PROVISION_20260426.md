# 开发交接文档：VPS 自动开机系统（2026-04-26）

> 本文档用于向下一个开发会话交接当前进度。  
> 对应 Git 分支：`main`，最新 commit：`7608bb2`

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

## 二、新增/修改的关键文件

| 文件 | 说明 |
|------|------|
| `src/lib/hetzner/client.ts` | Hetzner API 封装：createServer / poweroff / poweron / deleteServer |
| `src/lib/hetzner/projects.ts` | 从 `HETZNER_PROJECTS` 环境变量解析项目配置；`getHetznerProjects()` / `getHetznerProjectById()` |
| `src/lib/myclawgo/cloud-init.ts` | 生成 cloud-init bash：启动 openclaw-gateway → 回调注册 |
| `src/lib/myclawgo/provision-worker.ts` | 轮询 pending job → 买 VPS → 清理过期 VPS |
| `src/lib/myclawgo/runtime-provision.ts` | `queueRuntimeProvision()` + `stopRuntimeForUser()` |
| `src/app/api/internal/runtime/register/route.ts` | VPS 注册回调：验证 JWT → SCP Bridge → SSH 启动 → health check |
| `src/instrumentation.ts` | Next.js 启动钩子：仅在 nodejs runtime 时 `import('./instrumentation-node')` |
| `src/instrumentation-node.ts` | 实际启动 provision worker 的 Node-only 代码（避免 Edge bundle 引入 pg/tls） |
| `src/db/schema.ts` | 新增 4 张表（见下）；`runtimeHost.projectId` 已去掉 `.references()` 但 DB 中 FK 仍存在（见已知问题） |
| `src/payment/provider/stripe.ts` | `invoice.paid` → `queueRuntimeProvision()`；订阅到期 → `stopRuntimeForUser()` |
| `src/lib/myclawgo/bridge-target.ts` | 从 `runtimeAllocation` 读取 Bridge 地址和 Token |
| `src/app/api/chat/runtime-status/route.ts` | 从 `runtimeAllocation` 读取状态 |

---

## 三、数据库表结构

```
hetznerProject      ← 表仍存在，但不再写入数据！配置改从 HETZNER_PROJECTS env 读。
                      注意：DB 中 runtimeHost.project_id 仍有 FK 约束指向此表（见已知问题）

runtimeHost         ← provision worker 创建 VPS 后插入
  id, user_id(unique FK→user), project_id(FK→hetznerProject，有待处理),
  hetzner_server_id, name, plan, server_type, region,
  public_ip, bridge_base_url, bridge_token,
  status: waiting_init → ready → stopped → deleted
  stopped_at

runtimeAllocation   ← 面向业务查询（一用户一行）
  id, user_id(unique FK→user), host_id(FK→runtimeHost),
  plan, bridge_base_url, bridge_token,
  status: pending → ready → stopped → failed

runtimeProvisionJob ← 异步 job 队列
  id, user_id(FK→user), plan,
  trigger_type: payment_new | payment_resubscribe | manual_retry
  status: pending → buying_vps → waiting_init → done | failed
  project_id, hetzner_server_id, last_error, attempt_count(最多重试3次)
```

**VPS 生命周期：**
```
pending → buying_vps → waiting_init → ready → stopped → deleted
                                              (VPS_DATA_RETENTION_DAYS=7 天后删除)
```

---

## 四、Hetzner 项目配置方式（关键变更）

**配置不写数据库，从 `HETZNER_PROJECTS` 环境变量读取。**  
代码入口：`src/lib/hetzner/projects.ts`，`getHetznerProjects()` / `getHetznerProjectById()`。

`.env` 示例：
```env
HETZNER_PROJECTS='[
  {
    "id": "proj-01",
    "name": "myclawgo-runtime-01",
    "apiToken": "<Hetzner API Token>",
    "region": "fsn1",
    "maxServers": 90,
    "sshKeyId": 12345678,
    "firewallId": 56789012,
    "snapshotId": null
  }
]'
```

好处：
- DB 泄露不会泄露 Hetzner 高权限 Token
- 测试/生产 Token 自然隔离
- 轮换 Token 只改 env 重启即可

---

## 五、关键设计决策（避免踩坑）

1. **DB 查询方式**：不用 Drizzle relational API（`db.query.xxx`），统一用 `db.select().from(table).where(...).limit(1)`。

2. **JWT 库**：用 `jose`（已在 direct dep），不用 `jsonwebtoken`。

3. **SSH 私钥**：`/home/openclaw/.ssh/myclawgo_runtime`，已在 SaaS VPS 上。

4. **Bridge 部署**：SCP 只推送 `bridge/dist/` 和 `package.json`（无 `package-lock.json`），远端用 `npm install --omit=dev`。Bridge 源码在 `bridge/`，需先 `pnpm build` 构建。

5. **openclaw 安装**：必须指定版本 `npm install -g openclaw@2026.4.11`（不加版本装到 npm 占位包）。Node.js v22.12+，二进制 `/usr/bin/openclaw`。

6. **Bridge health check**：需带 `Authorization: Bearer {bridgeToken}` header，否则 Bridge 返回 401。

7. **poweroff 时机**：`customer.subscription.deleted` 同时触发立即取消和到期，用 `current_period_end * 1000 <= Date.now() + 300_000` 区分，只在到期时 poweroff。

8. **provision 重试**：前 2 次失败回到 `pending`（会重试），第 3 次才标 `failed`。

9. **instrumentation 拆分**：`instrumentation.ts` 只做 `import('./instrumentation-node')`，真正的 Worker 启动逻辑在 `instrumentation-node.ts`，避免 Edge bundle 引入 `postgres/net/tls` 导致构建失败。

---

## 六、⚠️ 已知问题：runtimeHost 的 FK 约束阻断 provision

**现象**：provision worker 执行 `db.insert(runtimeHost).values({...projectId: 'proj-01'...})` 时，DB 会报 FK violation，因为：

- `hetznerProject` 表是空的（配置改从 env 读，不再往 DB 写）
- 但 DB 中仍存在旧约束：`runtimeHost_project_id_hetznerProject_id_fk → hetznerProject(id)`

**根因**：之前用 `db:push` 建表时 schema.ts 里有 `.references(() => hetznerProject.id)`，后来代码删掉了这个引用，但 DB 里的约束没有同步删除。

**修复方案**（二选一）：

### 方案 A：删除 FK 约束（推荐）

```sql
ALTER TABLE "runtimeHost" DROP CONSTRAINT IF EXISTS "runtimeHost_project_id_hetznerProject_id_fk";
```

执行后 `runtimeHost.project_id` 只是普通文本字段，存 project id 字符串供查找 env 配置用。

### 方案 B：往 hetznerProject 表插入占位行

```sql
INSERT INTO "hetznerProject" (id, name, api_token, region, max_servers, ssh_key_id, firewall_id, status)
VALUES ('proj-01', 'myclawgo-runtime-01', 'placeholder', 'fsn1', 90, 0, 0, 'active');
```

**推荐方案 A**，因为 `hetznerProject` 表数据后续永远不会被读取，占位行容易混淆。

---

## 七、当前测试环境状态

| 项目 | 状态 |
|------|------|
| DB 数据 | 2026-04-26 已全部清空（本次测试前清理） |
| Docker 容器 | `myclawgo-test-*` 已删除，生产容器未动 |
| `hetznerProject` 表 | 空（不再需要填数据，但 FK 约束仍存在） |
| Next.js | 已重启，provision worker 已启动 |
| 测试用户 | DB 已清空，需重新注册 |

---

## 八、下一步：走完整流程测试

### 步骤 1：修复 FK 约束（必须先做）

```sql
ALTER TABLE "runtimeHost" DROP CONSTRAINT IF EXISTS "runtimeHost_project_id_hetznerProject_id_fk";
```

### 步骤 2：确认 .env 已配置

```env
HETZNER_PROJECTS='[{"id":"proj-01","name":"myclawgo-runtime-01","apiToken":"...","region":"fsn1","maxServers":90,"sshKeyId":...,"firewallId":...,"snapshotId":null}]'
RUNTIME_REGISTER_TOKEN_SECRET=<hex32>
ENABLE_PROVISION_WORKER=true
NEXT_PUBLIC_APP_URL=https://test.myclawgo.com
VPS_DATA_RETENTION_DAYS=7
```

### 步骤 3：确认 Bridge 已构建

```bash
ls /home/openclaw/project/my-claw-go/bridge/dist/index.js
# 如果不存在：
cd /home/openclaw/project/my-claw-go/bridge && pnpm build
```

### 步骤 4：重启 Next.js

日志应出现：
```
[provision] Worker started, interval: 30000ms
```

### 步骤 5：注册 + Stripe 测试支付

1. 注册新账号
2. 用测试卡 `4242 4242 4242 4242` 购买订阅
3. Stripe `invoice.paid` webhook → `queueRuntimeProvision()` → 插入 `runtimeProvisionJob`

### 步骤 6：监控进度

```bash
source ~/.bashrc
# 查看 job 状态
watch -n 5 'psql $DATABASE_URL -c "SELECT status, attempt_count, last_error, created_at FROM \"runtimeProvisionJob\" ORDER BY created_at DESC"'

# 查看 VPS 状态
watch -n 5 'psql $DATABASE_URL -c "SELECT status, public_ip, bridge_base_url FROM \"runtimeHost\""'

# 查看 allocation
watch -n 5 'psql $DATABASE_URL -c "SELECT status, bridge_base_url FROM \"runtimeAllocation\""'
```

预期结果：
```
runtimeProvisionJob.status = done
runtimeHost.status = ready，public_ip 有值
runtimeAllocation.status = ready，bridge_base_url 有值
```

---

## 九、如需手动补 provision job（已支付用户）

如果用户已付款但 provision job 未创建（如之前测试环境旧构建时），可手动插入：

```sql
-- 查询用户 id
SELECT id, email FROM "user";

-- 插入 provision job（替换 <USER_ID>）
INSERT INTO "runtimeProvisionJob" (id, user_id, plan, trigger_type, status, attempt_count, created_at, updated_at)
VALUES (gen_random_uuid()::text, '<USER_ID>', 'pro', 'manual_retry', 'pending', 0, now(), now());

-- 同时插入 allocation pending 状态（让前端立即显示"开机中"）
INSERT INTO "runtimeAllocation" (id, user_id, plan, status, created_at, updated_at)
VALUES (gen_random_uuid()::text, '<USER_ID>', 'pro', 'pending', now(), now())
ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = 'pending', updated_at = now();
```

Worker 最多 30 秒内拾取，开始真实向 Hetzner 购机。

---

## 十、常见问题排查

| 现象 | 原因 | 解决 |
|------|------|------|
| Job `failed`，`last_error` 含 "violates foreign key constraint" | FK 未删除（见六） | 执行步骤 1 的 ALTER TABLE |
| Job `failed`，"All Hetzner projects full" | `HETZNER_PROJECTS` 未配置或全满 | 检查 env 变量 |
| Job `failed`，"NEXT_PUBLIC_APP_URL not set" | env 缺失 | 补全 env，重启 Next.js |
| Job 一直 `pending` | Worker 未启动 | 检查日志是否有 `[provision] Worker started` |
| register 返回 404 "No host in waiting_init" | VPS 创建失败 | 查 provision-worker 日志 |
| Bridge health check timeout | `bridge/dist/` 不存在或 npm install 失败 | 确认 `bridge/dist/index.js` 存在 |
| 聊天无响应 | `runtimeAllocation` 不是 `ready` | 查 allocation 状态 |
