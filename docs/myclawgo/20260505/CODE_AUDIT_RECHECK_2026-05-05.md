# 代码审计复核 - 2026-05-05

> 来源：`docs/code-audit-2026-04-19.md`
> 范围：复核 2026-04-19 审计报告中的问题，在当前代码库中是否仍然成立。

## 结论

2026-04-19 的审计报告整体是合理的。部分 Critical / High 问题已经修复，但当前代码库仍然存在一些未解决或修复不完整的安全与可靠性问题。

已经修复或基本修复的问题：

- #1 加密密钥硬编码默认值：已修复。`agent-config.ts` 在没有配置加密密钥时会直接抛错，不再使用固定 fallback。
- #3 `active-chat-store.ts` 非原子写：已修复为 tmp 文件 + rename。
- #8 Bridge Token 未配置时容器仍可启动：主要路径已基本修复。`ensureUserContainer()` 在缺少 `MYCLAWGO_BRIDGE_TOKEN` 时会返回 `ok: false`，主要调用方也有检查。
- #9 OpenRouter Key Provisioning 无重试：management API 路径已在 `openrouter-key-provisioner.ts` 中加入 429 / 5xx 重试。
- #11 Telegram Webhook Secret 轮换：部分修复。每次保存 Telegram bot 配置时都会生成新的 webhook secret。

## 仍然存在的问题

### P0 - Owner 调试绕过仍然有默认邮箱

文件：`src/app/api/runtime/[sessionId]/chat/route.ts`

当前代码仍然定义了默认 owner 邮箱：

```ts
const OWNER_EMAIL = process.env.MYCLAWGO_OWNER_EMAIL || 'support@myclawgo.com';
```

这比暴露个人管理员邮箱更好，但仍然意味着：只要 `MYCLAWGO_OWNER_EMAIL` 没有显式配置，使用 `support@myclawgo.com` 的账号就会收到原始服务端错误信息。

建议修复：

- 完全移除默认值。
- 只有当 `MYCLAWGO_OWNER_EMAIL` 显式配置，并且与当前登录用户邮箱完全匹配时，才返回原始错误详情。

### P1 - 信用扣费仍然不是完整原子操作

文件：`src/credits/credits.ts`

当前余额扣减已经改为 SQL 算术更新：

```ts
currentCredits: sql`${userCredit.currentCredits} - ${amount}`
```

但 `consumeCredits()` 仍然存在并发窗口：

- `paymentId` 幂等检查是 check-then-insert。
- 余额检查与实际扣减是分离的。
- FIFO 扣减先读取 `creditTransaction.remainingAmount`，之后再用旧值更新。
- `paymentId` 幂等检查、FIFO 明细扣减、余额扣减、usage 交易记录插入没有包在同一个数据库事务里。
- `creditTransaction.paymentId` 没有唯一索引，并发时仍可能产生重复扣费记录。

建议修复：

- 将扣费流程包进数据库事务。
- 为非空 `credit_transaction.payment_id` 增加唯一索引。
- 余额扣减使用条件更新，例如 `WHERE user_id = $1 AND current_credits >= $2`，并检查 affected row count。
- FIFO 明细扣减需要行锁或条件更新，避免并发请求重复消费同一笔 `remaining_amount`。

### P1 - `distribute-credits` 仍然缺少暴力破解 / 限流防护

文件：`src/app/api/distribute-credits/route.ts`

当前端点仍然只使用 Basic Auth 校验 `CRON_JOBS_USERNAME` 和 `CRON_JOBS_PASSWORD`。在应用代码中没有看到 per-IP 限流、请求节流、IP allowlist 或反向代理限制。

建议修复：

- 如果该端点公网可访问，应在反向代理或平台层限制为可信 Cron 来源。
- 如果无法做来源限制，应增加应用层 rate limit。

### P1 - Group 发送路径仍然缺少显式 group ownership 校验

文件：`src/app/api/chat/send/route.ts`

当前路由会把任意 `groupId` 转发到当前用户的 Bridge 目标，并且只在之后为了 mention 归一化去拉取 group members。发送前没有在应用层查询 `userGroup` 表确认 `(userId, groupId)` 是否存在。

如果 Bridge 目标严格做到“每个用户只能访问自己的 group”，这个问题的风险会降低。但应用层仍然不应把 Bridge 隔离作为唯一鉴权边界。

建议修复：

- 在转发 group chat 前，查询 `userGroup` 表确认当前用户拥有该 group。
- Bridge 侧隔离作为 defense-in-depth，而不是唯一授权判断。

### P1 - `agent-docs` 大小与路径处理仍然不完整

文件：`src/app/api/chat/agent-docs/[agentId]/[docKey]/route.ts`

