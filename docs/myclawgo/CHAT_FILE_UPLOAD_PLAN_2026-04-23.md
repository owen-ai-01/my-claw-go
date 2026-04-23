# 聊天框文件/图片/视频上传功能实现方案

> 版本：2026-04-23  
> 问题：SaaS 聊天框目前只支持纯文字消息，能否像 Telegram 一样支持文件、图片、视频上传？  
> 结论：**可以实现，且大部分基础设施已经存在，不需要改架构**。需要在各层做扩展。

---

## 一、现有架构盘点

### 已经有的（不用重建）

| 组件 | 现状 | 位置 |
|------|------|------|
| Cloudflare R2 存储 | ✅ 已配置，已接入 | `src/storage/`，`.env` 中有 `STORAGE_*` 变量 |
| 文件上传 API | ✅ 已有，但限制图片 | `src/app/api/storage/upload/route.ts` |
| S3Provider 上传封装 | ✅ 完整实现 | `src/storage/provider/s3.ts` |
| R2 公网访问 URL | ✅ 已配置 | `STORAGE_PUBLIC_URL=https://files.myclawgo.com` |
| Telegram 文件接收 | ⚠️ webhook 接收但未处理 | `src/app/api/webhooks/telegram/[userId]/[agentId]/route.ts` |

### 尚未有的（需要新建）

| 组件 | 缺失原因 |
|------|---------|
| 聊天框附件 UI | chat 输入框只有文本，无文件选择器 |
| 聊天发送支持附件 | `/api/chat/send` 只接受 `message` 文本字段 |
| Bridge 支持附件 | bridge `/chat/send` 只接受 `message` 字符串 |
| OpenClaw 多模态注入 | `chat.send` 只传文本，未探索图片 URL 注入方式 |
| 消息记录带附件 | `userChatMessage` 表无 attachments 字段 |
| 文件类型支持扩展 | 当前 upload API 仅支持 jpg/png/webp |

---

## 二、各类文件的处理方式分析

### 2.1 图片（jpg/png/webp/gif）

**技术路径（最容易实现）**：

```
用户选择图片
    ↓
前端上传到 R2（POST /api/storage/upload）→ 返回 public URL
    ↓
连同文字消息发送（message: "帮我分析这张图", attachments: [{url, type: "image"}]）
    ↓
Next.js /api/chat/send 收到
    ↓
将图片 URL 注入消息文本（如 "[图片: https://files.myclawgo.com/xxx.jpg]\n帮我分析这张图"）
    ↓
Bridge → OpenClaw Gateway chat.send（文本形式，含 URL）
    ↓
OpenClaw 的 AI 模型处理（支持 vision 的模型如 Claude/Gemini 可以访问图片 URL）
```

**关键点**：Claude（claude-sonnet-4-6 等）和 Gemini 都支持通过 URL 引用图片进行视觉分析，不需要 base64 编码。图片 URL 必须是公网可访问的（R2 public URL 满足）。

**是否需要改 OpenClaw Gateway 协议**：**不需要**。把图片 URL 以文本形式嵌入 `message` 字段，底层 LLM 会自动识别并处理（部分模型支持 markdown 图片语法 `![](url)`，部分支持直接 URL）。

---

### 2.2 文档（PDF、Word、txt、代码文件）

**技术路径**：

```
用户上传 PDF/txt/代码文件
    ↓
上传到 R2 → 返回 public URL
    ↓
Next.js 侧：
  - txt/代码：直接读取内容（fetch URL → 转为文本），内嵌到消息里
  - PDF：调用 Firecrawl（已有 FIRECRAWL_API_KEY）或 pdfjs 提取文本 → 内嵌到消息
    ↓
文本内嵌消息发送给 OpenClaw（"用户上传了以下文件内容：\n\n{fileContent}\n\n{userQuestion}"）
```

**PDF 提取**：项目中已有 `FIRECRAWL_API_KEY`，Firecrawl 支持 PDF URL 解析提取文本，可直接复用。

**大文件限制**：如果文件内容超过 LLM 上下文窗口（Claude 约 200K token），需要分块处理或只取前 N 字符。

---

### 2.3 视频（mp4/mov/webm）

**技术路径（最复杂）**：

