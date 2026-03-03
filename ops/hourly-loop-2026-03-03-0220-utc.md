# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 02:20）

## 0) 审计执行说明
- 继续优化错误反馈可读性，减少用户面对 HTTP 状态码时的理解成本。

## 1) 产品审计（jinpin）
- P1：即便已补充 `HTTP xxx`，非技术用户仍难快速判断下一步操作。

## 2) 技术审计（jinma）
- 风险：低。仅前端 `normalizeError` 映射增强，不改执行链路与安全策略。

## 3) 最终决策（执行 1 项）
- 在 `normalizeError` 中新增 HTTP 状态码语义化映射（401/403/404/5xx）。

## 4) 改动点
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 映射新增：
  - 401/403 → 会话过期或无权限，建议重新登录
  - 404 → 端点不存在，建议刷新重试
  - 500/502/503 → 服务暂时不可用，建议稍后重试

## 5) 最小验证
- `npx biome format --write src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅
- `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅

## 6) 回滚点
- `git revert <本轮commit>`

## 7) 下一轮观察指标
- 含 HTTP 状态码错误的自助修复率
- 用户二次重试成功率
