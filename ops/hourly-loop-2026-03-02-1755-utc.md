# MyClawGo 每小时自治闭环记录（UTC 2026-03-02 17:55，续跑）

## 0) 续跑说明
- 触发原因：上一轮模型中断/超时后继续执行。
- 目标：在不扩大改动面的前提下，修复上一轮引入的“前后端命令策略重复定义”风险。

---

## 1) 产品审计（jinpin 维度）

### P0
1. **命令识别规则双份维护，易出现 UI 与后端行为不一致**
   - 影响：用户看到“可执行”但服务端拒绝，或反之，造成失败与困惑。
   - 建议：将白名单规则与超时策略统一沉淀到共享模块。

### P1
1. **超时提示与实际超时值耦合弱**
   - 影响：用户错误预期（以为 25s 固定），实际 install/agent 已延长。
   - 建议：统一由共享策略输出超时逻辑，前端文案改为场景化提示。

---

## 2) 技术审计（jinma 维度）

### 风险与方案
1. **中风险（可维护性）**：regex 白名单在 client/server 各一份
   - 证据：`bot/page.tsx` 与 `docker-manager.ts` 均定义命令模式。
   - 方案：新增 `src/lib/myclawgo/command-policy.ts`，集中导出：
     - `isSafeCommandInput()`
     - `getCommandTimeoutMs()`
     - `getClientTimeoutMs()`

2. **低风险（回归）**：共享逻辑改造可能影响现有路径
   - 控制：只做等价迁移，不改白名单范围。
   - 回滚：还原三个文件即可。

---

## 3) 最终决策（执行 1 项）
**执行项：抽取并复用统一命令策略模块（规则 + 超时）**

决策原因：
- 高价值防漂移，减少后续回归；
- 变更小且局部，可快速回滚；
- 不触及支付/鉴权，不改变容器隔离与“仅用户容器执行”。

---

## 4) 改动点
1. 新增：`src/lib/myclawgo/command-policy.ts`
   - 统一安全命令白名单、危险 shell 字符拦截、超时策略。
2. 修改：`src/lib/myclawgo/docker-manager.ts`
   - 删除本地白名单/超时实现，改为引用共享策略。
3. 修改：`src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
   - 删除本地白名单/超时实现，改为引用共享策略。
   - 调整超时提示文案，避免固定秒数误导。

---

## 5) 最小验证
- `npx biome format --write src/lib/myclawgo/command-policy.ts src/lib/myclawgo/docker-manager.ts src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- `npx biome check src/lib/myclawgo/command-policy.ts src/lib/myclawgo/docker-manager.ts src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 结果：通过

---

## 6) 回滚点
- `git revert <本轮commit>`
- 或文件级回滚：
  - `git checkout HEAD~1 -- src/lib/myclawgo/command-policy.ts`
  - `git checkout HEAD~1 -- src/lib/myclawgo/docker-manager.ts`
  - `git checkout HEAD~1 -- src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`

---

## 7) 下一轮观察指标
1. 前端识别为命令但后端拒绝的比例（应接近 0）
2. install/agent 命令超时率
3. 命令执行成功率（首轮输入）
