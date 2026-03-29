# Agent 配置原则（MyClawGo）

更新时间：2026-03-29

## 原则：OpenClaw Agent 原生配置只存“OpenClaw 支持字段”

以下业务字段 **不得写入** `~/.openclaw/openclaw.json` 的 `agents.list[]`：

- `role`
- `avatar`（含 `identity.avatar`）
- `description`
- `department`
- `enabled`

## 设计约束

1. OpenClaw 配置保持 schema-clean，避免 gateway 因未知字段校验失败。
2. 业务扩展字段统一存到外部元数据存储（bridge state / metadata 文件或 DB），不要混入 OpenClaw 原生配置。
3. 新增 Agent 字段时，先判断：
   - 是否 OpenClaw 原生支持？支持才允许写入 `openclaw.json`。
   - 非原生字段一律写业务元数据层。
4. 代码层必须有兜底清洗（sanitize）逻辑，防止误写入。

## 备注

当前 bridge 服务已加入清洗兜底：写配置时会移除上述禁止字段。
后续需补一版“业务元数据持久化 + 编辑回显”迁移，确保 UI 字段不丢失。