当前状态：

- PUT 已有 5MB 输入大小限制。
- 本地 Docker 路径的 `execFile` 使用了 `maxBuffer: 2 * 1024 * 1024`。
- Docker PUT 对 `workspace.startsWith('/home/openclaw/')` 做了检查。

剩余问题：

- VPS mode 的 GET / PUT 会直接转发到 Bridge，没有应用层大小限制。
- Docker GET 在 `path.posix.join()` 前没有校验 workspace 前缀。
- 仅使用 `startsWith()` 做前缀检查不够严谨。类似 `/home/openclaw/../...` 的路径在规范化前可能通过字符串检查。

建议修复：

- App 与 Bridge 路径都使用一致的最大文档大小限制。
- 使用 `path.posix.resolve()` 做路径规范化。
- 要求最终 resolved doc path 必须仍然位于 `/home/openclaw/` 下。
- GET 和 PUT 都执行相同的 workspace 校验。

### P2 - Direct OpenRouter Chat 仍然没有重试 / backoff

文件：`src/lib/myclawgo/direct-chat.ts`

OpenRouter management API 已经加了重试，但 direct chat 仍然只对下面的接口做一次 `fetch()`：

```ts
https://openrouter.ai/api/v1/chat/completions
```

临时 429 或 5xx 会直接失败。

建议修复：

- 对 429 和 5xx 增加有上限的指数退避重试。
- 保留现有 abort / timeout 语义。
- 不要重试鉴权失败、参数错误等 4xx validation/auth 错误。

### P2 - 没有看到全局 API 限流

文件：所有 API routes

当前没有看到统一的应用层 rate limit。部分 auth provider 路径可能内部处理 429，但项目自己的 chat、runtime 创建、cron、proxy 等端点没有共享的限流机制。

建议修复：

- 增加统一的 per-user / per-IP rate limit helper。
- 对未登录端点、Cron 端点、runtime 创建、chat / billing 端点使用更严格的限制。
- 如果限流由 Nginx / CDN 实现，应把生产规则文档化并纳入版本管理。

### P2 - Payment / Customer 唯一性约束仍然不完整

文件：`src/db/schema.ts`

`payment.customerId` 当前只有普通索引：

```ts
paymentCustomerIdIdx: index("payment_customer_id_idx").on(table.customerId)
```

没有唯一约束防止同一个用户 / customer 组合被并发创建出重复记录。

建议修复：

- 先确认 Stripe 数据模型是否允许同一用户保留多条历史 payment / subscription 记录。
- 根据业务语义添加唯一索引，例如 `(userId, customerId, type)` 或 `(userId, customerId)`。
- 应用层写入逻辑改为 upsert 或 conflict-safe 流程。

### P3 - 环境变量校验仍然分散

文件：`src/instrumentation.ts`、`src/instrumentation-node.ts`、依赖环境变量的各模块

当前没有统一的启动时 env validation。关键变量仍然由各模块在运行时懒检查。

建议修复：

- 增加一个服务端 env validation 模块。
- 在 Next instrumentation 的 Node runtime 中执行。
- 生产环境至少校验：加密密钥、auth secret、Bridge token、OpenRouter keys、Stripe keys、Cron 凭据、数据库 URL。

### P3 - Runtime 容器仍然使用 `sleep-infinity`

文件：

- `docker/openclaw-runtime/entrypoint.sh`
- `docker/openclaw-runtime/Dockerfile`
- `src/lib/myclawgo/docker-manager.ts`

runtime image 仍然使用 `sleep-infinity` / `sleep infinity` 作为长驻主进程。旧报告中 graceful shutdown 的问题仍然成立。

建议修复：

- 用一个小型 init / supervisor 脚本替换裸 `sleep`。
- 捕获 `SIGTERM`，在容器退出前清理子进程和服务。

## 低优先级但仍然合理的问题

- 时间戳处理仍然混用普通 `timestamp()`、`timestamp(..., { withTimezone: true })` 以及应用层 `new Date()`。
- 日志仍然混用 Fastify logger、框架日志和直接 `console.*`。Bridge 已使用 Fastify logger，但 Next app 仍缺少一致的日志级别策略。

## 建议优先级

立即处理：

1. 移除 owner email fallback。
2. 将信用扣费改为完整事务化和幂等化。
3. 给 `distribute-credits` 增加来源限制或限流。
4. 收紧 `agent-docs` 在 App 与 Bridge 两种模式下的路径和大小检查。

随后处理：

1. 给 direct OpenRouter chat 增加 retry / backoff。
2. 设计并落地全局 API rate limit。
3. 确认 Stripe 历史记录语义后增加 payment / customer 唯一约束。
4. 增加集中式 env validation。
