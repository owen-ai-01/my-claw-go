# Dev Runtime VPS Next Steps（2026-04-26）

> 范围：只用于开发/测试环境验证一用户一 VPS 自动开机流程。  
> 不操作生产环境。Hetzner 项目配置从 `HETZNER_PROJECTS` 环境变量读取，不再写入数据库。

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

- 创建 `runtimeHost`
- 创建 `runtimeAllocation`
- 创建 `runtimeProvisionJob`
- 添加外键约束

这份 SQL 先只在测试数据库执行。生产数据库等测试完整链路确认后再单独处理。

## 3. Hetzner 项目配置策略

项目配置从环境变量 `HETZNER_PROJECTS` 读取，不再从 DB 的 `hetznerProject` 表读取。

`HETZNER_PROJECTS` 示例：

```env
HETZNER_PROJECTS='[
  {
    "id": "proj-01",
    "name": "myclawgo-runtime-01",
    "apiToken": "<步骤 1 获取的 Token>",
    "region": "fsn1",
    "maxServers": 90,
    "sshKeyId": <步骤 2 的 SSH Key ID>,
    "firewallId": <步骤 3 的 Firewall ID>,
    "snapshotId": <步骤 5 的 Snapshot ID，没做就填 null>
  }
]'
```

这意味着：

- 不需要 `hetznerProject` 表。
- 不需要把 Hetzner API Token 写进数据库。
- 新增 Hetzner 项目时，直接改测试/生产环境的 `HETZNER_PROJECTS` 配置并重启服务。
- `runtimeHost.project_id` 仍然保留字符串，用来记录某台用户 VPS 来自哪个 Hetzner 项目，并用于后续 poweron/poweroff/delete 时从 `HETZNER_PROJECTS` 找回对应 token。

## 4. Hetzner API Token 安全建议

不要把 Hetzner API Token 写进数据库。之前的 `hetznerProject.api_token` 方案有明确安全风险：

- 如果数据库泄露，攻击者可以拿到 Hetzner API Token。
- Read & Write Token 可以创建、删除、关机、改配置用户 VPS。
- 生产环境把云厂商高权限 token 明文放 DB，风险偏高。

当前方案把 token 放在环境变量 `HETZNER_PROJECTS` 中：

- DB 泄露不会直接泄露 Hetzner 权限。
- 测试和生产 token 可以自然分离。
- 轮换 token 只需要改环境变量并重启服务，不需要改 DB。

## 5. 测试环境必需环境变量

测试环境至少需要：

```env
NEXT_PUBLIC_APP_URL=https://你的测试域名
ENABLE_PROVISION_WORKER=true
RUNTIME_REGISTER_TOKEN_SECRET=...
VPS_DATA_RETENTION_DAYS=7
HETZNER_PROJECTS='[{"id":"proj-01","name":"myclawgo-runtime-01","apiToken":"...","region":"fsn1","maxServers":90,"sshKeyId":123,"firewallId":456,"snapshotId":null}]'
```

`RUNTIME_REGISTER_TOKEN_SECRET` 必须和测试环境 API 服务使用同一份值，因为 provision worker 签发的注册 JWT 会被 `/api/internal/runtime/register` 校验。

## 6. 手动测试流程

1. 在测试数据库执行 `docs/myclawgo/20260426/dev-runtime-vps-sql.sql`。
2. 确认测试环境 `.env` 的 `HETZNER_PROJECTS` 已配置至少一个项目。
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
- Hetzner 项目配置改为从 `HETZNER_PROJECTS` 环境变量读取，不再需要 `hetznerProject` 表。

## 8. 已验证

本地已验证：

```bash
pnpm exec tsc --noEmit
pnpm exec biome check src/instrumentation.ts src/instrumentation-node.ts src/app/api/internal/runtime/register/route.ts src/lib/myclawgo/provision-worker.ts
cd bridge && pnpm build
cd .. && pnpm build
```
