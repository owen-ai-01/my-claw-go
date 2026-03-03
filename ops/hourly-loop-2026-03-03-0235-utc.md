# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 02:35）

## 0) 审计执行说明
- 延续错误语义化策略，补齐请求参数类状态码提示。

## 1) 产品审计（jinpin）
- P1：用户在命令格式错误时收到 400/422，缺乏明确“检查命令格式”的引导。

## 2) 技术审计（jinma）
- 风险：极低。仅前端错误文案映射增强，不影响后端执行/安全。

## 3) 最终决策（执行 1 项）
- 在 `normalizeError` 增加 HTTP 400/422 映射，提示用户检查命令格式。

## 4) 改动点
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 新增映射：
  - `http 400` / `http 422` → `The request format is invalid. Please check your command and retry.`

## 5) 最小验证
- `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅

## 6) 回滚点
- `git revert <本轮commit>`

## 7) 下一轮观察指标
- 400/422 场景下用户自助修复率
- 命令格式错误重复出现率
