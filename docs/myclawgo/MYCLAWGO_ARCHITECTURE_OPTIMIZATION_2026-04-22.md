# MyClawGo 架构优化建议报告

> 版本：2026-04-22  
> 依据：竞品深度架构分析 + 现有 MyClawGo 代码审查  
> 结论：MyClawGo 当前架构在同类产品中已处于中上水平，核心方向正确。本报告指出具体可优化点，按优先级排列。

---

## 一、MyClawGo 当前架构对标竞品的位置

| 维度 | MyClawGo（当前） | StartClaw | MyClaw | SimpleClaw | UniClaw | Every Plus One |
|------|----------------|-----------|--------|------------|---------|----------------|
| 计算隔离 | 每用户独立容器 ✅ | 独立 VM | 独立 VPS | 共享容器 | 专属云机 | 专属服务器 |
| 多 agent 群组 | ✅（relay 调度）| ❌ | ❌ | ❌ | ❌ | ✅ |
| 计费审计 | ✅（逐消息）| 额度制 | BYOK | BYOK | OpenRouter | 不透明 |
| 流式输出 | ⚠️ 未实现 | ✅ Live Desktop | ❌ | ❌ | ❌ | ❌ |
| 应用发布 | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Web 终端 | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 自动扩容 | ⚠️ 规划中 | 未知 | 手动 | 手动 | 未知 | 未知 |
| 中文市场集成 | ❌ | ❌ | ❌ | ❌ | ✅（Feishu等）| ❌ |
| 价格透明 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| 免费套餐 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

**MyClawGo 的真正差异化优势（其他竞品都没有的组合）：**
1. **多 agent 群组 + relay 调度**：竞品中只有 Every Plus One 有类似功能，但不开放配置
2. **逐消息计费审计**：透明的 token 级别成本追踪，竞品无一做到这种粒度
3. **OpenRouter 按套餐分配子 key**：自动限额，防止用户超支，竞品无此设计

---

## 二、优化建议（按优先级排列）

---

### 优先级 P0：用户直接感知，影响留存

#### P0-1：实现流式输出（SSE）

**问题**：当前 `openclaw.ts` 里 `agent.wait` 是同步阻塞，用户看到 loading 直到全量回复返回。复杂任务等待 15–60 秒体验极差。

**竞品对比**：StartClaw 有 Live Desktop 流式查看，是其核心卖点之一。其他竞品都没做，这是一个可以超越大多数竞品的机会。

**实现方案（不改架构）**：
```
OpenClaw Gateway 有 agent.progress 事件 →
Bridge 监听并转发 →
Bridge 改为 SSE 响应（Content-Type: text/event-stream）→
Next.js App Router 原生支持 ReadableStream →
前端用 EventSource 或 fetch stream 接收，逐字渲染
```

**改动范围**：
- `bridge/src/routes/chat.ts`：新增 `/chat/:agentId/stream` SSE 路由
- `bridge/src/services/openclaw.ts`：新增 `streamChatViaGateway()` 函数监听 progress 事件
- `src/app/api/chat/stream/route.ts`：新增 Next.js SSE 转发路由
- 前端 chat 组件：改为流式接收渲染

**不需要改**：DB schema、docker-manager、session-store、任何基础设施

---

#### P0-2：Bridge 进程守护（keep-bridge.sh）

**问题**：`keep-gateway.sh` 已保证 OpenClaw Gateway 崩溃自动重启，但 Bridge 进程（Fastify server）崩溃后没有守护，用户请求会直接 502。

**当前风险**：Bridge 是 Node.js 进程，内存泄漏或未捕获异常都会导致崩溃。

**实现方案**：
```bash
# keep-bridge.sh（类比 keep-gateway.sh）
#!/bin/bash
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
while true; do
  node /opt/myclawgo-bridge/dist/server.js \
    >> /home/openclaw/.openclaw/bridge.log 2>&1
  echo "[keep-bridge] Bridge exited, restarting in 2s..."
  sleep 2
done
```

**改动范围**：
- `docker-manager.ts`：在 `ensureGatewayForContainer` 同级新增 `ensureBridgeForContainer()`
- 注入 keep-bridge.sh 到容器并用 `docker exec -d --user openclaw` 后台启动

---

#### P0-3：超时从 90 秒提升到 180 秒

**问题**：`sendChatMessage` 默认 `timeoutMs = 90000`，复杂任务会超时失败。

**影响竞品比较**：UniClaw 无明确超时限制（背后是 OpenRouter 的请求超时）；MyClaw 是 SSH 直连，无超时。

