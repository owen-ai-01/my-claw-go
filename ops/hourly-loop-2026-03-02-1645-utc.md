# MyClawGo 每小时自治闭环记录（UTC 2026-03-02 16:45）

## 0) 审计执行说明
- 目标流程：先 `jinpin` 产品审计，再 `jinma` 技术审计。
- 实际限制：会话委派通道当前不可用（`sessions_list`: gateway token mismatch），无法直接拉起子代理。
- 兜底方案：由总协调代理在代码仓库内按同等维度执行双审计并落地改动。

---

## 1) 产品审计（替代 jinpin）

### 发现清单
1. **Start 按钮路径未做 locale 适配，易导向 404/错误页面**（高）
   - 证据：`src/components/myclawgo/start-my-openclaw-button.tsx`
   - 现状：`/login`、`/pricing`、`data.redirectTo` 直接 push，未注入 `/${locale}`。
2. **runtime 启动失败时缺少明确页面反馈**（中）
   - 证据：同文件
   - 现状：当 `/api/runtime/start` 返回 `runtime-not-ready`，用户没有清晰可见的失败原因与重试引导。

### P0/P1/P2 建议
- **P0**：统一 Start 按钮所有跳转为 locale-safe 路径。
- **P1**：在启动失败时显示清晰错误提示，而非隐式回退。
- P2：后续可加“自动重试 + 指标埋点”（本轮不做，避免改动扩散）。

---

## 2) 技术审计（替代 jinma）

### 风险清单
1. **路由本地化不一致导致核心漏斗中断**（高）
   - 影响：`start -> bot/pricing/login` 链路失败会直接损失转化。
2. **runtime-not-ready 分支无前端可视反馈**（中）
   - 影响：用户重复点击、误判系统不可用，增加支持成本。

### 实现方案
- 在 Start 组件新增 `withLocale()`，对后端返回路径与本地 fallback 路径统一加 locale 前缀（已含 locale 的路径跳过）。
- 增加错误状态 `error`，对 `runtime-not-ready` 和网络失败进行可视化提示。

---

## 3) 最终决策（本轮执行 1 项）
**执行项：修复 Start 链路的 locale 跳转与失败反馈（合并实现）**

决策原因：
- 直接作用于首屏核心漏斗，价值高；
- 变更面小（单文件），回滚简单；
- 不触及支付/鉴权密钥，不破坏“用户命令仅在用户容器执行”。

---

## 4) 实施改动点
- 文件：`src/components/myclawgo/start-my-openclaw-button.tsx`
- 具体变更：
  1. 新增 `withLocale(path, locale)`，统一路由本地化。
  2. 登录跳转改为 `/${locale}/auth/login`。
  3. 对 `data.redirectTo` 进行 locale-safe 包装后再 `router.push()`。
  4. 增加 `error` UI，处理 `runtime-not-ready` 与网络失败提示。
  5. 补齐按钮 `type="button"` 通过 a11y lint。

---

## 5) 最小验证结果
- 命令：
  - `npx biome check "src/components/myclawgo/start-my-openclaw-button.tsx" "src/app/api/runtime/start/route.ts" "src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx"`
- 结果：通过（无错误）

---

## 6) Git 提交
- Commit: `ca9e766`
- Message: `fix localized runtime start redirects and error feedback`

---

## 7) 回滚点
- 一键回滚：`git revert ca9e766`
- 或精确回退：
  - `git checkout HEAD~1 -- src/components/myclawgo/start-my-openclaw-button.tsx`

---

## 8) 下一轮观察指标
1. Start 按钮点击后的目标页到达率（login/pricing/bot）
2. `runtime-not-ready` 出现率与重试成功率
3. Start 后 30s 内首条 bot 成功响应率
4. 带 locale 页面的 404 比例（应下降）
