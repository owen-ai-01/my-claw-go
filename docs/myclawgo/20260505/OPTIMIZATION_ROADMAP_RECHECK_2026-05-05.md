# 优化路线图复核 - 2026-05-05

> 来源：`docs/optimization-roadmap.md`
> 范围：按当前代码库状态复核 2026-04-04 优化路线图，确认哪些事项仍需要处理。

## 结论

`optimization-roadmap.md` 的方向仍然基本合理，但其中部分内容已经被后续架构改造部分覆盖，需要按当前代码重新定义优先级。

当前仍建议继续处理的重点是：

1. Bridge 本地文件状态仍然过多，尤其是 task、group、chat transcript。
2. group relay 仍缺少总时长上限。
3. 模型路由结果仍没有写入 billing audit，无法做路由质量分析。
4. Bridge task 仍缺少重试、超时策略、失败通知和运行日志治理。
5. Telegram webhook 目前只完成绑定识别，没有真正进入统一聊天流。
6. Bridge `/chat/send` 仍没有 rate limit。

## 需要处理的事项

### P0 - Bridge 本地文件状态仍需迁移或治理

原条目：#1 Bridge 文件存储的单点风险

当前状态：

- `bridge/src/services/task.ts` 仍使用本地 `jobs.json` 保存任务。
- `bridge/src/services/task.ts` 仍使用 `myclawgo-task-runs.jsonl` 保存任务运行记录。
- `bridge/src/services/group.ts` 仍以 `/home/openclaw/.openclaw/myclawgo-groups.json` 为 group source of truth。
- `bridge/src/services/chat-store.ts` 仍写本地 Markdown transcript。
- `group.ts` 已通过 `syncToPg({ type: 'group_upsert' })` 同步 group 到 PG，但这更像备份 / 镜像，不是主存储。
- `/api/internal/bridge-sync` 支持 `chat_message` 类型，但当前 `appendChatTranscript()` 没有调用 `syncToPg()`，聊天 transcript 仍主要留在 Bridge 本地文件。

风险：

- VPS 磁盘损坏、容器重建、Bridge 多实例、文件写入竞争都会导致状态丢失或不一致。
- `myclawgo-task-runs.jsonl` 没有轮转，长期运行会持续增长。

建议处理：

1. 将 group 的 source of truth 切到 PG，Bridge 本地 JSON 只作为 cache。
2. 将 task 定义和 task run history 迁移到 PG，或至少增加 JSONL 按天轮转和最大保留期。
3. 让 `appendChatTranscript()` 同步写入 `userChatMessage`，或直接改为 Bridge 调 App API 持久化后再返回。
4. 对现有文件写入补齐 tmp + rename / append 日志轮转策略。

### P0 - Group Relay 缺少总时长上限

原条目：#2 群组 Relay 循环缺少超时保护

当前状态：

- `bridge/src/routes/chat.ts` 的 `runGroupAutoRelay()` 有 `maxTurns`。
- 单轮 `sendChatMessage()` 有 `timeoutMs: Math.min(Math.max(timeoutMs, 15000), 45000)`。
- 没有 relay chain 级别的总 deadline。
- 最坏情况下 `maxTurns=20`，每轮 45 秒，再加 cooldown，单次 relay 仍可能占用很久。

建议处理：

```ts
const RELAY_DEADLINE_MS = 5 * 60 * 1000;
const deadlineAt = Date.now() + RELAY_DEADLINE_MS;

// 每轮开始前检查
if (Date.now() >= deadlineAt) break;

// 每轮 timeout 使用剩余时间裁剪
const remainingMs = deadlineAt - Date.now();
```

同时建议把 relay 超时原因写入日志和 transcript meta，方便后续排查。

### P1 - 模型路由结果仍未写入审计表

原条目：#3 模型路由缺乏反馈回路

当前状态：

