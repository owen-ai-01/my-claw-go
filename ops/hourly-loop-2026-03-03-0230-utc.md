# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 02:30）

## 0) 审计执行说明
- 继续错误语义化映射，补齐网关超时类状态码。

## 1) 产品审计（jinpin）
- P1：用户遇到 408/504 时，若只见通用失败信息，难判断是否应重试。

## 2) 技术审计（jinma）
- 风险：极低。仅前端错误文案映射增强，不影响安全与执行路径。

## 3) 最终决策（执行 1 项）
- 在 `normalizeError` 增加 HTTP 408/504 专属提示，明确“超时可重试”。

## 4) 改动点
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 新增映射：
  - `http 408` / `http 504` → `The runtime took too long to respond. Please retry your request.`

## 5) 最小验证
- `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅

## 6) 回滚点
- `git revert <本轮commit>`

## 7) 下一轮观察指标
- 408/504 场景下重试成功率
- 超时类支持咨询占比
