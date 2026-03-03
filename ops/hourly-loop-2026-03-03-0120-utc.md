# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 01:20）

## 0) 审计执行说明
- 延续上一轮，继续优化命令执行体验中的错误反馈清晰度。

## 1) 产品审计（jinpin）
- P1：超时提示文案未体现“实际等待时长”，用户难判断是短超时还是长命令。

## 2) 技术审计（jinma）
- 风险：低。仅前端文案与变量作用域微调，不影响执行链路和安全策略。

## 3) 最终决策（执行 1 项）
- 将超时提示改为显示**实际超时秒数**，并修复变量作用域确保稳定运行。

## 4) 改动点
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 改动：
  - 引入 `let timeoutMs = 25_000` 作为外层变量。
  - 请求前按命令类型覆盖 `timeoutMs = getClientTimeoutMs(...)`。
  - 超时报错改为：`Request timed out after ${seconds}s`。

## 5) 最小验证
- `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅

## 6) 回滚点
- `git revert <本轮commit>`

## 7) 下一轮观察指标
- 超时后重试率
- 用户对“等待时长可解释性”的反馈
