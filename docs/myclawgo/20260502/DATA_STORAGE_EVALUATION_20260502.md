# 用户数据存储位置评估（2026-05-02）

## 当前存储位置

| 数据类型 | 当前位置 | 说明 |
|---------|---------|------|
| Agent 工作区文档（AGENTS.md、IDENTITY.md 等） | VPS 文件系统 `/home/openclaw/.openclaw/agents/{id}/workspace/` | openclaw-gateway 直接读写 |
| 群组配置 | VPS `/home/openclaw/.openclaw/myclawgo-groups.json` | bridge 管理 |
| 聊天记录 | VPS `/home/openclaw/.openclaw/chats/{channel}/{agentId}/*.md` | gateway 作为上下文使用 |
| 任务状态 | VPS SQLite `/home/openclaw/.openclaw/tasks/runs.sqlite` | 短暂生命周期 |
| PG `user_agent` / `user_chat_message` 表 | Neon PostgreSQL | **存在但完全未使用** |

---

## 核心问题：VPS 是临时性资源

以下场景会导致数据丢失：

1. 用户升级/降级套餐 → 新建 VPS → 旧数据全部消失
2. VPS 故障 → Hetzner 从 snapshot 重建 → 数据消失
3. 未来支持 VPS 迁移 → 无法携带数据

目前只有一个用户、一次测试，感觉不到问题。一旦有多个真实用户，这是 **P0 数据安全风险**。

---

## 各类数据分析

### Agent 工作区文档（AGENTS.md、IDENTITY.md 等）

- 用户花时间配置的内容，**最需要持久化**
- 目前通过 bridge `/agents/:id/docs/:docKey` 读写，架构上已有桥梁
- 建议：**写入时同步到 PG**（bridge PUT → 本地文件 + PG `user_agent_doc` 表）
- VPS 重建时从 PG 恢复到本地文件系统

### 群组配置

- 数据量小，结构简单（`myclawgo-groups.json`）
- 建议：**写入 PG 作为 source of truth**，VPS JSON 作为 cache
- 改动范围：bridge `group.ts` 的 CRUD 操作同步写 PG

### 聊天记录

- Gateway 需要本地 `.md` 文件作为上下文，**不能从 VPS 移走**
- 用户需要在前端查看历史，目前通过 bridge `/chat/history` 读 `.md`
- 建议：**双写** —— bridge 写本地 `.md`（gateway 用）+ PG `user_chat_message`（前端查询、账单审计）
- `user_chat_billing_audit` 已在 PG，聊天消息本体也应同步进来

### 任务状态

- 生命周期短，不需要持久化到 PG
- 保持 VPS SQLite 即可

---

## 推荐方案：渐进式双写

VPS 文件继续作为 gateway 的运行层，PG 作为持久化备份层和前端查询层。

**不推荐把 gateway 的本地文件全部替换成 PG**：openclaw-gateway 只认本地文件系统，修改这一点需要 fork/patch gateway，成本极高。

### 优先级

| 优先级 | 数据类型 | 方案 | 理由 |
|-------|---------|------|------|
| P0 | Agent 文档 | 写入时同步 PG | 用户配置丢失最痛，数量少改动小 |
| P1 | 群组配置 | PG 作为 source of truth | 数据量极小，改动简单 |
| P2 | 聊天记录 | 双写 PG | 量大，需分页查询设计，`user_chat_message` 表已存在 |
| 不做 | 任务状态 | 保持 VPS SQLite | 短暂生命周期，无持久化价值 |

---

## 实施路径（P0 Agent 文档备份）

### 需要改动的文件

1. **`bridge/src/routes/agent-docs.ts`**（或对应路由）
   - PUT `/agents/:id/docs/:docKey` 写本地文件后，同步 POST 到 Next.js `/api/internal/agent-docs` 存 PG

2. **`src/app/api/internal/agent-docs/route.ts`**（新增）
   - 内部端点，接收 bridge 的同步请求，写入 `user_agent_doc` 表

3. **DB schema**（新增表 `user_agent_doc`）
   ```sql
   CREATE TABLE user_agent_doc (
     id UUID PRIMARY KEY,
     user_id TEXT NOT NULL,
     agent_id TEXT NOT NULL,
     doc_key TEXT NOT NULL,  -- agents/identity/user/soul/tools
     content TEXT NOT NULL,
     updated_at TIMESTAMP NOT NULL,
     UNIQUE(user_id, agent_id, doc_key)
   );
   ```

4. **VPS 重建时恢复逻辑**
   - `register/route.ts` 在 deploy 完成后，从 PG 读取 `user_agent_doc` 并通过 SSH 写回 VPS

### VPS 重建恢复流程

```
新 VPS 创建
  → deployBridgeToVps()
  → bridge 健康检查通过
  → 从 PG 查询 user_agent_doc WHERE user_id = ?
  → SSH 写回各 .md 文件到 /home/openclaw/.openclaw/agents/{id}/workspace/
  → 创建 main agent（已实现）
```

---

## 方案影响面

| 文件 | 改动类型 | 优先级 |
|------|---------|-------|
| `bridge/src/routes/agent-docs.ts` | 修改（双写 PG） | P0 |
| `src/app/api/internal/agent-docs/route.ts` | 新增 | P0 |
| `src/db/schema.ts` | 新增表 `user_agent_doc` | P0 |
| `src/app/api/internal/runtime/register/route.ts` | 修改（恢复逻辑） | P0 |
| `bridge/src/services/group.ts` | 修改（同步 PG） | P1 |
| `bridge/src/routes/chat.ts` | 修改（双写消息） | P2 |
