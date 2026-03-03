# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 02:10）

## 0) 审计执行说明
- 延续稳定性优化，聚焦异常响应体的可诊断性。

## 1) 产品审计（jinpin）
- P1：当接口返回非 JSON 错误页/代理错误文本时，前端会丢失关键错误信息，用户只看到通用失败提示。

## 2) 技术审计（jinma）
- 风险：低。仅前端响应解析逻辑增强，不改安全策略与执行路径。

## 3) 最终决策（执行 1 项）
- 将响应解析改为“先读 text，再尝试 JSON 解析”；解析失败时保留原始错误片段用于提示。

## 4) 改动点
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 改动：
  - `await res.text()` 获取响应体
  - `try JSON.parse(rawBody)`，失败则 fallback 为 `{ error: rawBody.slice(0, 500) }`
  - 保持现有错误展示链路不变，但提升非 JSON 场景可观测性

## 5) 最小验证
- `npx biome format --write src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅
- `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅

## 6) 回滚点
- `git revert <本轮commit>`

## 7) 下一轮观察指标
- 非 JSON 错误下的可读错误占比
- “Request failed”通用错误占比是否下降
