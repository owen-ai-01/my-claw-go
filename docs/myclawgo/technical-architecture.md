# MyClawGo 技术架构文档

> 版本：v1.0
> 更新时间：2026-04-04

---

## 一、系统总体架构

MyClawGo 由两个主要运行时组成，通过内部 HTTP API 通信：

```
┌─────────────────────────────────────────────────────────┐
│                     用户的浏览器                          │
│                   Next.js 前端 (React)                   │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────┐
│              Next.js 主应用（宿主机）                     │
│                                                         │
│  App Router   Server Actions   API Routes               │
│  Auth (Better Auth)  Payments (Stripe)                  │
│  Database (PostgreSQL + Drizzle ORM)                    │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP (BRIDGE_TOKEN 鉴权)
                           │ docker exec
┌──────────────────────────▼──────────────────────────────┐
│       用户专属 Docker 容器（每用户一个）                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │   Bridge 服务 (Fastify, :18080)                  │   │
│  │   - Agent / Group / Task / Chat 管理             │   │
│  │   - 鉴权、参数校验、错误封装                      │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │ WebSocket                     │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │   OpenClaw Gateway (:18789)                      │   │
│  │   - 实际的 AI 模型调用                            │   │
│  │   - Agent 记忆与工具执行                          │   │
│  │   - 聊天会话管理                                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  持久化挂载目录 (~/.openclaw/)                           │
│  - openclaw.json（Agent 配置）                          │
│  - agents/<id>/{agent.md, workspace/}                   │
│  - chats/<channel>/<agentId>/<scope>.md                 │
│  - cron/jobs.json + task-runs.jsonl                     │
│  - myclawgo-groups.json                                 │
└─────────────────────────────────────────────────────────┘

外部服务：
- Stripe（支付）
- Resend（邮件）
- Telegram（Bot Webhook）
- S3/R2（文件存储）
- OpenRouter（AI 模型路由）
```

---

## 二、技术栈

### 主应用（Next.js）
| 层级 | 技术 |
|-----|------|
| 框架 | Next.js 15 (App Router) + React 19 |
| 语言 | TypeScript（strict 模式）|
| 数据库 | PostgreSQL + Drizzle ORM v0.39 |
| 认证 | Better Auth v1.1（Google/GitHub OAuth + 邮密）|
| 支付 | Stripe v17 |
| 状态管理 | Zustand v5 |
| UI | Radix UI + TailwindCSS v4 |
| 表单 | React Hook Form + Zod + next-safe-action |
| 国际化 | next-intl（en/zh）|
| 邮件 | React Email + Resend |
| 内容 | Fumadocs（文档）+ MDX（博客）|
| 代码质量 | Biome（lint + format）|
| AI SDK | Vercel AI SDK v5（@ai-sdk/react v2）|

### Bridge 服务（Fastify）
| 层级 | 技术 |
|-----|------|
| 框架 | Fastify（Node.js）|
| 通信 | WebSocket（连接 OpenClaw Gateway）|
| 持久化 | 本地文件系统（JSON / Markdown）|
| 调度 | 内置 Cron 循环 |

### 基础设施
| 层级 | 技术 |
|-----|------|
| 容器化 | Docker（每用户一个容器）|
| 存储 | S3 兼容（Cloudflare R2）|
| AI 模型 | OpenRouter（多模型路由）|
| CDN/部署 | Cloudflare / 自托管 |

---

## 三、数据库 Schema

### 认证相关表（Better Auth 托管）
```
user              - 用户主表（id, name, email, role, banned）
session           - 会话（支持模拟登录）
account           - OAuth 绑定（Google, GitHub）
verification      - 邮件验证 / 密码重置 Token
```

### Agent 相关表
```sql
userAgent
  id, userId, runtimeAgentId  -- runtimeAgentId 对应容器内的 Agent ID
  name, slug, isDefault
  emoji, role, department
  model                        -- 默认模型

userAgentTelegramBot
  id, userId, agentId
  botToken (加密存储), botUsername
  webhookUrl, webhookSecret
  isEnabled

userChannelBinding
  id, userId, agentId
  platform (telegram/...)
  externalChatId, externalUserId
  metadata (JSONB)
  status (connected/disconnected)
```

