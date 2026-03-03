# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 01:50）

## 0) 审计执行说明
- 延续输入容错优化，继续减少“明知会被后端拒绝”的无效请求。

## 1) 产品审计（jinpin）
- P1：用户使用 `/cmd` 但输入非白名单命令时，当前要等后端返回拒绝，反馈链路偏慢。

## 2) 技术审计（jinma）
- 风险：低。仅前端预校验，白名单规则仍以后端为最终准则，不改变安全边界。

## 3) 最终决策（执行 1 项）
- 为显式 `/cmd` 增加前端 allowlist 预判：明显不安全命令直接在前端提示，减少一次无效网络往返。

## 4) 改动点
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 改动：
  - 新增分支：`explicitCmd && rawCommand && !isSafeCommandInput(rawCommand)`
  - 提示文案：
    - `That command is not in the safe allowlist. Try: /cmd openclaw skills list`

## 5) 最小验证
- `npx biome format --write src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅
- `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅

## 6) 回滚点
- `git revert <本轮commit>`

## 7) 下一轮观察指标
- 后端 `Command not allowed` 响应次数
- `/cmd` 输入后的首轮成功率
