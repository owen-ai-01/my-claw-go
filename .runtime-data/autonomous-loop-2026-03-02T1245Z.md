# MyClawGo Autonomous Product Loop — 2026-03-02 12:45 UTC

## 1) Product audit (jinpin plan, fallback to in-process audit)
- `sessions_spawn(runtime=acp, agentId=jinpin)` failed due gateway auth mismatch (`unauthorized: gateway token mismatch`).
- Fallback findings:
  - **P0**: 新用户首屏缺少可点击的“安全命令示例”，上手成本高，影响首条成功执行率。
  - **P1**: 命令失败时提示过于技术化，用户不清楚下一步该怎么做。
  - **P2**: 输入请求在网络抖动时可能无反馈等待，体验不稳定。

## 2) Technical audit (jinma plan, fallback to in-process audit)
- `sessions_spawn(runtime=acp, agentId=jinma)` failed due same gateway auth mismatch.
- Fallback findings:
  - **High**: `/api/runtime/[sessionId]/exec` 缺少顶层异常兜底，极端情况下返回不一致。
  - **Medium**: 前端未设置请求超时，可能长时间 pending。
  - **Constraint checked**: 未改支付/积分密钥；未破坏“用户命令仅在用户容器执行”原则。

## 3) Final decision (execute only 2 small reversible changes)
1. 在 Bot 页面增加 3 个一键命令示例 + 更友好的错误归一化文案（高转化、低风险）。
2. 为前端请求增加 25s Abort timeout，并在 exec API 增加 try/catch 统一错误响应（稳定性提升，改动小）。

## 4) Code changes
- `src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
  - 新增一键示例按钮：`skills list` / `models status` / `skill search`
  - 优化错误提示：command blocked / timeout 的可行动文案
  - 增加 `AbortController` 25s 超时提示
- `src/app/api/runtime/[sessionId]/exec/route.ts`
  - 增加 `try/catch`，统一 500 响应结构，避免未捕获异常

## 5) Validation
- `npx biome check --write <2 files>` ✅
- `npx biome check <2 files>` ✅

## 6) Rollback points
- Revert commit for this loop only:
  - `git revert <this_commit_sha>`
- Or file-level rollback:
  - `git checkout HEAD~1 -- src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
  - `git checkout HEAD~1 -- src/app/api/runtime/[sessionId]/exec/route.ts`

## 7) Next-round metrics
- 首条命令成功率（first-command success rate）
- `/cmd` 使用率与按钮点击率
- exec API 500 比率
- 请求超时率（25s abort occurrences）
