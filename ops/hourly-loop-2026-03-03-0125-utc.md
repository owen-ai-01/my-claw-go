# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 01:25）

## 0) 审计执行说明
- 延续超时反馈优化，继续降低用户对“命令是否异常”的误解。

## 1) 产品审计（jinpin）
- P1：长命令超时提示与短命令提示一致，用户容易误判为系统故障。

## 2) 技术审计（jinma）
- 风险：低。仅前端提示分支判断，不影响命令执行、安全白名单、容器隔离。

## 3) 最终决策（执行 1 项）
- 根据 `timeoutMs` 长短提供差异化超时提示（>=60s 时提示“该命令可能需要更久”）。

## 4) 改动点
- 文件：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 改动：
  - `AbortError` 文案改为分支：
    - `timeoutMs >= 60_000`：提示该命令可能本身耗时较长
    - 其他：维持常规重试提示

## 5) 最小验证
- `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx` ✅

## 6) 回滚点
- `git revert <本轮commit>`

## 7) 下一轮观察指标
- 长命令超时后的二次重试率
- “系统坏了”类支持反馈占比