```
用户上传视频
    ↓
上传到 R2（需放开文件类型限制，增大 size limit）
    ↓
有两种处理策略：

策略 A（Gemini Vision）：
  Gemini 1.5 Pro / 2.0 Flash 支持视频输入
  但需要通过 Google Files API 上传视频再引用（不能直接用 URL）
  → 复杂度高，需要额外的 Google API 集成

策略 B（音频提取 + 转录）：
  用 FFmpeg（容器内已有）提取音频
  → 调用 Whisper API 转录为文本
  → 把转录文本内嵌消息发给 OpenClaw
  → 简单但丢失了视觉信息

策略 C（截帧 + 视觉分析）：
  用 FFmpeg 每秒截取关键帧（5–10 帧）
  → 上传帧图片到 R2
  → 把帧图片 URL 列表注入消息
  → Claude/Gemini 逐帧分析
  → 适合"分析视频内容"类需求
```

**第一版推荐**：策略 B（音频转录），实现最简单，90% 的用户场景是"帮我把视频转录成文字/总结视频内容"，不需要视觉信息。

**视频文件大小限制**：R2 单文件支持最大 5 TB，但 Next.js API route 有默认 body 大小限制（当前配置 10MB），视频需要放大到 200–500MB。

---

### 2.4 音频（mp3/wav/m4a）

```
用户上传音频
    ↓
上传到 R2
    ↓
调用 OpenAI Whisper API 转录为文本
    ↓
转录文本内嵌消息发给 OpenClaw
```

已有 `OPENAI_API_KEY`，Whisper 支持直接传 URL（不需要本地文件），实现最简单。

---

## 三、完整实现方案（分层改造）

### Layer 1：存储层扩展（改动最小）

**文件**：`src/app/api/storage/upload/route.ts`

当前只支持 jpg/png/webp，需要扩展：

```typescript
// 按用途分类的文件类型白名单
const CHAT_ALLOWED_TYPES: Record<string, { maxSizeMb: number }> = {
  // 图片
  'image/jpeg':  { maxSizeMb: 20 },
  'image/png':   { maxSizeMb: 20 },
  'image/webp':  { maxSizeMb: 20 },
  'image/gif':   { maxSizeMb: 20 },
  'image/heic':  { maxSizeMb: 20 },
  // 文档
  'application/pdf':  { maxSizeMb: 50 },
  'text/plain':        { maxSizeMb: 5  },
  'text/markdown':     { maxSizeMb: 5  },
  // 代码（text/plain 兜底）
  // 音频
  'audio/mpeg':   { maxSizeMb: 100 },
  'audio/wav':    { maxSizeMb: 100 },
  'audio/mp4':    { maxSizeMb: 100 },
  // 视频（第一版可暂不支持，或仅支持小视频）
  'video/mp4':    { maxSizeMb: 200 },
  'video/quicktime': { maxSizeMb: 200 },
};
```

新增专用聊天上传路由：`/api/chat/upload`（带用户鉴权，文件存放在 `chat/{userId}/` 目录下）。

---

### Layer 2：消息数据结构扩展

**文件**：`src/db/schema.ts`

`userChatMessage` 表新增 `attachmentsJson` 字段：

```typescript
// 在 userChatMessage 表中新增
attachmentsJson: jsonb('attachments_json').$type<ChatAttachment[]>(),
```

```typescript
// 附件类型定义
type ChatAttachment = {
  type: 'image' | 'document' | 'audio' | 'video';
  url: string;           // R2 public URL
  name: string;          // 原始文件名
  mimeType: string;      // MIME type
  sizeBytes: number;
  extractedText?: string; // PDF/音频提取的文本（已处理完放这里）
};
```

---

### Layer 3：Chat Send API 扩展

**文件**：`src/app/api/chat/send/route.ts`

接受附件并构建增强消息：

