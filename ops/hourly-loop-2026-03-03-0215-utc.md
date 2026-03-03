# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 02:15）

## 0) 审计执行说明
- 延续错误可观测性优化，提升失败场景可诊断性。

## 1) 产品审计（jinpin）
- P1：接口失败但无 error 字段时，用户只看到模糊“Request failed”，难以区分 4xx/5xx。

## 2) 技术审计（jinma）
- 风险：低。仅前端错误文案 fallback 增强，不改执行/安全逻辑。

## 3) 最终决策（执行 1 项）
- 在错误缺省场景下补充 HTTP 状态码，便于用户和支持定位问题。

## 4) 改动点
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 改动：
  - 原：`data?.error || 'Request failed'`
  - 新：`data?.error || \`Request failed (HTTP ${res.status})\``

## 5) 最小验证
- `npx biome format --write src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅
- `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅

## 6) 回滚点
- `git revert <本轮commit>`

## 7) 下一轮观察指标
- 错误消息中带状态码的覆盖率
- 支持工单中“无法判断失败原因”占比
