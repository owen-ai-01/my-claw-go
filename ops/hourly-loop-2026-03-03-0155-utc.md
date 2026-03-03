# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 01:55）

## 0) 审计执行说明
- 延续命令输入容错优化，修复大小写边界问题。

## 1) 产品审计（jinpin）
- P1：用户输入大写 slash（如 `/CMD ...`）时，当前识别不稳定，体验不一致。

## 2) 技术审计（jinma）
- 风险：低。仅前端命令识别正则与解析逻辑更新，不改后端安全策略。

## 3) 最终决策（执行 1 项）
- 将 `/cmd` 检测与解析改为大小写不敏感，统一 `/cmd`、`/CMD`、`/Cmd` 行为。

## 4) 改动点
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 改动：
  - `explicitCmd` 改为：`/^\/cmd(?:\s|$)/i.test(text)`
  - `rawCommand` 改为正则去前缀：`text.replace(/^\/cmd\s*/i, '').trim()`

## 5) 最小验证
- `npx biome format --write src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅
- `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅

## 6) 回滚点
- `git revert <本轮commit>`

## 7) 下一轮观察指标
- `/CMD` 类输入成功率
- slash 输入相关错误率