**实现**：`bridge/src/services/openclaw.ts` 中修改默认值：
```typescript
timeoutMs = 180000,  // 180 秒
```

**改动范围**：1 行代码，5 分钟内完成。

---

### 优先级 P1：功能差距，影响转化

#### P1-1：免费套餐或试用额度

**问题**：MyClawGo 目前没有免费套餐。StartClaw 提供 Free（300 credits/月），降低了用户入场门槛。

**竞品数据**：StartClaw 的免费套餐是其最大获客优势（零风险试用）。MyClaw、UniClaw 均无免费套餐，导致注册→付费转化漏斗更长。

**方案选择**：
- **方案 A（推荐）**：注册后提供 7 天免费试用（有信用卡担保），转化率高于无限期免费套餐
- **方案 B**：永久免费套餐（有限额度，如 100 credits/月，1 个 agent，不创建容器，共享计算）
- **方案 C**：Demo 模式（前 10 条消息免费，不需要注册容器）

**改动范围**：定价配置 + 计费逻辑，不涉及架构改动

---

#### P1-2：应用发布功能（参考 UniClaw 的 *.clawrun.app）

**问题**：UniClaw 的 `*.clawrun.app` 子域名发布是其最独特的功能，让用户的 agent 可以对外提供 Web 界面，是真正的技术护城河。

**MyClawGo 机会**：实现 `*.app.myclawgo.com` 子域名发布，让用户的 bridge 对外可访问。

**实现方案**（Phase 2/3 配合多机架构后实现）：
```
DNS 泛解析：*.app.myclawgo.com → Runtime Host 公网 IP
Runtime Host 上 Caddy 动态路由：
  {sessionId}.app.myclawgo.com → localhost:{containerPort}
Bridge 增加公开 API 路由（可配置哪些接口对外暴露）
```

**改动范围**：Caddy 配置 + Host Agent 注册路由 API，DNS 配置，不影响现有架构

---

#### P1-3：40+ 预装技能（参考 UniClaw）

**问题**：UniClaw "40+ pre-installed skills" 是其最大卖点之一。MyClawGo 当前用户需要自己配置 agent，上手门槛高。

**方案**：提供预置 agent 模板库：
- 研究助手（网络搜索 + 摘要）
- 代码审查专家
- 邮件助理
- 数据分析师
- 中文内容创作
- Telegram 客服机器人
- ...

在用户创建第一个 agent 时提供"从模板开始"选项。

**改动范围**：前端 UI + `userAgent` 表新增 `templateId` 字段，bridge 侧无需改动

---

#### P1-4：Web 终端 / 文件浏览器（参考 UniClaw）

**问题**：UniClaw 在浏览器内提供终端 + 文件浏览器，用户无需 SSH。这是面向技术用户的重要功能。

**方案**：
- 在 bridge 新增 `/terminal/exec` 端点（容器内执行命令）
- 在 bridge 新增 `/files` 端点（列出/读取/写入容器内文件）
- 前端集成 xterm.js（WebSocket 终端）

**注意**：需要严格的权限控制，防止越权访问其他用户容器。每个用户只能访问自己的 bridge。

---

### 优先级 P2：竞争差异化，影响市场定位

#### P2-1：中文平台集成（参考 UniClaw 覆盖中国市场）

**问题**：UniClaw 是唯一覆盖 Feishu、Lark、DingTalk、WeCom 的产品，直接面向中国企业市场。MyClawGo 的 `userChannelBinding` 表已有扩展能力。

**机会**：作为中国背景的团队，这是 MyClawGo 对 UniClaw 的天然优势。当前已有 Telegram 集成，可以优先接入飞书/企业微信。

**改动范围**：bridge 新增 channel handler，`userChannelBinding` 表新增 channel 类型，不改核心架构

---

#### P2-2：OpenClaw Arena 类基准测试页面（参考 UniClaw 的 SEO 策略）

**问题**：UniClaw 的 OpenClaw Arena 是其最强 SEO 武器——用户来测试模型，顺带发现 UniClaw。MyClawGo 有 L1/L2/L3 模型路由器，可以转化为公开的模型对比工具。

**方案**：
- 公开页面 `/arena`：让访客免费测试同一个 prompt 在不同模型（Claude/Gemini/DeepSeek）的回复差异
- 不需要注册，直接测试
- 结果可分享（SEO + 社交传播）
- 转化路径：测试完后弹出"想让你的 agent 全天候运行这些模型？"→ 注册

