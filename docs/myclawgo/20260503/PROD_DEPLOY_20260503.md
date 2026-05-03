# 生产环境部署记录 2026-05-03

## 部署内容

本次部署将以下功能从测试环境推送到生产环境（myclawgo.com）：

- **P0/P1/P2 数据持久化**：agent docs / group config / chat 消息双写到 PostgreSQL
- **VPS 自动 Provisioning**：Hetzner API 集成、provision worker、JWT register 回调
- **VPS 数据恢复**：新 VPS 上线后从 PG 自动还原 agent docs 和 groups
- **Provisioning 进度 UI**：步骤式进度卡片替代原来的简单 spinner

---

## 部署步骤

### 1. 生产数据库 Schema 部署（前一天完成）

生产库（Neon `my_claw_go`）缺少 9 张新表和 5 个新字段，手动执行完整 DDL：

```sql
CREATE TABLE IF NOT EXISTS "runtimeHost" ( ... );
CREATE TABLE IF NOT EXISTS "runtimeAllocation" ( ... );
CREATE TABLE IF NOT EXISTS "runtimeProvisionJob" ( ... );
CREATE TABLE IF NOT EXISTS user_agent_doc ( ... );
CREATE TABLE IF NOT EXISTS user_group ( ... );
ALTER TABLE user_chat_message ADD COLUMN IF NOT EXISTS group_id text;
ALTER TABLE user_chat_message ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'direct';
ALTER TABLE user_chat_message ADD COLUMN IF NOT EXISTS chat_scope text NOT NULL DEFAULT 'default';
ALTER TABLE user_chat_message ADD COLUMN IF NOT EXISTS routed_agent_id text;
ALTER TABLE user_chat_message ADD COLUMN IF NOT EXISTS meta_json jsonb;
```

执行结果：34 条语句全部成功，3 个现有生产用户数据完整保留。

### 2. 生产环境清理

- 删除测试 Docker 容器 `myclawgo-test`
- 从生产 DB 删除 `ouyanghuiping@gmail.com` 的 user + payment 数据（CASCADE 删除所有关联记录），用于重新注册测试

### 3. 代码部署

```bash
# 在 my-claw-go-online 目录
git pull origin main          # 同步 62 个 commit
cd bridge && npm install && npm run build   # 编译 bridge（含新 sync.ts）
pnpm install                  # 补装新依赖（jose 包）
pnpm build                    # 编译 Next.js（成功，无 TS 错误）
pm2 restart my-claw-go-online --update-env
```

### 4. 新增环境变量（写入生产 .env）

```
HETZNER_PROJECTS='[{"id":"proj-01","name":"myclawgo-runtime-01","apiToken":"...","region":"fsn1","maxServers":90,"sshKeyId":111379580,"firewallId":10891954,"snapshotId":380361083}]'
CONTROL_PLANE_PUBLIC_IP=46.225.210.174
RUNTIME_REGISTER_TOKEN_SECRET=<新生成32字节随机串>
ENABLE_PROVISION_WORKER=true
PROVISION_WORKER_INTERVAL_MS=30000
VPS_DATA_RETENTION_DAYS=7
```

---

## 部署后检查结果

| 检查项 | 结果 |
|--------|------|
| PM2 进程状态 | online |
| `/api/ping` | 200 `{"message":"pong"}` |
| `/api/internal/bridge-sync`（无效 token） | 401 `{"ok":false,"error":"Unknown bridge token"}` |
| `/api/internal/runtime/register`（无效 token） | 401 |
| `/api/chat/runtime-status`（未登录） | 401 |
| 数据库表数量 | 20 张，全部存在 |
| `user_chat_message` 新字段 | 5 个字段全部存在 |
| Provision Worker | `[provision] Worker started, interval: 30000ms` |
| 现有用户数据 | 3 个用户完整保留 |

---

## 已知噪音日志（非本次引入）

- `subscription plan NOT found for priceId: price_1T7FVSBb5VJkJBiBfvE9jdPB`
  — 某现有用户的 Stripe 旧 price ID，部署前已存在
- `Failed to find Server Action`
  — 浏览器缓存了旧 build 的请求，页面刷新后消失

---

## 后续

- 用 `ouyanghuiping@gmail.com` 重新注册并完整走支付 → VPS 创建 → 进度 UI 流程
