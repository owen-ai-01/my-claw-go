# Dev Runtime VPS Next Steps（2026-04-26）

> 范围：只用于开发/测试环境验证一用户一 VPS 自动开机流程。  
> 不操作生产环境，不在 Node.js 启动时自动同步 Hetzner 项目配置。

## 1. NEXT_PUBLIC_APP_URL 怎么填

`NEXT_PUBLIC_APP_URL` 要填“新 VPS 能从公网访问到的 Control Plane 地址”。

测试环境和生产环境必须分别配置：

```env
# 测试环境
NEXT_PUBLIC_APP_URL=https://test.your-domain.com

# 生产环境
NEXT_PUBLIC_APP_URL=https://myclawgo.com
```

不能填 `localhost`、`127.0.0.1` 或内网地址。原因是新 VPS 的 cloud-init 会在 VPS 内部回调：

```text
{NEXT_PUBLIC_APP_URL}/api/internal/runtime/register
```

所以测试环境就填测试域名；生产环境以后再填生产域名。

## 2. 数据库 SQL

手动 SQL 已单独放在：

```text
docs/myclawgo/20260426/dev-runtime-vps-sql.sql
```

这份 SQL 包含：

- 创建 `hetznerProject`
- 创建 `runtimeHost`
- 创建 `runtimeAllocation`
- 创建 `runtimeProvisionJob`
- 添加外键约束
- 插入/更新 `hetznerProject` 的模板

执行前替换占位符：

```sql
'<HETZNER_API_TOKEN>'
<HETZNER_SSH_KEY_ID>
<HETZNER_FIREWALL_ID>
<HETZNER_SNAPSHOT_ID_OR_NULL>
```

如果还没有 snapshot，`<HETZNER_SNAPSHOT_ID_OR_NULL>` 填 `NULL`。

这份 SQL 先只在测试数据库执行。生产数据库等测试完整链路确认后再单独处理。

## 3. Hetzner 项目配置策略

项目配置只从 DB 的 `hetznerProject` 表读取。

不会在 Node.js 启动时从 `.env` 自动同步，也不会每次启动时更新项目配置。

`.env` 里的 `HETZNER_PROJECTS` 只作为备查，不参与运行时自动同步。新增/修改项目时，手动执行 SQL 更新 `hetznerProject` 即可。

## 4. Hetzner API Token 安全建议

当前 SQL 模板里的 `hetznerProject.api_token` 会把 Hetzner API Token 写进数据库。这个方案能用于短期开发环境验证，但有明确安全风险：

- 如果数据库泄露，攻击者可以拿到 Hetzner API Token。
- Read & Write Token 可以创建、删除、关机、改配置用户 VPS。
- 生产环境把云厂商高权限 token 明文放 DB，风险偏高。

更推荐的正式方案是：DB 不保存真实 API Token，只保存环境变量引用名。

推荐 schema 形态：

```sql
api_token_ref = 'HETZNER_API_TOKEN_01'
```

真实 token 放在测试/生产环境变量里：

```env
HETZNER_API_TOKEN_01=真实 Hetzner token
```

运行时代码逻辑：

```ts
const token = process.env[project.apiTokenRef];
```

这样做的好处：

- DB 泄露不会直接泄露 Hetzner 权限。
- 测试和生产 token 可以自然分离。
- 新增项目仍然手动 SQL，不需要 Node.js 启动自动同步。
- 轮换 token 只需要改环境变量，不需要改 DB。

推荐的最终项目插入 SQL 会变成：

```sql
INSERT INTO "hetznerProject" (
  id, name, api_token_ref, region, max_servers,
  ssh_key_id, firewall_id, snapshot_id, status
) VALUES (
  'proj-01',
  'myclawgo-runtime-01',
  'HETZNER_API_TOKEN_01',
  'fsn1',
  90,
  <HETZNER_SSH_KEY_ID>,
  <HETZNER_FIREWALL_ID>,
  NULL,
  'active'
);
```

注意：当前代码和当前 `dev-runtime-vps-sql.sql` 还使用 `api_token` 字段。上面是下一步应做的安全改造目标，不要在没有同步改代码和 schema 前直接把当前 SQL 改成 `api_token_ref`。

## 5. 测试环境必需环境变量

测试环境至少需要：

```env
NEXT_PUBLIC_APP_URL=https://你的测试域名
ENABLE_PROVISION_WORKER=true
RUNTIME_REGISTER_TOKEN_SECRET=...
VPS_DATA_RETENTION_DAYS=7
```

`RUNTIME_REGISTER_TOKEN_SECRET` 必须和测试环境 API 服务使用同一份值，因为 provision worker 签发的注册 JWT 会被 `/api/internal/runtime/register` 校验。

## 6. 手动测试流程

1. 在测试数据库执行 `docs/myclawgo/20260426/dev-runtime-vps-sql.sql`。
2. 确认 `hetznerProject` 有一条 `status = active` 的项目记录。
3. 确认测试环境 `.env` 的 `NEXT_PUBLIC_APP_URL` 是测试域名。
4. 确认 Bridge 已构建：

```bash
cd /home/openclaw/project/my-claw-go/bridge
pnpm build
```

5. 重启测试环境 Node 服务，让 provision worker 启动。
6. 在测试环境手动注册用户并走 Stripe 测试支付。
7. 观察 DB 状态。

```sql
SELECT status, trigger_type, attempt_count, last_error, created_at
FROM "runtimeProvisionJob"
ORDER BY created_at DESC;

SELECT status, public_ip, bridge_base_url, created_at
FROM "runtimeHost"
ORDER BY created_at DESC;

SELECT status, bridge_base_url, created_at
FROM "runtimeAllocation"
ORDER BY created_at DESC;
```

成功时预期：

```text
runtimeProvisionJob.status = done
runtimeHost.status = ready
runtimeAllocation.status = ready
```

之后再到前端聊天界面验证消息是否能走 Bridge -> OpenClaw Gateway。

## 7. 本次开发修复点

本次提交修复了开发环境验证前会阻断完整链路的问题：

- Bridge 部署不再复制不存在的 `bridge/package-lock.json`。
- 远端 Bridge 安装改为 `npm install --omit=dev`。
- Bridge health check 补上 `Authorization: Bearer {bridgeToken}`。
- Bridge 部署失败时同步把 `runtimeAllocation.status` 标成 `failed`。
- `NEXT_PUBLIC_APP_URL` 缺失时 worker 显式报错，避免生成坏的注册回调地址。
- provision job 失败后前两次回到 `pending`，第 3 次才标记 `failed`。
- Next instrumentation 拆分为 Node-only 入口，避免 Edge bundle 引入 `postgres/net/tls` 导致构建失败。

## 8. 已验证

本地已验证：

```bash
pnpm exec tsc --noEmit
pnpm exec biome check src/instrumentation.ts src/instrumentation-node.ts src/app/api/internal/runtime/register/route.ts src/lib/myclawgo/provision-worker.ts
cd bridge && pnpm build
cd .. && pnpm build
```
