# MyClawGo Hourly Autonomous Loop — 2026-03-03 03:17 UTC

## 1) 本轮问题发现

### 产品审计（协调汇总）
- **转化阻力（P0）**：存在“未登录也可触发 runtime/create”的路径，导致真实用户路径与系统行为不一致（用户未完成登录/付费前也可创建会话），干扰转化漏斗口径。
- **可用性阻力（P1）**：支付完成查询未绑定当前用户，前端存在“状态不确定/误判”的风险，影响支付后体验连续性。
- **路径一致性（P1）**：`runtime/start` 已按登录用户路径约束，而 `runtime/create` 约束不一致，造成产品路径割裂。

### 技术审计（来自 jinma + 代码核查）
- **高风险**：`src/app/api/runtime/create/route.ts` 缺少鉴权。
- **高风险**：`src/actions/check-payment-completion.ts` 查询仅按 `sessionId`，未绑定 `userId`。
- **中风险**：支付链路日志与可观测性可继续加强（本轮未扩展，留作后续）。

## 2) 决策与原因（本轮仅执行 2 项）

### 决策 A（P0）
**给 `runtime/create` 增加登录鉴权，并将会话绑定到当前用户。**
- 原因：直接影响安全边界与“用户命令只在用户容器执行”原则。
- 价值：同时提升安全性与产品路径一致性，减少匿名滥用。

### 决策 B（P0）
**支付完成查询增加 `userId` 绑定 + 输入校验收紧。**
- 原因：避免跨用户 sessionId 探测导致的状态泄露/误判。
- 价值：增强支付与积分链路的可信度，减少支付后异常反馈。

## 3) 具体改动点

1. `src/app/api/runtime/create/route.ts`
- 新增 `auth.api.getSession` 鉴权。
- 未登录返回 `401 Authentication required`。
- 由 `createSession(prompt)` 改为 `ensureSessionById(userId, prompt)`，确保 runtime session 与当前用户一致。

2. `src/actions/check-payment-completion.ts`
- schema 从 `z.string()` 收紧为 `z.string().min(8).max(128)`。
- action 中新增 `ctx.user.id` 校验，未登录直接返回 `Unauthorized`。
- 查询条件从 `eq(payment.sessionId, sessionId)` 改为
  `and(eq(payment.sessionId, sessionId), eq(payment.userId, ctx.user.id))`。
- 查询字段收敛为 `{ paid: payment.paid }`。

## 4) 最小验证结果

执行命令：
```bash
npx biome check src/app/api/runtime/create/route.ts src/actions/check-payment-completion.ts
```
结果：**通过（No fixes applied）**

## 5) Git 提交

- Commit: `55d48e7`
- Message: `harden runtime creation auth and payment completion ownership checks`

## 6) 回滚点

如需回滚本轮改动：
```bash
git revert 55d48e7
```

## 7) 下一轮观察指标

1. `/api/runtime/create` 的 401 比例（确认未登录请求被正确拦截）。
2. 支付完成轮询成功率与误报率（isPaid false-positive/false-negative）。
3. 与支付相关客服/日志告警数量（是否下降）。
4. runtime 创建失败率是否异常波动（确认鉴权后无副作用）。

