# MyClawGo 项目整体复盘与产品方向 - 2026-05-05

## 结论

MyClawGo 当前已经从早期 SaaS 模板 / URL-to-video 项目，演进成一个“托管 OpenClaw + 每用户独立 VPS + 多 Agent 工作空间”的产品。核心方向是成立的，但代码库里仍有明显的模板遗留、旧业务残留和运行时安全边界问题。

当前最应该做的不是继续堆功能，而是把产品收敛成一个明确的主线：

```text
Managed OpenClaw Workspace
给非技术用户一个不用买 VPS、不用配置 API key、可以直接使用多 Agent 的私有云工作空间。
```

后续产品方向建议围绕三个差异点做深：

1. 私有独立运行时：每用户独立 VPS / 独立工作空间 / 数据隔离。
2. 多 Agent 协作：Agent 团队、群组 relay、Office 工作台。
3. 托管运维省心：不用 VPS、不用装环境、不用管理 OpenRouter key、不用维护备份。

## 当前项目形态

### 已经形成的核心资产

- 付费后自动创建用户 VPS：
  - `src/lib/myclawgo/provision-worker.ts`
  - `src/lib/myclawgo/runtime-provision.ts`
  - `src/app/api/internal/runtime/register/route.ts`
- 每用户 OpenRouter sub-key：
  - `src/lib/myclawgo/openrouter-key-provisioner.ts`
  - `user_openrouter_key`
- Bridge 服务：
  - `bridge/src/app.ts`
  - `bridge/src/routes/chat.ts`
  - `bridge/src/routes/agents.ts`
  - `bridge/src/routes/groups.ts`
  - `bridge/src/routes/tasks.ts`
- Web 端核心工作台：
  - Chat：`src/components/dashboard/chat/chat-shell.tsx`
  - Office：`src/components/dashboard/office/office-shell.tsx`
  - Groups：`src/components/dashboard/groups/groups-shell.tsx`
  - Agents settings：`src/components/settings/agents/*`
- 计费和积分：
  - `src/credits/*`
  - `src/lib/myclawgo/billing.ts`
  - Stripe provider
- SEO 和营销基础：
  - `/openclaw-hosting`
  - blog 内容
  - 新的 `og.png` / `youtube.png`

### 主要问题

- 项目仍有大量模板和旧业务痕迹：
  - `README.md` 仍是 `url-to-video`。
  - `package.json.name` 仍是 `mksaas-template`。
  - marketing 下仍有 AI video / image / audio / text 等模板页。
  - MagicUI / Tailark preview 示例页面仍暴露在代码路由中。
- 核心运行时边界还不够清晰：
  - 用户 VPS 上仍写入真实 OpenRouter key。
  - Bridge 本地文件仍是多个数据的 source of truth。
  - Bridge `/chat/send` 无 rate limit。
- 产品主线有分叉：
  - 网站文案有“OpenClaw hosting”主线。
  - 配置和包名仍保留 URL-to-video / AI media SaaS 痕迹。
  - 这会影响用户理解，也影响 SEO 和转化。

## 优先级最高的工程优化

### P0 - 移除 OpenRouter key 下发到用户 VPS

当前真实 OpenRouter sub-key 会写入用户 VPS 的 `auth-profiles.json`。如果用户能获得 VPS shell/root 权限，就能读到 key。

建议按今天的方案文档推进：

- `docs/myclawgo/20260505/OPENROUTER_KEY_NON_EXPOSURE_PLAN_2026-05-05.md`

最终目标：

```text
真实 OpenRouter key 只留在 MyClawGo 控制面；
用户 VPS 只持有受限 proxy token；
模型请求通过 MyClawGo OpenRouter Proxy 转发。
```

这项优先级高于继续增加新功能，因为它决定产品能否安全地宣称“托管密钥、用户无需管理 key”。

### P0 - 清理品牌和旧业务残留

需要统一项目身份。

建议立即处理：

- `README.md` 改为 MyClawGo 项目说明。
- `package.json.name` 从 `mksaas-template` 改为 `myclawgo` 或 `my-claw-go`。
- 清理或隐藏以下模板/旧业务页面：
  - `/ai/video`
  - `/ai/image`
  - `/ai/audio`
  - `/ai/text`
  - `/produkt-video`
  - `/magicui`
  - `/test`
- 检查文案中仍出现的 `url-to-video`、`My Claw Go: Turn any URL into Video` 等旧定位。
- `messages/en.json` 的 Metadata / HomePage 仍有旧 URL-to-video 文案，需要改成 OpenClaw hosting。

目标是让代码、SEO、产品和用户看到的是同一个产品。

### P0 - Bridge 状态迁移和数据备份

当前 Bridge 仍大量依赖本地文件：

