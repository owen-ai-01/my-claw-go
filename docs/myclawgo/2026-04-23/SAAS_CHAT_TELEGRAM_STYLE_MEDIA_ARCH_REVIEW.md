# MyClawGo SaaS 聊天框媒体上传架构评估（2026-04-23）

## 1. 结论（先回答你的核心问题）

**可以实现，但当前架构“还不能直接满足 Telegram 级别的文件/图片/视频聊天体验”，需要做对应完善。**

更具体地说：
- **不需要推翻重做整体架构**（Web API -> Bridge -> OpenClaw Runtime 这条主链路可继续沿用）。
- **必须补齐媒体通道、消息模型、存储与安全控制**，否则后续一旦放量会出现“上传成功但聊天不可用、历史不一致、超时和成本失控”等问题。

---

## 2. 现状证据（基于当前代码）

## 2.1 聊天主链路目前是“纯文本”协议

- 前端发送：`src/components/dashboard/chat/chat-shell.tsx` 仅发送 `message` 文本到 `/api/chat/send`。
- 平台 API：`src/app/api/chat/send/route.ts` 只解析 `message: string`，并以 JSON 转发。
- Bridge：`bridge/src/routes/chat.ts` 强制 `message is required`，无附件字段。
- Runtime 网关调用：`bridge/src/services/openclaw.ts` 的 `chat.send` 仍是 `message: string`。

**结论**：现在上传媒体后，聊天链路没有原生字段去携带 `attachments`。

## 2.2 聊天存储模型是文本为中心

- DB：`src/db/schema.ts` 的 `user_chat_message` 只有 `content`（text），无附件结构。
- Bridge transcript：`bridge/src/services/chat-store.ts` 持久化 markdown 文本块，无附件 schema。
- Runtime 侧历史：`src/lib/myclawgo/user-data.ts` 也是 `text` 模式。

**结论**：即使前端上传成功，也无法在历史、重放、计费、审计中稳定表示“消息 + 多附件”。

## 2.3 已有上传基础能力，但仅覆盖“小图片上传”

- 存在统一上传接口：`src/app/api/storage/upload/route.ts`。
- 当前限制：
  - 文件大小上限 10MB（`MAX_FILE_SIZE`）。
  - MIME 白名单仅 `image/jpeg|image/png|image/webp`。
  - 不支持视频/通用文件。

**结论**：可作为“基础上传能力”复用，但离 Telegram 式多媒体能力差距较大。

## 2.4 Telegram webhook 当前也主要是文本接入

- `src/app/api/webhooks/telegram/[userId]/[agentId]/route.ts` 读取 `message.text`，未处理 photo/video/document 语义。

**结论**：你说的“和 Telegram 一样”目标，本身在 Telegram 通道也还没全量打通。

---

## 3. 风险判断：如果现在直接上媒体聊天会怎样

## P0（高风险）
1. 上传链路和聊天链路割裂：文件上传成功，但 `/api/chat/send` 不认识附件，用户感知为“发不出去/助手看不到文件”。
2. 历史不可重建：聊天回放只有文本，没有附件上下文，导致后续回答漂移。
3. 视频请求超时：当前聊天超时窗口和同步处理模型不适合大文件处理。

## P1（中风险）
1. 成本不可控：无按附件大小/类型计费策略。
2. 安全风险：若缺少病毒扫描、MIME 校验、下载域白名单，容易引入恶意文件与 SSRF 风险。
3. 前端体验断层：缺失上传进度、转码/解析状态、失败可重试机制。

---

## 4. 架构是否可延续？

**可延续，建议采用“主链路不变 + 增加媒体子通道”的方式演进。**

保留：
- `Chat UI -> /api/chat/send -> bridge -> gateway -> openclaw`

新增：
- `Upload Plane`：负责文件上传、校验、扫描、元数据登记。
- `Attachment Metadata Plane`：在消息层携带附件描述，不传大二进制。
- `Media Processing Plane`：对视频等重负载任务异步化（抽帧/转码/OCR/ASR）。

---

## 5. 最小必要完善清单（必须做）

## 5.1 消息协议升级（必须）

将聊天请求从：
- `message: string`

升级为：
- `message: string`
- `attachments: AttachmentRef[]`（可选）

建议附件结构：
- `id`
- `kind`（image|video|audio|file）
- `mime`
- `size`
- `url`（对象存储地址）
- `name`
- `width/height/duration`（可选）
- `status`（uploaded|processing|ready|failed）
- `scan`（clean|blocked|pending）

## 5.2 持久化模型升级（必须）

建议二选一：
1. 在 `user_chat_message` 增加 `meta_json`（含 attachments）
2. 新建 `user_chat_attachment` 表并关联 messageId（推荐，扩展性更好）

同时 bridge transcript 至少要保留附件摘要（id/url/kind）以支持审计和重放。

## 5.3 上传接口升级（必须）

在现有 `/api/storage/upload` 基础上完善：
- 扩展 MIME 白名单（video/mp4、application/pdf 等）。
- 分类型大小上限（图像、视频、文档分开）。
- 增加登录态校验与用户配额控制。
- 上传后返回标准化 `AttachmentRef`。

## 5.4 Bridge 与 Runtime 适配（必须）

- `bridge /chat/send` 支持 `attachments`。
- 发送到 OpenClaw 前做“附件上下文注入”策略：
  - 图片：附 URL + 尺寸 + 可选 OCR 摘要。
  - 文档：附 URL + 文件摘要/抽取文本。
  - 视频：优先异步处理（抽帧+转写），聊天先回“处理中”。
- 不建议将大文件 base64 直接塞进 chat payload。

## 5.5 前端体验（必须）

- 输入框增加附件按钮（图片/视频/文件）。
- 上传进度 + 状态机（上传中/处理中/可发送/失败重试）。
- 历史消息渲染附件卡片（缩略图/时长/文件名/大小）。

---

## 6. 分阶段落地建议（避免大改）

## Phase 1（1 周）：图片 + 文档可用
1. 扩展上传 API（鉴权、MIME、size、返回 AttachmentRef）。
2. `/api/chat/send`、bridge `/chat/send` 增加 `attachments` 字段。
3. DB 增加附件持久化。
4. 前端支持图片/文档上传与渲染。

## Phase 2（1~2 周）：视频可用（异步）
1. 视频上传与后台处理队列（抽帧/时长/转写）。
2. 聊天侧支持“处理中占位 + 完成后补充上下文”。
3. 超时与重试策略独立于文本聊天请求。

## Phase 3（1 周）：Telegram 能力对齐
1. Telegram webhook 增加 `photo/video/document` 解析。
2. 统一 Telegram 与 SaaS Web 的 `AttachmentRef` 协议。
3. 保证多端会话历史一致。

---

## 7. 上线前 Gate（建议强制）

- [ ] 20MB 图片、100MB 视频上传稳定（失败可重试）。
- [ ] 同一消息多附件在聊天历史可完整回放。
- [ ] 视频处理失败不阻塞文本聊天。
- [ ] 附件链接具备访问控制（签名或私有桶策略）。
- [ ] 计费和配额对附件生效（按类型/体积）。
- [ ] 桥接超时策略与异步任务策略分离。

---

## 8. 最终判断

你的现有架构**可以承载**“像 Telegram 一样的文件/图片/视频聊天”，但前提是完成上述协议与存储层完善。

**如果保持当前实现不改，结论是：不能稳定支持该目标。**

从改造成本看，这属于“中等规模的增量演进”，不是“推翻式重构”；现在补齐，比后续用户量上来后再返工要便宜得多。
