# MyClawGo Bridge 架构可用性评估（2026-04-23）

## 1. 结论（先说结论）

**结论：当前架构可以支撑现有使用，但“用户不会受影响”这个判断不成立。**

在当前实现下，存在几类会直接导致用户“能进页面但无法聊天”的高风险场景，尤其在：
- 宿主机重启后
- 容器处于 stopped 但仍存在时
- bridge 进程异常退出后
- 群组 relay 对话超过平台超时窗口时

如果后续用户量扩大而不做加固，故障会从“偶发”变成“可复现”。

---

## 2. 本次评估范围

已检查链路：
1. Web API -> bridge 目标解析 -> bridge 转发
2. bridge -> gateway websocket -> OpenClaw agent
3. 容器启动/准备流程（runtime image + entrypoint + docker-manager）
4. 运行时状态判断与前端接入流程
5. 变更发布路径（bridge rollout 脚本）

关键文件（节选）：
- `src/lib/myclawgo/bridge-target.ts`
- `src/lib/myclawgo/bridge-fetch.ts`
- `src/app/api/chat/send/route.ts`
- `src/app/api/chat/history/route.ts`
- `src/app/api/chat/runtime-status/route.ts`
- `bridge/src/routes/chat.ts`
- `bridge/src/services/openclaw.ts`
- `src/lib/myclawgo/docker-manager.ts`
- `docker/openclaw-runtime/entrypoint.sh`

---

## 3. 当前架构的优点（保留项）

1. 每用户独立 runtime 容器（隔离方向正确）
2. bridge 有 token 认证（`BRIDGE_TOKEN`）
3. gateway 有 keep-alive 机制（`keep-gateway.sh`）
4. direct chat 计费具备 `paymentId` 幂等检查（避免重复扣费）
5. 群组 relay 有 `maxTurns`、自环/重复边防护

这些设计是正确方向，不建议推倒重来。

---

## 4. 高风险问题（会影响可用性）

## P0-1 运行时“假就绪”导致用户可见不可用

**现象**
- `/api/chat/runtime-status` 仅检查容器“是否存在”（`docker ps -a`），不检查容器是否 running，也不检查 bridge/gateway 是否可用。
- 页面可能显示可用，但用户发送消息立即失败。

**证据**
- `src/app/api/chat/runtime-status/route.ts:10-49`
- `src/components/dashboard/chat/chat-shell.tsx:2752-2865`

**影响**
- 宿主机重启后、容器被停掉后，用户进入 Chat 页面会直接遇到失败。

**建议（必须）**
- `runtime-status` 改为真实可用探针：
  - container running
  - bridge `/health` 成功
  - gateway health 成功

---

## P0-2 Bridge 目标解析不负责自愈启动

**现象**
- bridge 解析仅做 `docker inspect` 取 IP，不会确保容器启动，也不确保 bridge 存活。

**证据**
- `src/lib/myclawgo/bridge-target.ts:17-67`
- `src/lib/myclawgo/bridge-fetch.ts:19-27`

**影响**
- session 存在但容器未运行时，所有 bridge API 均失败（agents/groups/chat/history/send）。

**建议（必须）**
- 在 `requireUserBridgeTarget()` 里增加“ensure running + health check”，失败再返回 503。

---

## P0-3 群组 relay 总时长可能超过平台 90s 超时，导致前端超时失败

**现象**
- 平台侧 group chat 调用 bridge 设置 `AbortSignal.timeout(90000)`。
- bridge 内部 relay 是同步等待完成后才返回，单轮可等待到 45s，默认最多 6 轮，理论上可远超 90s。

**证据**
- `src/app/api/chat/send/route.ts:104-121`
- `bridge/src/routes/chat.ts:218-316`
- `bridge/src/routes/chat.ts:485-500`

**影响**
- 用户看到发送失败，但 bridge 可能仍在后台继续执行并写入 transcript。
- 造成“前端失败/后端已执行”的一致性问题（含计费一致性风险）。

**建议（必须）**
- relay 改异步后台任务（立即回首轮结果），或
- 提升平台超时并为 relay 设置 hard deadline（总时长上限）。

---

## P0-4 Bridge 进程缺乏守护，异常退出后用户持续不可用

**现象**
- entrypoint 只在容器启动时尝试拉起 bridge；bridge 运行中崩溃后无 watchdog 自动拉起。
- gateway 有 keep 脚本，bridge 没有同级机制。

**证据**
- `docker/openclaw-runtime/entrypoint.sh:34-40`
- `docker/openclaw-runtime/entrypoint.sh:17-32`（仅 gateway keep）

**影响**
- 单用户容器内 bridge 崩溃会导致该用户 API 全部故障，直到容器重启。

**建议（必须）**
- 增加 `keep-bridge.sh`（与 gateway 同模式）或使用轻量 supervisor。

---

## P0-5 单一共享 BRIDGE_TOKEN + 容器内 bridge 监听 0.0.0.0，存在横向调用风险