- `src/lib/myclawgo/model-router.ts` 仍是规则路由。
- `src/lib/myclawgo/user-chat.ts` 中 `runDirectChatTask()` 会调用 `resolveChatModelSelection()`。
- 当前只在 `console.info()` 中输出 `level`、`model`、`reason`。
- `settleDirectChatBilling()` 写入 `userChatBillingAudit.metaJson` 时只有 `taskId` 和 `bridgeRaw`，没有 `routingLevel`、`routingReason`、`routingMode`、`resolvedModel` 等字段。

影响：

- 无法统计 L1 / L2 / L3 分布。
- 无法评估 `short_chinese`、`default`、`code` 等 reason 的成本与质量。
- 后续无法可靠判断是否需要 LLM 辅助分类器。

建议处理：

1. 扩展 `settleDirectChatBilling()` 参数，传入 routing decision。
2. 在 `userChatBillingAudit.metaJson` 写入：
   - `routingMode`
   - `routingLevel`
   - `routingReason`
   - `routerEnabled`
   - `resolvedModel`
   - `userModelOverride`
3. 后续再做管理端统计，不建议先做复杂 UI。

### P1 - Bridge Task 缺少重试、超时治理和失败通知

原条目：#4 任务调度缺少失败重试与状态通知

当前状态：

- `bridge/src/services/task.ts` 的 `AgentTaskItem` 仍没有 `retryCount`、`maxRetries`、`lastError`。
- `runAgentTask()` 失败后只写一条 JSONL run log，然后抛出错误。
- 没有 backoff retry。
- 没有用户通知。
- Office UI 已经会读取最近 task runs，这部分比旧文档有所进展，但只是展示，不是可靠性治理。

建议处理：

1. 给 task schema 增加：
   - `retryCount`
   - `maxRetries`
   - `lastError`
   - `lastRunAtMs`
   - `nextRetryAtMs`
2. 对失败任务做指数退避重试。
3. 对最终失败任务通过 Telegram / Email 通知用户。
4. 将 run log 从无限 JSONL 迁移到 PG 或按天轮转。

### P1 - Telegram Bot 仍未进入统一聊天流

原条目：#6 Telegram Bot 与主聊天流割裂

当前状态：

- `src/app/api/webhooks/telegram/[userId]/[agentId]/route.ts` 会校验 webhook secret。
- webhook 当前会调用 `upsertTelegramChannelBinding()` 记录外部 chat 绑定。
- 但 webhook 返回的 `next` 仍是 `'telegram-message-routing'`。
- 没有把 Telegram 入站消息写入 `userChatMessage`。
- 没有调用 Bridge / OpenClaw 生成回复。
- Web UI 中也没有真正统一展示 Telegram 对话。

建议处理：

1. Telegram 入站消息写入 `userChatMessage`，`channel='telegram'`。
2. 调用同一套 chat task / Bridge 路径生成回复。
3. 回复写回 Telegram。
4. Web UI 支持按 `channel` 筛选历史。
5. 后续再扩展 Telegram group relay。

### P1 - Bridge `/chat/send` 缺少请求限流

原条目：#9 Bridge 没有请求限流

当前状态：

- `bridge/src/app.ts` 只有 `BRIDGE_TOKEN` 鉴权。
- `bridge/package.json` 没有 `@fastify/rate-limit`。
- `/chat/send` 没有 per-agent / per-group 限流。

风险：

- App 侧 bug、重试风暴或恶意客户端都可能快速消耗 OpenRouter quota。
- group relay 会放大请求量，需要单独限制。

建议处理：

1. 引入 `@fastify/rate-limit`。
2. 对 `/chat/send` 按 `agentId`、`groupId`、`chatScope` 设置 key。
3. group relay 使用更严格限额。
4. 429 响应要能被 App 侧识别，并提示用户稍后重试。

### P2 - 积分低余额预警和自动充值仍未完成

原条目：#5 积分系统缺少预警与自动充值

当前状态：