```typescript
const body = await req.json() as {
  message?: string;
  attachments?: ChatAttachment[];  // 新增
  agentId?: string;
  groupId?: string;
  // ...
};

// 构建发给 OpenClaw 的增强消息
function buildEnhancedMessage(text: string, attachments: ChatAttachment[]): string {
  if (!attachments?.length) return text;

  const parts: string[] = [];

  for (const att of attachments) {
    if (att.type === 'image') {
      // Claude/Gemini 支持直接 URL 引用图片
      parts.push(`![${att.name}](${att.url})`);
    } else if (att.type === 'document' && att.extractedText) {
      parts.push(`[文件: ${att.name}]\n\`\`\`\n${att.extractedText.slice(0, 50000)}\n\`\`\``);
    } else if (att.type === 'audio' && att.extractedText) {
      parts.push(`[音频转录: ${att.name}]\n${att.extractedText}`);
    } else {
      // 兜底：告诉 agent 文件的 URL
      parts.push(`[文件: ${att.name}](${att.url})`);
    }
  }

  return parts.length > 0 ? `${parts.join('\n\n')}\n\n${text}` : text;
}
```

---

### Layer 4：文件预处理服务（新建）

**文件**：`src/lib/myclawgo/file-preprocessor.ts`

上传完成后在服务端提取内容，不让 OpenClaw 等待：

```typescript
export async function preprocessAttachment(att: ChatAttachment): Promise<ChatAttachment> {
  switch (att.type) {
    case 'document':
      if (att.mimeType === 'application/pdf') {
        // 调用 Firecrawl 提取 PDF 文本
        const text = await extractPdfText(att.url);
        return { ...att, extractedText: text };
      }
      if (att.mimeType.startsWith('text/')) {
        // 直接 fetch 文本内容
        const text = await fetch(att.url).then(r => r.text());
        return { ...att, extractedText: text.slice(0, 100000) };
      }
      return att;

    case 'audio':
      // 调用 OpenAI Whisper 转录
      const transcript = await transcribeAudio(att.url);
      return { ...att, extractedText: transcript };

    case 'image':
    case 'video':
      // 图片直接传 URL，视频第一版跳过预处理
      return att;
  }
}
```

---

### Layer 5：前端聊天输入框扩展

**文件**：`src/components/dashboard/chat/chat-shell.tsx`（或对应的输入组件）

需要新增的 UI 元素：

```
┌─────────────────────────────────────────────┐
│ 📎 [附件预览区：缩略图 × 文件名]               │
│─────────────────────────────────────────────│
│  输入消息...                    [📎] [发送]  │
└─────────────────────────────────────────────┘
```

- **📎 按钮**：触发 `<input type="file" accept="image/*,application/pdf,audio/*,video/*">` 多选
- **附件预览**：图片显示缩略图，PDF/文档显示文件名+图标，音频显示波形图标
- **上传流程**：选择文件后立即上传到 R2（显示进度），拿到 URL 后存在 state 里，点发送时一起提交
- **移除附件**：每个预览有 × 按钮

---

### Layer 6：Telegram 文件处理补全

**文件**：`src/app/api/webhooks/telegram/[userId]/[agentId]/route.ts`

当前 Telegram webhook 已经接收消息但只提取了 `message.text`，完全忽略了文件。补全如下：

```typescript
// Telegram 消息中的文件类型
const photo = message?.photo;        // 图片（数组，取最高分辨率）
const document = message?.document;  // 文件
const voice = message?.voice;        // 语音
const video = message?.video;        // 视频
const audio = message?.audio;        // 音频