- `jobs.json`
- `myclawgo-task-runs.jsonl`
- `myclawgo-groups.json`
- Markdown chat transcript

风险：

- VPS 损坏后数据恢复不完整。
- 多实例扩展困难。
- JSONL 无限增长。
- group 虽已 sync 到 PG，但本地 JSON 仍是 source of truth。

建议：

1. group source of truth 切到 PG，Bridge 本地只做 cache。
2. task 定义和 task run history 迁移到 PG。
3. chat transcript 统一写入 `userChatMessage`。
4. 短期先给 JSONL 增加轮转和保留期。

### P0 - 全局限流和 Bridge 限流

当前需要补两层限流：

- App API 层：
  - chat
  - runtime create/start
  - distribute-credits
  - proxy-image / generate endpoints
- Bridge 层：
  - `/chat/send`
  - group relay
  - tasks run

建议：

- App 层做 per-user / per-IP limiter。
- Bridge 使用 `@fastify/rate-limit`。
- group relay 使用更严格上限，避免放大消耗。

这直接影响 OpenRouter quota、VPS 资源和账单风险。

## 中期工程优化

### P1 - 计费扣费事务化

`consumeCredits()` 已有 SQL 算术扣减，但仍不是完整事务：

- 幂等检查不是唯一约束。
- FIFO remaining amount 有并发窗口。
- 余额检查和扣减分离。

建议：

- `credit_transaction.payment_id` 增加唯一约束。
- 消费流程包进事务。
- 余额扣减使用条件更新。
- FIFO 明细扣减使用锁或条件更新。

### P1 - 路由审计闭环

模型路由当前只在日志中输出 reason，没有写入 billing audit。

建议在 `userChatBillingAudit.metaJson` 写入：

- routingLevel
- routingReason
- routingMode
- resolvedModel
- routerEnabled
- userModelOverride

后续才能判断模型路由是否真的省钱、是否影响质量。

### P1 - Provisioning 可观测性

当前 provisioning 已经有 worker、waiting_init、agent retry，但用户和运营侧可观测性还不够。

建议：

- 增加 admin runtime dashboard：
  - pending / buying_vps / waiting_init / ready / failed 数量
  - 最近失败原因
  - Hetzner project 容量
  - 每个 VPS 成本和状态
- provisioning 失败自动通知管理员。
- 用户前端显示更准确的状态和预计耗时。

### P1 - Telegram 真正接入聊天流

当前 Telegram webhook 主要完成 secret 校验和 channel binding，还没有真正调用统一聊天链路。

建议：

1. Telegram 入站消息写入 `userChatMessage`。
2. 走同一套 Bridge chat task。
3. 回复发送回 Telegram。
4. Web UI 支持按 channel 筛选。
5. 后续支持 Telegram group relay。

Telegram 是很适合 MyClawGo 的渠道，因为它天然是“常驻助理 + 群组协作”的使用场景。

### P1 - Task / Office 工作台产品化

Office 页已经有 Agent status、tasks、近期运行等基础，但 task 仍偏技术化。

建议把它包装成“AI 员工排班 / 自动工作流”：

- 每个 Agent 有工作列表。
- 用户用自然语言创建 recurring task。
- 失败自动重试。
- 失败通知到 Telegram / Email。
- Office 首页展示“今天 AI 团队完成了什么”。

这是比单纯聊天更容易体现付费价值的方向。

## 产品方向建议

### 方向一：Managed OpenClaw Hosting

这是当前最清晰、最容易转化的主线。

目标用户：

- 想用 OpenClaw，但不想买 VPS / 配环境的人。
- 自托管过但厌烦维护的人。
- 创始人、运营、内容团队、独立开发者。

核心卖点：

- 不需要 VPS。
- 不需要 API key。
- 每用户独立 workspace。
- 支持多 Agent。
- 5 分钟 ready。

对应产品页面：

- `/openclaw-hosting` 继续加强。
- 首页也应完全转向这个主线。
- 旧 AI media 页面应隐藏或删除。

### 方向二：Multi-Agent Relay Workspace

这是差异化卖点。多数托管产品只是“单 Agent 聊天”，MyClawGo 可以主打“AI 团队”。

产品化方向：

- Agent 角色模板：
  - Researcher
  - Writer
  - Editor
  - Product Manager
  - Growth Operator
  - Support Agent
- Group templates：
  - 内容生产团队
  - 产品评审团队
  - 市场增长团队
  - 代码审查团队
- 一键创建 Agent 团队。
- relay 流程可视化。
- 每轮协作结果可追踪、可导出。

这部分应成为 Demo 视频和获客内容的核心。

### 方向三：AI Operations Console

把 Office 页面做成“AI 团队运营控制台”。

