# MyClawGo 每小时自治闭环记录（UTC 2026-03-02 17:45）

## 0) 审计执行说明
- 目标流程：先 `jinpin` 产品审计，再 `jinma` 技术审计。
- 实际执行：已尝试通过子会话委派，但子会话在工具调用阶段中断；本轮由总协调代理按同维度完成双审计并实施。

---

## 1) 产品审计（jinpin 维度）

### P0
1. **命令输入存在认知阻力，用户容易把可执行命令当自然语言发出**
   - 现状：只有 `/cmd ...` 才会走执行接口；直接输入 `openclaw skills list` 会被当聊天请求。
   - 影响：核心“可执行感”受损，首轮体验差，增加无效请求与 credit 消耗。
   - 建议：前端自动识别白名单安全命令并直接走 `/exec`。

### P1
1. **命令超时报错文案与实际场景不匹配**
   - 现状：提示固定 20s，且引导“缩短命令”；但 `clawhub install`、`openclaw agent` 本身合理耗时更长。
   - 建议：按命令类型给差异化超时与提示。

### P2
1. **输入框 placeholder 对命令直输的引导不足**
   - 建议：明确提示“可直接输入安全命令”。

---

## 2) 技术审计（jinma 维度）

### 风险与方案
1. **高风险（体验/成功率）**：前后端命令超时阈值偏低，安装与 agent 指令高概率超时
   - 证据：`runWhitelistedCommandInContainer` 固定 20s，前端 Abort 固定 25s。
   - 方案：按命令类型设置超时（install 120s、agent 60s、默认 20s）；前端同步延长等待窗口。
   - 回滚：恢复原固定 20s/25s。

2. **中风险（路径正确性）**：命令意图识别过度依赖 `/cmd` 前缀
   - 证据：Bot 页面仅 `text.startsWith('/cmd ')` 判定。
   - 方案：复用服务端同源白名单 regex 在前端判定，确保仅安全命令自动走 exec。
   - 回滚：撤销前端自动识别逻辑，保留 `/cmd`。

> 合规核查：未触及支付/鉴权密钥；未变更容器隔离原则；用户命令仍仅经白名单后在用户容器执行。

---

## 3) 最终决策（执行 2 项）
1. **自动识别安全命令并直连 exec（提升首轮转化与可用性）**
2. **命令分级超时（提升 install/agent 成功率）**

决策原因：
- 直接作用核心体验路径；
- 代码变更面小（2 文件），可快速回滚；
- 不涉及破坏性数据操作。

---

## 4) 改动点
1. `src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
   - 新增 `SAFE_COMMAND_PATTERNS` + `isSafeCommandInput()`。
   - 支持无 `/cmd` 前缀时自动识别安全命令并走 `/api/runtime/[sessionId]/exec`。
   - 新增 `getClientTimeoutMs()`：install 130s，agent 70s，默认 30s，聊天 25s。
   - 优化 timeout 错误文案与 placeholder 引导。

2. `src/lib/myclawgo/docker-manager.ts`
   - 新增 `getCommandTimeoutMs()`：install 120s，agent 60s，默认 20s。
   - `runWhitelistedCommandInContainer()` 改为动态 timeout。
   - 超时错误文案改为按实际秒数输出。

---

## 5) 最小验证
- 命令：
  - `npx biome format --write src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx src/lib/myclawgo/docker-manager.ts`
  - `npx biome check src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx src/lib/myclawgo/docker-manager.ts`
- 结果：通过（无 lint/format 错误）

---

## 6) 回滚点
- 建议回滚 commit：`git revert <本轮commit>`
- 或文件级回滚：
  - `git checkout HEAD~1 -- src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
  - `git checkout HEAD~1 -- src/lib/myclawgo/docker-manager.ts`

---

## 7) 下一轮观察指标
1. Bot 首次输入后成功返回率（尤其 install/agent 命令）
2. 命令超时率（按 command type 分层）
3. `/cmd` 前缀使用占比 vs 直接命令输入占比
4. 从 landing 到首次成功命令的中位时长