### 聊天相关表
```sql
userChatMessage
  id, userId, agentId, groupId
  role (user/assistant/system)
  content
  status (pending/running/done/failed)
  createdAt, updatedAt

userChatTask
  id, userId, agentId
  status (queued/started/finished)
  createdAt, startedAt, finishedAt

userChatBillingAudit
  id, userId, agentId, messageId
  inputTokens, outputTokens, cacheReadTokens
  creditsDeducted
  source (actual/estimated/fallback)  -- 成本数据来源
  metaJson (JSONB)                    -- 供应商特定元数据
  model                               -- 实际使用的模型
```

### 支付与 Credits 表
```sql
payment
  id, userId
  stripeCustomerId, stripeSubscriptionId, invoiceId
  scene (lifetime/subscription/credit)  -- 支付场景
  amount, currency
  status

userCredit
  id, userId
  balance                              -- 当前余额（Credits）

creditTransaction
  id, userId
  amount (正数=增加, 负数=消耗)
  type (subscription/credit_package/usage/expiry)
  expiresAt                            -- Credits 有效期
  invoiceId (唯一约束, 防止重复入账)
  description
```

### 运行时任务表
```sql
runtimeTask
  id, userId, agentId
  status (queued/started/finished)
  retryCount
  payload (JSONB)
  createdAt, startedAt, finishedAt
```

---

## 四、关键模块详解

### 4.1 用户工作空间初始化流程

用户注册后，系统触发工作空间初始化：

```
1. 在 PostgreSQL 创建用户记录（Better Auth）
2. 触发 onUserCreate 钩子：
   a. 为用户创建 Stripe Customer
   b. 初始化 userCredit 记录（余额=0）
   c. 发送欢迎邮件
3. （异步）调度容器创建任务：
   a. docker run 启动用户专属容器
   b. 设置挂载目录、资源限制
   c. entrypoint.sh 初始化目录结构
   d. 启动 Gateway (ws://:18789) 和 Bridge (http://:18080)
4. 容器就绪后，写入用户容器标识到数据库
```

### 4.2 消息发送链路

```
[用户点击发送]
     │
     ▼
POST /api/chat/send
     │ 1. 校验用户会话
     │ 2. 检查 Credit 余额 (≥ MIN_CREDITS)
     │ 3. 创建 userChatTask 记录（queued）
     ▼
获取用户容器的 Bridge 地址
     │
     ▼
POST http://{bridge}:18080/chat/send
  {message, agentId, groupId?, model?}
  Authorization: Bearer {BRIDGE_TOKEN}
     │
     ▼ (Bridge 内部)
1. 构建 Agent 上下文（加载 5 个 .md 配置文件）
2. 若是群组对话：构建群组上下文 + 成员列表
3. 通过 WebSocket 发送给 OpenClaw Gateway
4. Gateway 调用 AI 模型（经由 OpenRouter）
5. 流式响应返回
     │
     ▼ (回到主应用)
6. 实时流式转发给前端（Server-Sent Events）
7. 完成后：
   a. 扣减 Credits（写 creditTransaction）
   b. 写 userChatBillingAudit
   c. 更新 userChatTask 状态为 finished
   d. 保存消息到 userChatMessage
```

### 4.3 群组 Relay 接龙机制

```
[用户发送消息到群组]
     │
     ▼
Bridge 加载群组配置（myclawgo-groups.json）
  - 成员列表 + LeaderId
  - maxTurns, cooldownMs
     │
     ▼
判断是否有有效 @mention（且被 mention 的是群成员）
  - 有：直接路由给被 mention 的 Agent
  - 无：路由给 Leader Agent
     │
     ▼
Agent 生成响应
  - 分析响应内容是否包含 @{validMemberId}
  - 排除自我 mention（non-self 限制）
  - 找到第一个有效 mention → 准备移交
     │
     ▼
Relay 判断（若 relay.enabled = true）
  - 当前轮数 < maxTurns？
  - 检查 groupRelayControl Map 防循环
  - 等待 cooldownMs
  - 将响应 + 上下文传递给下一个 Agent
     │
     ▼
循环，直到：
  - 达到 maxTurns
  - Agent 未产生有效 @mention
  - 收到停止指令（#stop / #pause / /stop-relay）
  - 中文停止模式匹配（继续@, 随机@, 接龙）
```

**循环防护机制：**
- `groupRelayControl` Map：key = `{runId}:{groupId}`，value = `{stopped: bool}`
- 每次 Relay 分配唯一 `runId`，追踪整个接龙会话
- 已访问的有向边（fromAgent → toAgent）记录，防止重复路径

### 4.4 智能模型路由（Model Router）

位置：`src/lib/myclawgo/model-router.ts`