方向：

- 每个 Agent 的状态。
- 当前任务。
- 最近产出。
- 定时任务。
- 错误和告警。
- 成本消耗。
- 一键暂停 / 重启 / 调整模型。

这能支撑 Premium / Ultra 价格，因为用户买的不只是聊天，而是一个可运营的 AI 工作系统。

### 方向四：Telegram-first Agent

Telegram 是天然增长渠道：

- 用户习惯移动端对话。
- 群组场景适合多 Agent。
- Bot 可以常驻。
- 使用频率比 Web dashboard 更高。

建议：

- 先完成 Telegram DM 到 Agent。
- 再做 Telegram group relay。
- 再做“从 Web 配置，从 Telegram 使用”的体验。

## 增长和定位建议

### 先不要做太泛的 AI 平台

当前代码里还有 AI image/video/audio/text 等能力，但这些会稀释定位。

建议短期避免主打：

- AI image generator
- URL to video
- text to video
- generic AI tools

这些赛道竞争激烈，且和“托管 OpenClaw”认知冲突。

### 内容方向应该围绕 OpenClaw hosting

优先内容：

- OpenClaw without VPS
- Managed OpenClaw hosting
- MyClawGo vs MyClaw.ai
- How to run multiple OpenClaw agents
- OpenClaw group relay tutorial
- Self-hosted OpenClaw vs managed OpenClaw

不要再写泛 AI 工具内容。

### 定价建议

当前定价：

- Pro $29.90/mo
- Premium $59.90/mo
- Ultra $199.90/mo

这个定价只有在“独立 VPS + 托管 OpenClaw + OpenRouter key + 自动备份”表达清楚时才合理。

建议页面明确列出：

- VPS included
- OpenRouter access included
- Dedicated workspace
- Persistent memory
- Backups
- Multi-agent groups
- Telegram channel

否则用户会把它和普通 ChatGPT wrapper 比价。

## 代码库治理建议

### 1. 删除或归档模板组件

当前 `src/components/tailark/preview`、`src/components/magicui/example`、部分 marketing AI 页面会增加维护噪音。

建议：

- 不在生产路由暴露。
- 如果只是组件参考，移动到 `docs/examples` 或删除。
- `knip` 扫描未使用文件。

### 2. 建立 MyClawGo 文档索引

`docs/myclawgo` 下文档很多，但缺少总索引。

建议新增：

```text
docs/myclawgo/README.md
```

内容：

- 当前架构
- 部署流程
- 付费与 provisioning
- Bridge
- OpenRouter key
- 今日决策文档索引

### 3. 区分生产代码和实验代码

建议把旧 AI media / demo / test 页面加明确边界：

- 删除
- 或移动到 `src/app/[locale]/(experiments)`
- 或用 env flag 禁用

生产路由越少，SEO 和安全面越清晰。

### 4. 增加关键路径测试

最低限度应覆盖：

- Stripe paid webhook -> provision job。
- provision worker -> runtimeAllocation 状态。
- register route token 校验。
- OpenRouter key provisioning。
- credit consumption idempotency。
- chat send billing。
- group relay mention normalization。

## 90 天产品路线

### 第 0-2 周：收敛和安全

目标：让产品可信、定位清楚。

- 清理旧品牌和旧页面。
- 首页和 `/openclaw-hosting` 统一定位。
- 移除 OpenRouter key 下发到 VPS，设计 / 实现 proxy。
- Bridge `/chat/send` 限流。
- group relay 总时长上限。
- owner email fallback、扣费事务等安全问题修复。

### 第 3-6 周：核心体验增强

目标：让付费用户持续使用。

- 一键 Agent 团队模板。
- Group relay 可视化。
- Office 工作台增强。
- Task retry / notification。
- Telegram DM 接入。
- 聊天记录导出。

### 第 7-12 周：增长和高价套餐

目标：提升转化和 ARPU。

- 多 Agent demo 视频。
- Product Hunt / Reddit / V2EX 发布。
- OpenClaw hosting SEO 内容矩阵。
- Premium / Ultra 强化：
  - 更多资源
  - 更多 Agent
  - 更高 OpenRouter limit
  - Telegram group relay
  - 备份和恢复
  - Priority provisioning

## 建议下一步

立即执行的 5 个动作：

1. 清理 README、package name、Metadata、首页旧 URL-to-video 文案。
2. 隐藏或删除旧 AI media / demo 页面。
3. 给 Bridge `/chat/send` 加 rate limit。
4. 给 group relay 加总 deadline。
5. 开始实现 OpenRouter Proxy，停止真实 key 下发到 VPS。

这 5 件事完成后，MyClawGo 的产品边界会清晰很多，也更适合开始集中获客。
