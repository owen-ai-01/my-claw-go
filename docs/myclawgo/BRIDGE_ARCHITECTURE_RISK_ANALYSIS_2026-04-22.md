# Bridge 架构对用户体验的完整风险分析

> 版本：2026-04-22  
> 基于：真实代码分析（`bridge/src/services/openclaw.ts`、`bridge/src/routes/chat.ts`）  
> 结论：架构本身没有根本性问题，MyClaw.ai 用同样方案跑着付费用户。主要风险是实现细节，可修复，不需要改架构。

---

## 一、当前 Bridge 架构的真实工作方式

先搞清楚代码里实际在做什么，避免基于假设分析。

### 完整消息链路（基于 `openclaw.ts`）

```
用户点击发送
    ↓
Next.js POST /api/chat/send
    ↓
bridge POST /chat/{agentId}
    ↓ bridge 内部：
    1. openGatewaySession()    ← 建立 WebSocket 连接到 ws://127.0.0.1:18789
    2. sessions.patch(model)   ← 注入模型覆盖（可选，失败不影响）
    3. chat.send(message)      ← 发送消息，拿到 runId
    4. agent.wait(runId)       ← 阻塞等待 OpenClaw 完成推理（最长 90 秒）
    5. chat.history()          ← 拉取最近 30 条对话获取回复
    6. ws.close()              ← 关闭 WebSocket
    ↓
bridge 返回完整回复给 Next.js
    ↓
Next.js 返回给浏览器
```

**关键特征：**
- 每条消息开一个新 WebSocket 连接，用完即关（不是长连接）
- `agent.wait` 是阻塞调用，等 OpenClaw 完整推理完成后才返回
- 默认超时 90 秒（`timeoutMs = 90000`）
- 返回的是**完整回复**，不是逐 token 流式

---

## 二、风险逐项分析

### 风险 1：无流式输出（最影响用户体验）

**现象**：用户发消息后，界面显示 loading，直到 OpenClaw **完整**生成回复后才一次性呈现文字。  
等待时间取决于模型和 prompt 复杂度：
- 简单问候：1–3 秒
- 普通问答：5–15 秒
- 长文档/复杂代码：15–60 秒

**根因**：`agent.wait` 是同步阻塞，`chat.history` 拉取的是完整历史，不是流。

**严重程度**：⚠️ 中高。用户不会"用不了"，但体验明显差于 ChatGPT 类产品的逐字显示效果。

**是否影响架构**：**不影响**。这是实现层面问题，不是架构问题。

**修复方案（不改架构）**：  
OpenClaw Gateway 有 `chat.stream` 或 SSE 事件机制，可以：
1. bridge 改为监听 Gateway 的 `agent.progress` 事件，每收到一个 token 就通过 HTTP SSE 推给 Next.js
2. Next.js 把 SSE 转发给浏览器（App Router 原生支持 `ReadableStream` response）
3. 前端用 `EventSource` 接收并逐字渲染

**这个改造在现有架构下完全可以做，不需要改任何基础设施。**

---

### 风险 2：90 秒超时

**现象**：复杂任务（生成长文档、多步代码、研究报告）如果超过 90 秒，用户收到错误。

**根因**：`timeoutMs = 90000` 是 `sendChatMessage` 的默认值，`agent.wait` 和 `chat.send` 都用这个值。

**严重程度**：⚠️ 中。影响重度使用场景，普通聊天不受影响。

**修复方案**：
1. 短期：把默认 timeout 提高到 180 秒（改一个常量，5 分钟内搞定）
2. 中期：前端任务轮询模式——`chat.send` 立即返回 `runId`，前端每 2 秒轮询 `agent.wait`，避免 HTTP 长连接超时（Next.js/Vercel 默认有 60 秒 function timeout）
3. 长期：实现后台任务队列（`runtimeProvisionJob` 类似的 task 表），用户离开页面后任务继续跑

---

### 风险 3：Bridge 进程崩溃无自动恢复

**现象**：`keep-gateway.sh` 已经保证 OpenClaw gateway 崩溃后自动重启。但 Bridge 进程（Fastify server）崩溃后没有等效的守护程序，用户请求会直接报错。

**根因**：查看 docker-manager.ts 里的容器启动逻辑，bridge 是通过 `docker exec` 启动的，没有 loop 重启机制。