- 余额不足时会返回错误。
- bot 页面存在局部 low credits UI。
- 没有全局低余额邮件提醒。
- 没有自动充值设置。
- Dashboard / Chat 全局顶部没有统一低余额横幅。

建议处理：

1. 先做低余额提醒，不先做自动充值。
2. 增加用户级阈值配置，例如低于 5 美元等值 credits 时提醒。
3. 在 Chat / Office / Settings 中统一展示低余额提示。
4. 自动充值涉及支付授权和误扣风险，应单独设计。

### P2 - Group 公告仍没有版本历史

原条目：#8 群组公告没有版本历史

当前状态：

- `bridge/src/services/group.ts` 仍只有 `announcement?: string`。
- 修改公告时直接覆盖。
- `userGroup` 表也没有公告历史字段。

建议处理：

1. 在 PG 中增加 group announcement history 表，或在 `userGroup` 增加 JSONB 历史字段。
2. 至少保留最近 10 条。
3. UI 支持预览和恢复历史公告。

### P2 - 聊天记录导出功能仍缺失

原条目：#10 聊天记录导出功能缺失

当前状态：

- `userChatMessage` 已有结构化历史。
- Bridge 本地 transcript 也有历史，但不是统一 source of truth。
- 没有看到导出 API 或 UI。

建议处理：

1. 新增 `/api/chat/export`。
2. 支持 JSON / Markdown。
3. 支持按 agent、group、channel、时间范围筛选。
4. 优先从 `userChatMessage` 导出；Bridge transcript 迁移完成前需注明覆盖范围。

### P3 - LLM 辅助分类器仍不应立即做

原条目：#11 模型路由引入轻量 LLM 分类器

当前状态：

- 规则路由仍然存在。
- 路由审计数据尚未完整落库。

判断：

- 该项仍然合理，但不应现在做。
- 先完成“模型路由结果写入审计表”，积累数据后再判断是否需要 LLM 分类器。

建议处理：

1. 先完成 P1 的 routing audit。
2. 统计 `reason='default'`、高成本误路由、低质量低配模型路由。
3. 只在规则不确定时调用轻量分类器。

### P3 - Bridge 微服务化 / 多实例状态治理仍是长期项

原条目：#12 Bridge 从进程内服务演进为独立微服务

当前状态：

- Bridge 已是独立 package，并可作为 `node dist/server.js` 服务运行。
- 但状态仍然大量依赖本地文件和进程内 Map：
  - `groupRelayControl` 是进程内 Map。
  - task / group / chat transcript 仍在本地文件。
  - 多实例下仍会有状态竞争。

建议处理：

1. 先完成 P0 的持久化治理。
2. relay control 这类短期状态后续迁到 Redis。
3. 再考虑 Bridge 多实例部署和水平扩容。

## 可暂缓或已部分覆盖的事项

### 中英混合路由修正

原条目：#7 模型路由 L2 中文判断过于宽泛

当前状态：

- `model-router.ts` 已经在 `isMostlyChinese()` 默认分支前检查 `CODE_KEYWORDS` 和代码块。
- 中文 + 代码关键词 / 代码块通常会进入 `reason='code'`。

仍建议补充：

- 为中文 + 代码块、中文 + 报错、英文技术问题混中文说明增加单元测试。
- 该项当前不是主要风险，可放在 routing audit 之后处理。

## 建议执行顺序

第一批：

1. Bridge `/chat/send` 限流。
2. group relay 总时长上限。
3. routing decision 写入 `userChatBillingAudit.metaJson`。
4. task run JSONL 轮转或迁移到 PG。

第二批：

1. Telegram webhook 接入统一聊天流。
2. group / chat transcript source of truth 迁移到 PG。
3. task retry / notification。
4. 聊天记录导出。

第三批：

1. 低余额提醒。
2. 公告历史。
3. LLM 辅助分类器。
4. Bridge 多实例状态治理。