```
输入：{message, userId, forceModel?}
     │
     ▼
若 forceModel 已指定 → 直接使用
     │
     ▼
分类器（纯规则，0ms 延迟）：

L1 判断（简单）：
  - 消息长度 < 30 字
  - 匹配 greeting / ack 模式
  → 使用 L1 模型（Gemini 2.0 Flash Exp）

L2 判断（专项）：
  - 包含代码块（```）→ Claude Haiku 4.5
  - 主要是中文（>70% 中文字符）→ DeepSeek-V3
  - 工具关键词（搜索/查询/获取）→ Claude Haiku 4.5

L3 判断（复杂）：
  - 超长消息（>5000 字符）→ Gemini 2.5 Pro（长上下文）
  - 架构/分析/系统设计关键词 → Claude Sonnet 4.6
  - 包含工具调用意图 → Claude Sonnet 4.6

默认 → Claude Sonnet 4.6

     ▼
返回 {model, tier, reason}
```

**环境变量覆盖：**
```
MYCLAWGO_ROUTER_L1_MODEL=google/gemini-2.0-flash-exp
MYCLAWGO_ROUTER_L2_CODE_MODEL=anthropic/claude-haiku-4-5
MYCLAWGO_ROUTER_L2_ZH_MODEL=deepseek/deepseek-chat-v3-0324
MYCLAWGO_ROUTER_L3_MODEL=anthropic/claude-sonnet-4-6
MYCLAWGO_ROUTER_L3_LONG_MODEL=google/gemini-2.5-pro-preview
```

### 4.5 Telegram Webhook 处理链路

```
Telegram 服务器
  POST /api/webhooks/telegram/{userId}/{agentId}
  Header: X-Telegram-Bot-API-Secret-Token: {webhookSecret}
     │
     ▼
1. 验证 webhookSecret（与数据库记录比对）
2. 提取 chat_id, from.id, text
3. 查找 userChannelBinding（chat_id + agentId）
4. 若无绑定：创建新绑定记录
5. 构建消息对象 {text, from, chat}
6. 转发给 Bridge /chat/send
7. Agent 响应 → 调用 Telegram Bot API 发送回消息
8. 响应保存到 userChatMessage（带 telegram source 标记）
```

### 4.6 定时任务执行

**调度器运行在 Bridge 内部（非主应用）：**

```
Bridge 启动时：
  - 加载 cron/jobs.json（所有用户的所有任务）
  - 每 30 秒 tick 一次检查循环

每次 tick：
  - 遍历所有启用的任务
  - 计算 nextRunTime（基于 schedule 类型）
  - 若 now >= nextRunTime：
    a. 更新 lastRunAt
    b. 构建执行 payload {message, model?}
    c. 发送给对应 Agent（走正常 chat/send 链路）
    d. 追加执行记录到 task-runs.jsonl
    e. 计算并更新 nextRunTime

任务状态通过 Bridge API 暴露给主应用 UI：
  GET /agents/{agentId}/tasks/{taskId}/runs
```

### 4.7 Credit 计量与扣减

```
AI 模型返回使用量 {inputTokens, outputTokens, cacheReadTokens}
     │
     ▼
查找模型定价（src/lib/myclawgo/model-pricing.ts）
  - 每 1M input tokens 价格（USD）
  - 每 1M output tokens 价格（USD）
  - 缓存读取折扣
     │
     ▼
计算 USD 成本
     │
     ▼
转换为 Credits：ceil(USD_cost / 0.001)
  （1 Credit = $0.001 内部成本）
     │
     ▼
原子事务：
  1. INSERT creditTransaction {amount: -credits, type: 'usage'}
  2. UPDATE userCredit SET balance = balance - credits
  3. INSERT userChatBillingAudit {inputTokens, outputTokens, creditsDeducted, source: 'actual'}

若模型未返回使用量：
  - source = 'estimated'（用消息长度估算）
  - 或 source = 'fallback'（使用固定最低值）