if (photo || document || voice || video || audio) {
  const fileId = photo
    ? photo[photo.length - 1].file_id  // 最高分辨率
    : (document || voice || video || audio).file_id;

  // 调用 Telegram getFile API 获取下载 URL
  const fileUrl = await getTelegramFileUrl(botToken, fileId);

  // 下载文件 → 上传到 R2 → 预处理 → 发送给 OpenClaw
  // 流程和 Web 端一致
}
```

---

## 四、各文件类型限制与说明

| 文件类型 | 支持程度 | 大小限制 | AI 处理方式 | 复杂度 |
|---------|---------|---------|-----------|-------|
| 图片（jpg/png/webp/gif）| ✅ 完全支持 | 20 MB | 直接传 URL 给视觉模型 | 低 |
| PDF | ✅ 完全支持 | 50 MB | Firecrawl 提取文本 | 低 |
| TXT / Markdown / 代码 | ✅ 完全支持 | 5 MB | 直接读取内容 | 极低 |
| 音频（mp3/wav/m4a）| ✅ 完全支持 | 100 MB | Whisper API 转录 | 低 |
| 视频（mp4/mov）| ⚠️ 第一版只转录音轨 | 200 MB | FFmpeg 提音 → Whisper | 中 |
| Word/Excel/PPT | ⚠️ 需额外库 | 20 MB | mammoth（.docx）/ xlsx | 中 |
| 压缩包（zip/tar）| ❌ 不支持 | — | 安全风险，不建议 | — |

---

## 五、OpenClaw Gateway 是否需要改动

**结论：第一版不需要改动 OpenClaw Gateway。**

原因：
- 图片通过 URL 内嵌到 `message` 文本（如 `![](https://files.myclawgo.com/xxx.jpg)`），Claude/Gemini 的视觉能力会自动处理
- PDF/音频的文本内容直接嵌入 `message`，OpenClaw 看到的就是提取出的文本
- `chat.send` 的 `message` 字段是字符串，我们在 Next.js 侧组装好再发

**未来可选的升级**：若 OpenClaw Gateway 支持 `attachments` 参数（传 base64 或 URL 数组），可以利用 AI SDK 的原生多模态能力（更精确的 token 计算、更好的上下文处理）。但这依赖 OpenClaw 版本，且对第一版用户体验没有显著差别。

---

## 六、Next.js API Route 文件大小限制

当前 `/api/storage/upload` 配置了 10 MB 上限，视频需要更大。Next.js App Router 的调整方式：

```typescript
// src/app/api/chat/upload/route.ts
export const config = {
  api: { bodyParser: false },  // 不用 body parser，用 formData
};

// Next.js 15 App Router 方式（在 next.config.ts 中）
// 或在路由中直接处理 multipart stream
```

对于大文件（视频），推荐使用**客户端直传 R2**（Presigned URL 模式）：
1. 前端请求 `/api/chat/upload/presign`，后端生成 R2 Presigned PUT URL（有效 5 分钟）
2. 前端直接 PUT 到 R2（绕过 Next.js 服务器，没有 body 大小限制）
3. 上传完成后前端把 R2 URL 通知后端做预处理

---

## 七、实施顺序（按价值/难度比）

### Phase A：图片支持（1–2 天）

最快可见效果，用户需求最高频。

1. 扩展 `/api/storage/upload` 接受图片（已有基础）
2. 新增 `/api/chat/upload` 专用聊天上传路由（带用户鉴权）
3. `chat/send` API 接受 `attachments` 数组
4. 图片 URL 内嵌到消息文本
5. 前端聊天输入框加图片选择 + 预览
6. 消息显示图片缩略图

### Phase B：文档 / PDF 支持（2–3 天）

高频需求（用户想让 agent 分析文档）。

1. 扩展上传支持 PDF / txt / markdown
2. Firecrawl 提取 PDF 文本
3. 文本内嵌消息
4. 大文件截断策略（超过 50K 字符取前 N 字符 + 提示）

### Phase C：音频支持（1–2 天）

转录需求（会议录音、语音备忘）。

1. 扩展上传支持 audio/*
2. Whisper API 转录
3. 转录文本内嵌消息

### Phase D：Telegram 文件补全（1 天）

让 Telegram 和 Web 端能力对齐。

1. Webhook 提取 photo/document/voice/video file_id
2. 调用 Telegram getFile API 获取临时 URL
3. 下载 → 上传 R2 → 走和 Web 端相同的预处理流程

### Phase E：视频支持（3–5 天，后期）

最复杂，优先级最低。

1. Presigned URL 直传 R2（绕过 Next.js body 限制）
2. 视频音轨提取（FFmpeg，在容器内执行或调用外部服务）
3. Whisper 转录

---

## 八、所有需要修改/新建的文件

| 文件 | 操作 | Phase |
|------|------|-------|
| `src/app/api/chat/upload/route.ts` | 新建，聊天专用上传路由（带鉴权） | A |
| `src/app/api/chat/upload/presign/route.ts` | 新建，大文件直传 Presigned URL | E |
| `src/app/api/chat/send/route.ts` | 改造，接受 `attachments` 字段 | A |
| `src/lib/myclawgo/file-preprocessor.ts` | 新建，文件预处理（PDF/音频提取）| B/C |
| `src/db/schema.ts` | 改造，`userChatMessage` 加 `attachmentsJson` | A |
| `src/components/dashboard/chat/chat-shell.tsx` | 改造，输入框加附件 UI | A |
| `src/app/api/webhooks/telegram/[userId]/[agentId]/route.ts` | 改造，处理 photo/document/voice | D |

---

## 九、一句话结论

> 文件/图片/视频上传功能完全可以实现，**R2 存储和基础上传 API 已经存在，架构不需要任何根本性改变**。图片支持最简单（1–2 天），PDF 和音频转录稍复杂但有现成 API（Firecrawl 已集成、OpenAI Whisper 可调用），视频最复杂放后期做。第一版优先做图片 + PDF，能覆盖 80% 的用户需求。
