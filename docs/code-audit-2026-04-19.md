# 代码审计报告

> 审计日期：2026-04-19  
> 范围：my-claw-go 全项目（Next.js 15 SaaS + Bridge 服务）

---

## Critical（严重）

### 1. 加密密钥有硬编码默认值
- **文件**：`src/lib/myclawgo/agent-config.ts`
- **问题**：如果 `MYCLAWGO_CONFIG_SECRET` / `BETTER_AUTH_SECRET` / `AUTH_SECRET` 都未设置，会 fallback 到 `'dev-only-openclaw-secret-change-me'`，导致所有加密数据（OR 子密钥、bot token）可被任何人解密。
- **建议**：生产环境必须配置 `MYCLAWGO_CONFIG_SECRET`；代码层加启动时 fatal 检查，未配置则拒绝启动。

### 2. 所有者邮箱硬编码
- **文件**：`src/app/api/runtime/[sessionId]/chat/route.ts`
- **问题**：
  ```ts
  const OWNER_EMAIL = process.env.MYCLAWGO_OWNER_EMAIL || 'ouyanghuiping@gmail.com';
  ```
  泄露了管理员邮箱，且让任何人都能推断出哪个账号是平台管理员，有助于针对性攻击。
- **建议**：移除默认值，改为仅通过 env 配置，未设置时不返回调试信息。

### 3. `active-chat-store.ts` 无原子写
- **文件**：`src/lib/myclawgo/active-chat-store.ts`
- **问题**：`session-store.ts` 已修复为 tmp+rename 原子写，但 `active-chat-store.ts` 仍直接调用 `fs.writeFile`，并发写时可能丢失数据或产生文件损坏。
- **建议**：与 `session-store.ts` 保持一致，改用 tmp 文件 + `fs.rename` 原子写入。

---

## High（高）

### 4. 信用消费非原子（竞态条件）
- **文件**：`src/credits/credits.ts`
- **问题**：check-then-act 模式：读余额 → 计算新值 → 写回，并发场景下会出现重复扣除或少扣。
- **建议**：改为数据库层原子操作：
  ```sql
  UPDATE user_credit SET current_credits = current_credits - $1 WHERE user_id = $2
  ```

### 5. `distribute-credits` 无暴力破解防护
- **文件**：`src/app/api/distribute-credits/route.ts`
- **问题**：Basic Auth 验证逻辑正确，但无速率限制，攻击者可暴力猜测用户名密码。
- **建议**：接入速率限制（如 Upstash Redis），或限制此端点仅允许内网/Cron 服务 IP 访问。

### 6. Group 访问无鉴权验证
- **文件**：`src/app/api/chat/send/route.ts`
- **问题**：`groupMembers` 为空时直接从 Bridge 拉取成员列表，但未验证当前用户是否有权限访问该 group，可能导致未授权的组访问。
- **建议**：在 Bridge 拉取成员之前，先校验 `userId` 是否为该 group 的合法成员或 owner。

### 7. agent-docs 无内容大小限制 + 路径未验证
- **文件**：`src/app/api/chat/agent-docs/[agentId]/[docKey]/route.ts`
- **问题**：
  - 文档内容无大小上限，超大内容会导致 OOM。
  - `workspace` 路径来自 Bridge API，未验证是否包含 `..` 等路径遍历字符。
- **建议**：加 size limit（如 1MB）；对 `workspace` 做路径白名单或 `path.resolve` + 前缀校验。

### 8. Bridge Token 未配置时容器仍可启动（部分场景）
- **文件**：`src/lib/myclawgo/docker-manager.ts`
- **问题**：`MYCLAWGO_BRIDGE_TOKEN` 未配置时返回错误对象，但调用方可能未严格检查返回值。
- **建议**：确保所有调用方对 `ok: false` 的返回值做显式处理，阻止容器无 token 启动。

### 9. OpenRouter API 调用无重试/限流处理
- **文件**：`src/lib/myclawgo/openrouter-key-provisioner.ts`、`src/lib/myclawgo/direct-chat.ts`
- **问题**：没有处理 429 Too Many Requests 或网络抖动，失败后直接报错，无 backoff 重试。
- **建议**：对 OpenRouter API 调用加指数退避重试（最多 3 次）。

---

## Medium（中）

### 10. 所有 API 路由无全局速率限制
- **文件**：全部 API 路由
- **问题**：无 per-user 或 per-IP 速率限制，任意端点均可被滥用（信用消费、容器创建等）。
- **建议**：接入 Upstash Redis Rate Limit，或使用 Nginx limit_req 模块在反向代理层限流。

### 11. Telegram Webhook Secret 无轮换机制
- **文件**：`src/app/api/webhooks/telegram/[userId]/[agentId]/route.ts`
- **问题**：Webhook secret 存储在数据库，泄露后无法失效，攻击者可持续伪造事件。
- **建议**：提供手动触发轮换的 API（重新生成 secret 并更新 Telegram webhook 注册）。

### 12. 时间戳处理不统一
- **文件**：`src/credits/distribute.ts`、`src/lib/myclawgo/session-store.ts` 等多处
- **问题**：`new Date()` 与 `new Date().toISOString()` 混用，跨时区场景下可能产生边界 bug。
- **建议**：统一使用 UTC 时间，数据库字段统一用 `timestamp with time zone`。

### 13. 信用交易 DB 层无唯一约束
- **文件**：`src/db/schema.ts`（payment 表）
- **问题**：无 `(userId, stripeCustomerId)` 的唯一约束，并发创建可能产生重复 customer 记录，导致支付处理混乱。
- **建议**：在 schema 层加 unique index，并在应用层加 upsert 而非 insert。

---

## Low（低）

### 14. 无日志级别控制
- **文件**：全项目
- **问题**：`console.log/warn/error` 混用，生产环境没有过滤调试日志的机制，可能泄露内部信息并产生性能开销。
- **建议**：引入结构化日志库（如 `pino`），并通过 `LOG_LEVEL` 环境变量控制输出级别。

### 15. 缺乏启动时环境变量全量检查
- **文件**：各模块分散检查
- **问题**：关键 env 变量（加密密钥、Bridge Token 等）在运行时才检查，应在应用启动时统一 fail-fast。
- **建议**：在 `src/lib/env.ts` 或 Next.js instrumentation hook 中做一次性 env 校验。

### 16. 容器无 Graceful Shutdown
- **文件**：Docker 相关代码
- **问题**：容器使用 `sleep-infinity` 保持运行，无 graceful shutdown 钩子，强制停止时会中断进行中的请求。
- **建议**：注册 `SIGTERM` 处理程序，等待当前请求完成后再退出。

---

## 修复优先级汇总

| 优先级 | 问题 | 操作建议 |
|--------|------|----------|
| P0 立即 | #1 加密密钥硬编码默认值 | 确认生产 env 配置 + 代码加启动检查 |
| P0 立即 | #2 所有者邮箱硬编码 | 移除默认值，仅通过 env 配置 |
| P0 立即 | #3 active-chat-store 并发写 | 改用 tmp+rename 原子写 |
| P1 本周 | #4 信用消费竞态 | DB 层原子 UPDATE |
| P1 本周 | #6 Group 鉴权缺失 | 验证 userId 是否在 group 内 |
| P1 本周 | #7 agent-docs 大小/路径 | 加 size limit + path 白名单 |
| P2 本月 | #10 全局速率限制 | Upstash / Nginx limit_req |
| P2 本月 | #11 Webhook secret 轮换 | 提供轮换 API |
| P3 后续 | #14–16 代码质量优化 | 结构化日志、env 校验、graceful shutdown |
