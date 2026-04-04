# OpenClaw 优化路线图

> 基于当前代码库状态（2026-04-04）的分析，按优先级排序。

---

## P0 — 稳定性风险（应立即处理）

### 1. Bridge 文件存储的单点风险

**现状：** `bridge/src/services/task.ts` 和 `group.ts` 使用本地 JSON 文件（`jobs.json`、`myclawgo-groups.json`）作为持久化存储。`chat-store.ts` 也写本地文件。

**风险：** 磁盘故障、重启、多实例部署会导致数据丢失或状态不一致。Task JSONL 运行记录无限增长，无清理机制。

**建议：**
- 将 `AgentTaskItem` 和 Group 数据迁移到 Postgres（已有 Drizzle，成本低）
- 为 `myclawgo-task-runs.jsonl` 增加轮转或按天归档
- `chat-store.ts` 的本地聊天记录加定期备份或直接写 DB

---

### 2. 群组 Relay 循环缺少超时保护

**现状：** `bridge/src/routes/chat.ts` 的 relay 循环靠 `maxTurns` 计数 + `groupRelayControl` Map 防止无限循环。但没有**总时长上限**。

**风险：** 若某个 agent 响应卡住（网关超时未正确传播），relay 会长时间占用服务器资源。

**建议：**
```ts
// chat.ts relay loop — 加总超时
const RELAY_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟
const relayDeadline = Date.now() + RELAY_TIMEOUT_MS;
// 每轮检查: if (Date.now() > relayDeadline) break;
```

---

## P1 — 功能完整性（近期迭代）

### 3. 模型路由缺乏反馈回路

**现状：** `src/lib/myclawgo/model-router.ts` 是纯规则分类器，`userChatBillingAudit` 记录了每条消息的 `source`/token 数，但路由决策（L1/L2/L3、`reason` 字段）**没有写入审计表**。

**问题：** 无法统计路由准确率，无法知道有多少"short_chinese"消息被高估/低估，无法驱动规则改进。

**建议：**
- `userChatBillingAudit.metaJson` 中增加 `routingLevel`、`routingReason` 字段
- 管理后台 `/admin` 增加路由分布统计图表（现已有 admin 路由组）
- 中期：对比实际 token 消耗与预估等级，自动校正阈值

---

### 4. 任务调度缺少失败重试与状态通知

**现状：** `task.ts` 的 cron 任务执行后写 `RUNS_PATH`（JSONL），但没有：
- 失败后自动重试（backoff）
- 执行超时检测
- 用户可见的失败通知（邮件/Telegram）

**建议：**
- 为 `AgentTaskItem` 增加 `retryCount`、`maxRetries`、`lastError` 字段
- 执行失败时通过 `delivery` 字段中的 Telegram/邮件渠道通知用户
- 在 `/tasks` 页面展示最近运行历史和失败原因

---

### 5. 积分系统缺少预警与自动充值

**现状：** `src/credits/` 有余额检查，但用户余额耗尽时只会返回错误，没有提前预警。

**建议：**
- 余额低于阈值（如 $5）时触发邮件提醒（`src/mail/templates/` 已有模板体系）
- 设置"自动充值"选项：余额低于 X 时自动购买最小积分包
- 在 Dashboard 顶部增加余额低警告横幅

---

### 6. Telegram Bot 与主聊天流割裂

**现状：** `userAgentTelegramBot` 表存储绑定，`src/lib/myclawgo/telegram-routing.ts` 处理路由，但 Telegram 消息不走 `userChatMessage` 表，无法在 Web UI 查历史。

**建议：**
- Telegram 入站消息写入 `userChatMessage`（`channel: 'telegram'`）
- Web 聊天界面支持按渠道筛选，统一历史视图
- Telegram 群组消息支持 group relay（目前仅 Web）

---

## P2 — 体验优化（中期）

### 7. 模型路由 L2 中文判断过于宽泛