```

---

## 五、Bridge API 参考

所有请求需携带：`Authorization: Bearer {BRIDGE_TOKEN}`

### Agent 管理
```
GET    /agents                  → 列出所有 Agent
POST   /agents                  → 创建新 Agent
GET    /agents/:id              → 获取 Agent 详情
PUT    /agents/:id              → 更新 Agent 配置
DELETE /agents/:id              → 删除 Agent
GET    /agents/:id/status       → 获取 Agent 状态 + 最近活动
GET    /agents/:id/agents-md    → 读取 AGENTS.md 内容
PUT    /agents/:id/agents-md    → 写入 AGENTS.md 内容
```

### 配置文件（每个 Agent 的 Markdown 配置）
```
GET    /agents/:id/identity-md  → 读取 IDENTITY.md
PUT    /agents/:id/identity-md  → 写入 IDENTITY.md
GET    /agents/:id/user-md      → 读取 USER.md
PUT    /agents/:id/user-md      → 写入 USER.md
GET    /agents/:id/soul-md      → 读取 SOUL.md
PUT    /agents/:id/soul-md      → 写入 SOUL.md
GET    /agents/:id/tools-md     → 读取 TOOLS.md
PUT    /agents/:id/tools-md     → 写入 TOOLS.md
```

### 聊天
```
POST   /chat/send               → 发送消息（支持 agentId 或 groupId）
GET    /chat/history/:key       → 获取历史消息
POST   /chat/session-init       → 初始化新会话
```

### 群组
```
GET    /groups                  → 列出所有群组
POST   /groups                  → 创建群组
GET    /groups/:id              → 获取群组详情
PATCH  /groups/:id              → 更新群组配置
DELETE /groups/:id              → 删除群组
```

### 定时任务
```
GET    /agents/:id/tasks                → 列出 Agent 的所有任务
POST   /agents/:id/tasks                → 创建任务
PATCH  /agents/:id/tasks/:taskId        → 更新任务（含启停）
DELETE /agents/:id/tasks/:taskId        → 删除任务
POST   /agents/:id/tasks/:taskId/run    → 立即执行一次
GET    /agents/:id/tasks/:taskId/runs   → 执行历史
```

### 其他
```
GET    /activity        → 最近活动日志（所有 Agent）
GET    /config          → 读取容器配置
POST   /config          → 更新容器配置
GET    /logs/recent     → 最近系统日志
GET    /health          → 健康检查
```

---

## 六、主应用关键 API Routes

### 聊天
```
POST /api/chat/send              → 转发消息到用户容器 Bridge
GET  /api/chat/history           → 聊天历史（从 DB 读取）
```

### Agent 管理（代理到 Bridge）
```
GET    /api/agents               → 代理 GET /agents
POST   /api/agents               → 代理 POST /agents
GET    /api/agents/:id           → 代理 GET /agents/:id
PATCH  /api/agents/:id           → 代理 PATCH /agents/:id
DELETE /api/agents/:id           → 代理 DELETE /agents/:id
GET    /api/agents/:id/status    → 代理 GET /agents/:id/status
```

### Webhook
```
POST /api/webhooks/stripe                          → Stripe 事件处理
POST /api/webhooks/telegram/:userId/:agentId       → Telegram Bot 消息
POST /api/webhooks/replicate                       → Replicate 任务回调
```

### 运行时管理
```
POST /api/runtime/start          → 启动用户容器
GET  /api/runtime/status         → 容器运行状态
POST /api/runtime/restart        → 重启容器
```

### 其他
```
GET  /api/search                 → 全文搜索（Orama）
POST /api/storage/upload         → 文件上传（S3/R2）
```

---

## 七、容器与部署

### 容器结构
```
myclawgo-openclaw 镜像（基于 Node 20 Alpine）
  - OpenClaw runtime（npm 包）
  - Bridge 服务（Fastify）
  - entrypoint.sh 启动脚本
```

**entrypoint.sh 执行顺序：**
```bash
1. mkdir -p ~/.openclaw/{agents,chats,cron,logs}
2. cp seed/openclaw.json ~/.openclaw/
3. cp seed/auth-profiles.json ~/.openclaw/
4. 启动 OpenClaw Gateway（ws://0.0.0.0:18789）
5. 等待 Gateway 就绪（健康检查）
6. 启动 Bridge（http://0.0.0.0:18080）
7. 保持进程活跃（tail -f /dev/null）
```

### 资源限制（按订阅计划）
| 计划 | CPU | Memory | 磁盘 |
|-----|-----|--------|-----|
| Free | 0.5 | 1GB | 5GB |
| Pro | 1 | 2GB | 20GB |
| Premium | 2 | 4GB | 40GB |
| Ultra | 4 | 8GB | 80GB |

### 主应用与容器通信方式
1. **HTTP（推荐）**：主应用直接 HTTP 请求 `http://{containerName}:18080`
2. **docker exec**：用于低频管理操作（如读取日志、配置检查），超时 15 秒