**严重程度**：⚠️ 中。Bridge 因 Node.js 异常崩溃的概率不高，但一旦崩溃，用户需要等待容器重启或管理员介入。

**修复方案（不改架构）**：  
类比 `keep-gateway.sh`，写一个 `keep-bridge.sh`：
```bash
#!/bin/bash
while true; do
  node /opt/myclawgo-bridge/dist/server.js
  echo "[keep-bridge] Bridge exited, restarting in 2s..."
  sleep 2
done
```
在 `ensureGatewayForContainer` 的同级位置调用 `ensureBridgeForContainer`，用 `docker exec -d` 后台启动。

---

### 风险 4：冷启动延迟（容器空闲后首次请求）

**现象**：用户的容器如果停止了（手动停止或自动停机），重新访问 `/chat` 时：
1. `ensureUserContainer` 启动容器：~3–10 秒
2. OpenClaw gateway 热身（keep-gateway.sh 启动后等就绪）：~5–30 秒
3. Bridge 启动：~2–5 秒

总计首次请求可能等待 **10–45 秒**。

**严重程度**：⚠️ 中。用户偶发感知，已有 runtime-status 轮询页面缓解。

**当前已有缓解措施**：`runtime-status/route.ts` 已实现轮询检查 → 前台可显示"工作区启动中"进度。

**进一步修复方案**：
- 付费用户的容器不自动停止（保持运行，只停止 gateway 以节省 CPU）
- 用户登录后立即触发 warmup，让容器在用户进入聊天页前已就绪

---

### 风险 5：并发消息处理

**现象**：同一用户在第一条消息还没有回复的情况下发第二条消息。

**根因**：OpenClaw 每个 session key（`agent:{agentId}:main`）同一时刻只能跑一个 run。  
如果两个请求同时 `chat.send` 到同一个 session key，Gateway 会处理（可能队列或返回错误）。

**严重程度**：🟢 低。正常用户不会在等待回复时再发消息。UI 层可以禁用"发送"按钮来彻底避免。

**修复方案**：前端在等待回复期间禁用发送按钮（UI 层控制，不需要改架构）。

---

### 风险 6：Group Relay 中途 Bridge 重启

**现象**：`groupRelayControl` 是 bridge 进程内的 in-memory Map。如果 relay 进行到第 3 轮时 bridge 崩溃重启，relay 状态丢失，用户需要重新触发。

**严重程度**：🟢 低。relay 是辅助功能，丢失一次对话可重试，数据不会丢（transcript 已持久化到文件）。

**修复方案**：relay 状态持久化到 `runtimeAllocation` 表或容器内 JSON 文件（后期优化，不紧急）。

---

### 风险 7：文件传递给 OpenClaw

**现象**：用户希望上传文件（代码、文档、图片）让 OpenClaw agent 分析。目前 bridge 只接受文本消息，没有文件传递机制。

**严重程度**：🟡 中期问题。初期用户靠复制粘贴内容；当用户量增长后会有明确诉求。

**修复方案（不改架构）**：
1. 用户上传文件到 R2 存储
2. Next.js 把 R2 文件 URL 作为消息的一部分传给 bridge
3. Bridge 在容器内下载文件到临时目录，把文件路径注入消息上下文
4. OpenClaw 直接读取文件（容器内有文件访问能力）

这个流程完全在现有架构内可实现。

---

### 风险 8：WebSocket 代理未实现

**现象**：`/api/chat/gateway-proxy` 当前返回 426（代码注释写的 "Step 3 will wire the actual WebSocket upgrade"，尚未实现）。

**影响范围**：如果有功能依赖浏览器直连 OpenClaw Gateway WebSocket，目前无法用。

**当前是否影响用户**：**不影响**。现有所有聊天功能走的是 HTTP（bridge → Next.js → 浏览器），不经过这个接口。

**严重程度**：🟢 低（当前不影响任何功能）。

**何时需要实现**：如果要支持流式 token 推送给浏览器（方案二），可以用 SSE 替代，完全不需要 WS proxy。

---

### 风险 9：多标签页同时使用

**现象**：同一用户打开两个浏览器 Tab 都在聊天，两个 Tab 会竞争同一个 session key 的 OpenClaw session。