**现状：** `isMostlyChinese()` 用 30% 汉字比例作为阈值，会把包含少量中文的英文技术消息误路由到 DeepSeek-V3（`L2-zh`），而 DeepSeek-V3 对英文代码分析质量低于 Claude Haiku。

**建议：**
```ts
// 调整优先级：CODE_KEYWORDS 检查放在 isMostlyChinese 之前（目前已是，但需验证混合场景）
// 增加混合语言场景：中文 + 代码块 → 路由到 L2-code 而非 L2-zh
if (CODE_KEYWORDS.test(msg) && isMostlyChinese(msg)) {
  return { level: 'L2', path: 'bridge', model: getL2Model('code'), reason: 'chinese_code' };
}
```

---

### 8. 群组公告没有版本历史

**现状：** `group.ts` 中公告是单字段覆写，修改后无法恢复。

**建议：**
- 在 `myclawgo-groups.json` 或 DB 中增加 `announcementHistory: [{text, updatedAt}]` 数组（保留最近 10 条）
- 设置页面增加历史预览

---

### 9. Bridge 没有请求限流

**现状：** Bridge Fastify 服务器对 `/chat` 路由没有速率限制，仅靠 `BRIDGE_TOKEN` 认证。

**风险：** 恶意或错误的客户端可以发送大量消息耗尽 API quota。

**建议：**
- 使用 `@fastify/rate-limit` 对 `/chat` 按 `agentId` 限速（如 60 req/min）
- 对 group relay 单独设更严格的限制（避免循环放大）

---

### 10. 聊天记录导出功能缺失

**现状：** `userChatMessage` 表有完整历史，但 UI 没有导出入口。

**建议：**
- Settings 页面增加"导出聊天记录"（JSON / Markdown 格式）
- 支持按时间范围和 Agent 筛选导出

---

## P3 — 架构演进（长期）

### 11. 模型路由引入轻量 LLM 分类器

**现状：** 注释中已有 `// Optional LLM classifier using Gemini Flash ← future`。

**时机：** 当积累足够的 `routingReason` 审计数据（见 #3）后，可以：
- 用真实分类数据微调一个轻量分类器（或 few-shot prompt）
- 在规则分类器不确定（如 `reason: 'default'`）时调用 LLM 兜底
- 目标：减少 L3 过度路由造成的成本浪费

---

### 12. Bridge 从进程内服务演进为独立微服务

**现状：** Bridge 与 Next.js 共享部署，`RUNTIME_ISOLATION.md` 说明了隔离设计。

**长期方向：**
- Bridge 独立部署（Docker）、独立扩容
- Bridge 状态（agent session、relay state）迁移到 Redis
- 支持多实例水平扩展（目前 `groupRelayControl` Map 是进程内状态，多实例会有竞争）

---

## 快速参考：优先级矩阵

| 编号 | 方向 | 优先级 | 难度 | 影响 |
|------|------|--------|------|------|
| 1 | Bridge 文件存储 → DB | P0 | 中 | 稳定性 |
| 2 | Relay 总超时 | P0 | 低 | 稳定性 |
| 3 | 路由决策写审计表 | P1 | 低 | 可观测性 |
| 4 | 任务失败重试+通知 | P1 | 中 | 可靠性 |
| 5 | 积分预警+自动充值 | P1 | 中 | 留存 |
| 6 | Telegram 历史统一 | P1 | 高 | 体验 |
| 7 | 中英混合路由修正 | P2 | 低 | 成本 |
| 8 | 公告版本历史 | P2 | 低 | 体验 |
| 9 | Bridge 请求限流 | P2 | 低 | 安全 |
| 10 | 聊天记录导出 | P2 | 低 | 体验 |
| 11 | LLM 辅助分类器 | P3 | 高 | 成本优化 |
| 12 | Bridge 微服务化 | P3 | 很高 | 可扩展性 |