### 挂载目录结构
```
/data/users/{userId}/                    # 宿主机挂载点
  └── .openclaw/
        ├── openclaw.json                # OpenClaw 主配置（Agent 注册表）
        ├── agents/
        │   └── {agentId}/
        │       ├── agent.md             # 即 IDENTITY.md
        │       ├── workspace/           # Agent 工作目录
        │       └── meta.json            # 扩展元数据
        ├── chats/
        │   └── {channel}/
        │       └── {agentId}/
        │           └── {scope}.md       # Markdown 格式聊天记录
        ├── cron/
        │   ├── jobs.json                # 定时任务配置
        │   └── myclawgo-task-runs.jsonl # 执行历史（JSONL）
        ├── myclawgo-groups.json         # 群组配置
        └── logs/
            └── bridge.log
```

---

## 八、关键环境变量

### 主应用必需变量
```bash
# 数据库
DATABASE_URL=postgresql://...

# 认证
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://myclawgo.com

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# GitHub OAuth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
# Stripe Price IDs
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_...
STRIPE_PREMIUM_YEARLY_PRICE_ID=price_...
STRIPE_ULTRA_MONTHLY_PRICE_ID=price_...
STRIPE_ULTRA_YEARLY_PRICE_ID=price_...
# Credit Package Price IDs
STRIPE_CREDIT_BASIC_PRICE_ID=price_...
...

# 邮件
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@myclawgo.com

# 存储
STORAGE_ENDPOINT=https://...r2.cloudflarestorage.com
STORAGE_BUCKET=myclawgo
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
STORAGE_PUBLIC_URL=https://...

# Bridge 鉴权
BRIDGE_TOKEN=...           # Bridge 服务的 Bearer Token

# Docker
DOCKER_CONTAINER_PREFIX=myclawgo-user-
OPENCLAW_IMAGE=myclawgo-openclaw:2026.3.13
```

### 模型路由变量（可选覆盖）
```bash
MYCLAWGO_ROUTER_L1_MODEL=google/gemini-2.0-flash-exp
MYCLAWGO_ROUTER_L2_CODE_MODEL=anthropic/claude-haiku-4-5-20251001
MYCLAWGO_ROUTER_L2_ZH_MODEL=deepseek/deepseek-chat-v3-0324
MYCLAWGO_ROUTER_L3_MODEL=anthropic/claude-sonnet-4-6
MYCLAWGO_ROUTER_L3_LONG_MODEL=google/gemini-2.5-pro-preview
```

---

## 九、代码规范

### TypeScript
- 路径别名 `@/*` 映射到 `src/*`
- Strict 模式，避免 `any`
- `bridge/` 目录不参与 Next.js 构建（tsconfig.json 中已排除）

### Biome 配置
- 单引号、末尾逗号、总是有分号
- 行宽 80 字符，2 空格缩进
- **忽略检查的目录**：`src/db/migrations/`、`src/components/ui/`（shadcn 生成）、`src/payment/`、`src/credits/`

### Server Actions
- 所有 Server Action 使用 `next-safe-action` + Zod schema 验证
- Action 文件统一放在 `src/actions/`
- 验证失败返回 `{error: string}`，成功返回 `{data: T}`

### 数据库操作
- 所有 Schema 变更必须先 `pnpm db:generate` 生成迁移文件
- 再 `pnpm db:migrate` 应用迁移（不直接 push 到生产）
- 复杂查询使用 Drizzle 的 `sql` 模板字面量

---

## 十、关键文件速查

| 文件 | 用途 |
|-----|------|
| `src/config/website.tsx` | 站点名称、定价配置、功能开关 |
| `src/db/schema.ts` | 所有数据库表定义 |
| `src/lib/myclawgo/model-router.ts` | 智能模型路由逻辑 |
| `src/lib/myclawgo/credits.ts` | Credit 计算与扣减逻辑 |
| `src/lib/myclawgo/membership.ts` | 会员资格检查 |
| `src/lib/auth.ts` | Better Auth 配置（含 webhook 钩子）|
| `src/payment/stripe.ts` | Stripe 客户端配置 |
| `bridge/src/routes/chat.ts` | 消息路由 + Relay 接龙实现 |
| `bridge/src/services/group.ts` | 群组 CRUD + 配置管理 |
| `bridge/src/services/openclaw.ts` | 与 OpenClaw Gateway 的 WebSocket 通信 |
| `bridge/src/services/task.ts` | 定时任务调度器 |
| `docker/openclaw-runtime/entrypoint.sh` | 容器启动脚本 |
| `env.example` | 所有环境变量模板 |