**严重程度**：🟢 低。同一用户多 Tab 本身就是边缘场景，OpenClaw 会顺序处理（不会数据损坏），用户最多感知到响应稍慢。

---

## 三、总结与优先级

### 风险汇总表

| 风险 | 严重程度 | 用户是否用不了 | 改架构？ | 修复优先级 |
|------|---------|-------------|---------|----------|
| 无流式输出 | 中高 | 否，体验差 | 否 | P1（上线前或上线初期） |
| 90 秒超时 | 中 | 部分场景是 | 否 | P1（先改常量，中期任务化） |
| Bridge 无守护 | 中 | 崩溃时是 | 否 | P1（加 keep-bridge.sh） |
| 冷启动延迟 | 中 | 否，等待长 | 否 | P2（UI 优化缓解） |
| 并发消息 | 低 | 否 | 否 | P3（UI 禁用按钮） |
| Relay 状态丢失 | 低 | 否，重试即可 | 否 | P3 |
| 文件传递 | 中期 | 否，初期可绕过 | 否 | P2 |
| WS 代理未实现 | 低 | 否（当前不用） | 否 | P3 |
| 多标签页 | 低 | 否 | 否 | P3 |

### 结论

**Bridge 架构本身没有根本性缺陷**，所有风险都是实现层面的问题，修复都不需要改架构。

MyClaw.ai 用完全相同的方案在生产环境跑着付费用户，因此这条路是经过验证的。

**现在需要在开发阶段解决的（P1）：**
1. 加 `keep-bridge.sh`：bridge 崩溃自动重启（防止用户完全用不了）
2. 超时改为 180 秒：减少复杂任务失败（改一个常量）
3. UI 发送按钮：等待回复时禁用（防止用户误操作）

**上线后根据用户反馈迭代的（P2/P3）：**
4. SSE 流式输出：提升用户体验（不改架构，bridge 层改造）
5. 文件上传支持
6. 后台任务队列（超长任务）

---

## 四、与原生 OpenClaw CLI 的功能对比

这里明确哪些 OpenClaw 功能通过 bridge 完全可用，哪些有限制：

| 功能 | Bridge 支持情况 | 备注 |
|------|--------------|------|
| 文字对话（单 agent） | ✅ 完全支持 | 核心功能 |
| 多 agent 群组 | ✅ 完全支持 | bridge 自实现了 relay 调度 |
| Agent 记忆（跨对话） | ✅ 完全支持 | 存储在 OpenClaw session 内，持久化 |
| Agent 工具使用（读文件/执行命令） | ✅ 完全支持 | OpenClaw 在容器内执行，bridge 不干预 |
| 模型切换（L1/L2/L3 路由） | ✅ 完全支持 | `sessions.patch` 动态注入 |
| Telegram Bot 集成 | ✅ 完全支持 | 独立 Telegram 服务，不经 bridge |
| 流式输出（逐 token） | ⚠️ 待实现 | 当前等全量返回 |
| 文件上传 | ⚠️ 待实现 | 架构支持，代码未写 |
| OpenClaw 原生 Web UI | ❌ 不支持 | 有意不支持，用自己的 UI |
| OpenClaw CLI 命令 | ❌ 不支持 | 用户无需感知 |

---

## 五、关于"后续不好改架构"的判断

以下这些是**架构级决策**，现在定了后期很难改，需要确认：

| 决策 | 当前选择 | 是否正确 | 说明 |
|------|---------|---------|------|
| 每用户一个容器 | ✅ | ✅ | 隔离好，可扩展，不可逆但正确 |
| Bridge 在容器内 | ✅ | ✅ | 和 OpenClaw gateway 同机通信延迟极低 |
| Bridge 是独立 Fastify 进程 | ✅ | ✅ | 和 Next.js 解耦，可独立部署 |
| HTTP 从 Next.js 请求 Bridge | ✅ | ✅ | 跨机时走私网，延迟可接受（<5ms） |
| 每条消息新建 WS 连接 | ⚠️ | 可改进 | 长连接复用性能更好，但不是阻塞性问题 |
| `agent.wait` 同步阻塞 | ⚠️ | 可改进 | 改为异步任务轮询后更健壮，但不紧急 |

**真正需要担心的架构风险：无。**  
所有"可改进"项都在现有架构框架内可以渐进优化，不需要推倒重来。