---

#### P2-3：多 agent 群组的可视化配置 UI

**问题**：MyClawGo 有 relay 调度是独有优势，但现有 UI 对用户不够直观。竞品（包括 Every Plus One）都做不到可配置的多 agent 工作流。

**方案**：
- 可视化的群组拓扑图（节点 = agent，连线 = relay 规则）
- 拖拽配置 leader → member 的 handoff 条件
- 预设工作流模板（研究 → 写作 → 校对 → 发布）

这个功能是 MyClawGo 的护城河，值得重点投入。

---

#### P2-4：逐消息成本透明 UI

**问题**：MyClawGo 已有 `userChatBillingAudit` 表做到逐消息成本追踪，但这个数据目前对用户不可见。这是竞品都做不到的透明度。

**方案**：
- 每条消息旁显示实际消耗的 token 和费用（如"🔢 1,234 tokens · $0.003"）
- 用户账单页：按天/周/月的成本图表 + 按 agent 的分类
- 免费/试用用户看到成本，付费用户觉得"值"

这个功能可以作为营销素材："只有 MyClawGo 让你知道每条消息花了多少钱"。

---

### 优先级 P3：长期护城河

#### P3-1：SOC 2 合规路径

StartClaw 声称 SOC 2 合规（未经核实），但这个方向对企业客户有吸引力。现有架构（每用户独立容器 + 加密存储 + 审计日志）已具备合规基础。

#### P3-2：API 开放平台

允许第三方开发者通过 API 调用用户的 agent，MyClawGo 作为 agent hosting layer。参考 Every Plus One 的 Google Workspace/Notion 连接方式。

#### P3-3：企业多账户管理

一个企业账号下管理多个员工的 agent，集中账单，类似 Every Plus One 的团队定位。

---

## 三、架构层面无需调整的结论

经过与 5 个竞品的深度对比，MyClawGo 的以下架构决策是**正确的，不需要改变**：

| 架构决策 | 当前状态 | 与竞品比较 | 结论 |
|---------|---------|-----------|------|
| 每用户独立 Docker 容器 | ✅ 实现 | UniClaw/Every 同样独立，StartClaw VM | ✅ 保持 |
| Bridge 在容器内（非容器外）| ✅ 实现 | 竞品无此细节，bridge 在容器内延迟最低 | ✅ 保持 |
| OpenRouter 子 key 按套餐限额 | ✅ 实现 | 竞品无此设计 | ✅ 保持，作为差异化卖点 |
| 逐消息 billingAudit | ✅ 实现 | 竞品无此粒度 | ✅ 保持，对外展示透明度 |
| L1/L2/L3 模型路由器 | ✅ 实现 | UniClaw 用 OpenRouter（用户手选），没有自动路由 | ✅ 保持，可作为卖点 |
| Drizzle + PostgreSQL | ✅ 实现 | 行业标准 | ✅ 保持 |
| Control Plane + Runtime Host 分离 | ⚠️ 规划中 | UniClaw 疑似同样架构 | ✅ 方向正确，执行 |
| 多 agent 群组 + relay | ✅ 实现 | 竞品唯一差异化 | ✅ 重点投入 UI |

---

## 四、实施路线图

### 近期（Phase 1 开发同步进行，1–2 周）

1. ✅ P0-3：超时改 180 秒（1 行代码）
2. ✅ P0-2：keep-bridge.sh（加入 docker-manager.ts）
3. ✅ P0-1：SSE 流式输出（bridge 改造）
4. ✅ P1-3：agent 模板库（前端 + 少量 DB）

### 中期（Phase 2 多机完成后，1 个月）

5. P1-2：子域名应用发布（*.app.myclawgo.com）
6. P2-4：逐消息成本对外展示 UI
7. P1-1：免费试用套餐
8. P2-1：飞书/企业微信集成

### 长期（Phase 3 完成后）

9. P2-3：多 agent 可视化配置
10. P2-2：模型 Arena 对比页面（SEO 飞轮）
11. P1-4：Web 终端 / 文件浏览器
12. P3-x：SOC 2 / API 平台 / 企业多账号

---

## 五、一句话总结

> MyClawGo 的架构在竞品中已属中上，核心差异化（多 agent 群组 + 逐消息计费 + OpenRouter 子 key 限额）是没有竞品复制的组合。**最需要补的是流式输出（P0 优先级）和更低的入门门槛（免费试用或模板库）。架构本身不需要推倒重来。**