**现象**
- bridge 监听 `0.0.0.0`。
- 新容器通过同一个 `MYCLAWGO_BRIDGE_TOKEN` 注入 `BRIDGE_TOKEN`。

**证据**
- `bridge/src/server.ts:5-7`
- `src/lib/myclawgo/docker-manager.ts:388-397`

**影响**
- 一旦任意容器被突破，攻击者理论上可探测并调用其他容器 bridge（同 token），引发跨租户风险和可用性事故。

**建议（必须）**
- token 改为“每容器/每用户独立签发”，并支持滚动更新。
- 网络侧限制容器间互访（仅允许 control-plane 到 runtime）。

---

## 5. 中风险问题（会放大故障概率）

## P1-1 多处本地 JSON 存储缺乏并发锁与事务

**现象**
- group/task/state/session 等均是 read-modify-write 文件模型，无分布式锁/事务。

**证据**
- `bridge/src/services/group.ts`
- `bridge/src/services/task.ts`
- `bridge/src/services/state.ts`
- `src/lib/myclawgo/session-store.ts`

**影响**
- 高并发下可能出现覆盖写、状态丢失、任务记录不一致。

**建议**
- 优先迁移 group/task/session 到 DB；至少先加文件锁与原子写策略统一。

---

## P1-2 bridge 转发层普遍缺少 timeout/retry

**现象**
- `forwardBridgeGet/Json/Delete` 未设置请求超时。

**证据**
- `src/lib/myclawgo/bridge-fetch.ts:30-113`

**影响**
- bridge 卡顿时，平台接口线程可能长时间等待。

**建议**
- 统一 10~20s 超时 + 1 次指数退避重试（幂等请求）。

---

## P1-3 bridge 对 OpenClaw `ws` 依赖路径硬编码，升级脆弱

**现象**
- 直接 `require('/usr/local/lib/node_modules/openclaw/node_modules/ws/index.js')`。

**证据**
- `bridge/src/services/openclaw.ts:19-23`

**影响**
- OpenClaw 安装布局变化时，bridge 聊天链路可能整体失效。

**建议**
- 将 `ws` 作为 bridge 自身依赖管理，不依赖 OpenClaw 全局包内部路径。

---

## P1-4 bridge 发布脚本会重启全部 runtime 容器，存在短时全体抖动

**证据**
- `scripts/publish-and-rollout-bridge.sh:8-9`
- `scripts/restart-runtime-containers.sh:12-16`

**建议**
- 分批重启 + 健康检查 + 可中断回滚。

---

## 6. 当前“未激活但需注意”项

- `/api/chat/gateway-proxy` 仍是占位实现（返回 426，注释写明 Step 3 未完成）。
- 目前前端主聊天链路未依赖该接口，因此不是当前可用性主阻断。

证据：
- `src/app/api/chat/gateway-proxy/route.ts:22-39`
- 前端调用主链路为 `/api/chat/send` 与 `/api/chat/history`。

---

## 7. 是否可继续沿用当前 bridge 架构？

**可以沿用，但必须先完成 P0 加固。**

不建议现在重做架构；建议采用“低侵入硬化”路线：
1. 先把“假就绪 + 无自愈 + relay 超时冲突”修掉
2. 再处理 token 隔离与存储一致性
3. 最后再做多主机演进（你文档里已有该方向）

---

## 8. 最小可执行加固清单（建议 1~2 周）

## 第 1 优先级（本周）
1. `runtime-status` 改真实就绪探针（container running + bridge health + gateway health）
2. `requireUserBridgeTarget` 内置 `ensureUserContainer` + bridge 健康检查
3. group relay 增加总时长上限，并改为异步模式或提高上游超时一致性
4. 增加 bridge watchdog（keep-bridge.sh）

## 第 2 优先级（下周）
1. bridge token 改每容器独立
2. bridge-forward 统一 timeout/retry/circuit-breaker
3. group/task/session 持久化逐步迁移 DB

## 第 3 优先级（后续）
1. 灰度发布 bridge（分批重启容器）
2. 与多 runtime host 架构（allocation 表）对齐

---

## 9. 上线门槛（建议）

在你担心“后续不好改”的前提下，建议把以下作为放量前 gate：

- [ ] 宿主机重启后，用户首次发消息自动恢复（不需要手动点 Create）
- [ ] bridge 进程崩溃可在 10 秒内自恢复
- [ ] group relay 在 95 分位请求时长下不触发前端超时
- [ ] 单用户容器失效不影响其他用户
- [ ] bridge token 泄露演练不导致跨租户访问成功

---

## 10. 最终判断

你现在这条“用户通过 bridge 使用 OpenClaw”的路线是对的，**但要避免后续大改，必须先补齐 P0 可靠性项**。

否则随着用户增长，问题会从“偶尔报错”演变成“稳定性事故”，并且会迫使你在高压期重构，这正是你现在想避免的情况。
