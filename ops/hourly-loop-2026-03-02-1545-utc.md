# MyClawGo 每小时自治闭环记录（UTC 2026-03-02 15:45）

## 0) 审计执行说明
- 计划通过 `jinpin`（产品）和 `jinma`（技术）子代理并行审计。
- 实际受限：本机 `sessions_spawn` 返回 `gateway token mismatch`，子代理未能启动。
- 兜底：由总协调代理在仓库内直接执行同等范围审计，并保留证据位置。

---

## 1) 产品审计（替代 jinpin）

### 发现清单
1. **低积分用户在会话内继续输入，直到报错后才感知不可用**
   - 证据：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
   - 现状：虽有 `lowCredits` banner，但接口返回 402 时仅显示错误文本，未自动切换到“低积分锁定态”。
2. **错误文案对“积分不足”缺少明确动作指引**
   - 证据：同文件 `normalizeError`。

### P0/P1/P2 建议
- **P0**：当 `/chat` 返回 `INSUFFICIENT_CREDITS`/402 时，前端立即切换 `lowCredits=true`，禁用输入并露出充值按钮。
- **P1**：错误文案标准化，出现积分不足时统一提示“充值后继续”。
- P2：主页文案进一步 A/B（当前轮不做，避免扩散改动面）。

---

## 2) 技术审计（替代 jinma）

### 风险清单
1. **运行时容器启动失败未被 `/api/runtime/start` 显式处理**（高）
   - 证据：`src/app/api/runtime/start/route.ts`
   - 现状：`await ensureUserContainer(runtimeSession);` 忽略返回值，可能把故障带到后续页面，形成“可跳转但不可用”。
2. **积分不足错误链路前端状态未闭环**（中）
   - 证据：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`

### 高风险实现方案
- 对风险1：在 start 路由检查 `ensureUserContainer` 返回值；失败时返回 `500 + runtime-not-ready + error`，阻止错误状态继续传播。
- 验证：本地静态检查 + 代码路径检查，确保仅在 `runtime.ok` 时跳转 bot。

---

## 3) 最终决策（本轮仅执行 2 项）
1. **立即修复 runtime/start 的容器失败处理**（高价值：稳定性，避免付费用户首跳失败）
2. **立即修复低积分错误的前端状态闭环**（高价值：转化与可用性，减少用户无效重试）

决策理由：
- 两项都在核心路径（开始使用与持续使用）；
- 改动小、局部、可快速回滚；
- 不触及支付密钥/鉴权密钥，不破坏“命令仅在用户容器执行”。

---

## 4) 实施改动点

### 改动 A（稳定性）
- 文件：`src/app/api/runtime/start/route.ts`
- 变更：
  - `const runtime = await ensureUserContainer(runtimeSession);`
  - 新增 `if (!runtime.ok) return 500` 分支，返回 `action: 'runtime-not-ready'` 与错误信息。

### 改动 B（可用性/转化）
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 变更：
  - `normalizeError` 增加积分不足标准文案映射。
  - 在请求失败分支中，若 `data.code === 'INSUFFICIENT_CREDITS'` 或 `res.status === 402`，立即 `setLowCredits(true)`，让 UI 进入“充值引导”状态。

---

## 5) 最小验证结果
- 命令：`npx biome check "src/app/api/runtime/start/route.ts" "src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx"`
- 结果：通过（No fixes applied）

---

## 6) Git 提交
- Commit: `280c0aa`
- Message: `fix runtime start failure handling and low-credit UX gating`

---

## 7) 回滚点
- 单提交可回滚：
  - `git revert 280c0aa`
  - 或在热修场景：`git checkout HEAD~1 -- <file>` 精确回退两个文件。

---

## 8) 下一轮观察指标
1. `/api/runtime/start` 500 比率（含 `runtime-not-ready`）
2. Bot 页面 402 后的二次输入率（应下降）
3. 低积分用户从 bot 页面跳转 `/pricing` 的点击率（应上升）
4. 付费用户“进入 bot 后首次成功响应率”
