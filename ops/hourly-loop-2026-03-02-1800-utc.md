# MyClawGo 每小时自治闭环记录（UTC 2026-03-02 18:00）

## 0) 审计执行说明
- 目标流程：`jinpin` 产品审计 + `jinma` 技术审计。
- 执行方式：直接由总协调代理执行审计。

---

## 1) 产品审计（jinpin 维度）

### P0
1. **容器运行时错误对用户不友好**
   - 现状：当 Docker 容器启动失败或不存在时，用户看到原始 Docker 错误（如 "No such container"）。
   - 影响：用户困惑，不知道是系统问题还是自身操作错误，降低信任感。
   - 建议：将底层 Docker 错误转换为用户友好的提示，引导重试或联系支持。

### P1
1. **命令超时提示仍偏技术化**
   - 现状：超时提示包含具体秒数（如 "Command timed out after 20s"），但未说明原因与建议操作。
   - 影响：用户可能误以为命令本身有误，而非等待时间不足。
   - 建议：按命令类型提供场景化提示（例如 "Install commands can take up to 2 minutes. Please retry once."）。

### P2
1. **成功执行反馈缺乏上下文**
   - 建议：在命令输出前添加简短前缀（如 "✅ Executed in your container:"），增强可执行感。

---

## 2) 技术审计（jinma 维度）

### 风险与方案
1. **高风险（体验）**：容器启动失败错误透传
   - 证据：`docker start` 错误被忽略，后续 `docker exec` 失败返回原始 Docker 错误。
   - 方案：在 `runWhitelistedCommandInContainer` 中捕获容器不存在/未运行的错误，返回统一友好提示。
   - 回滚：还原错误处理逻辑即可。

2. **中风险（维护）**：错误消息映射分散
   - 证据：`normalizeError` 仅处理少数已知错误，未覆盖容器运行时错误。
   - 方案：在 `normalizeError` 中加入 Docker 常见错误的映射。
   - 回滚：移除新增映射。

> 合规核查：不改支付/鉴权密钥；不破坏容器隔离原则；用户命令仍仅经白名单后在用户容器执行。

---

## 3) 最终决策（执行 2 项）
1. **容器启动失败友好提示（后端）**
2. **Docker 错误前端映射（前端）**

决策原因：
- 直接改善用户遇错时的体验与留存；
- 改动面小（2 文件，仅错误消息）；
- 可快速回滚，不涉及核心逻辑。

---

## 4) 改动点
1. `src/lib/myclawgo/docker-manager.ts`
   - 在 `runWhitelistedCommandInContainer` 的 catch 块中识别 Docker 错误（"No such container"、"is not running"、"Cannot connect to the Docker daemon"）。
   - 返回统一友好提示："Runtime container is not ready. Please try again or contact support."

2. `src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
   - 在 `normalizeError` 函数中添加对上述 Docker 错误字符串的映射，显示相同友好提示。

---

## 5) 最小验证
- 命令：
  - `npx biome check src/lib/myclawgo/docker-manager.ts src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
  - `npx biome format --write src/lib/myclawgo/docker-manager.ts src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`
- 结果：通过

---

## 6) 回滚点
- `git revert <本轮commit>`
- 或文件级回滚：
  - `git checkout HEAD~1 -- src/lib/myclawgo/docker-manager.ts`
  - `git checkout HEAD~1 -- src/app/[locale]/(marketing)/[sessionId]/bot/page.tsx`

---

## 7) 下一轮观察指标
1. 容器启动失败相关错误的支持请求量
2. 命令执行成功率（整体）
3. 用户首次错误后的重试率
