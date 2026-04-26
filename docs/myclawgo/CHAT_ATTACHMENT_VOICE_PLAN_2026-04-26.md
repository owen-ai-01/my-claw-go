# 聊天框附件上传 + 语音输入实现方案

> 版本：2026-04-26  
> 参考：Telegram 与 OpenClaw 交互模式，直接在 /chat 页面实现

---

## 核心思路：对齐 Telegram 的交互模型

Telegram 与 OpenClaw 的交互方式极简：

```
Telegram Webhook → 提取内容（文字/图片/语音）→ 统一转为文本 → bridge /chat/send → OpenClaw
```

**结论：不需要改 bridge、不需要改 OpenClaw Gateway，只在 Next.js 侧处理。**

Web 聊天框的架构完全对称：

```
浏览器选文件/按麦克风 → 上传到 R2（或直接转写）→ 内容嵌入消息文本 → /api/chat/send → bridge → OpenClaw
```

---

## 一、现状速览

| 层 | 现状 |
|----|------|
| R2 存储 | ✅ 已配置，有公网 URL |
| `/api/storage/upload` | ✅ 存在，但限图片 + 无鉴权 |
| `/api/chat/send` | ✅ 只接受 `message` 字符串 |
| chat-shell.tsx | ✅ `sendText(input)` 纯文字 |
| Telegram webhook | ✅ 只处理 `message.text`，忽略所有附件 |
| 语音输入 | ❌ 完全没有 |

---

## 二、需要做的三件事

### 事情 1：扩展上传 API（1 天）

**修改 `src/app/api/storage/upload/route.ts`**

```ts
// 当前只允许图片、无鉴权
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

// 改为支持图片 + 文档 + 音频，并加鉴权
const allowedTypes = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'text/plain', 'text/markdown',
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav',
];
// MAX_FILE_SIZE 图片/文档 10MB，音频 25MB
```

**同时加鉴权**（当前无 auth check，任何人都可上传）：

```ts
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

---

### 事情 2：扩展 `/api/chat/send` + `sendText` 函数（1 天）

**Next.js API Route 改动（`src/app/api/chat/send/route.ts`）**

接收 `attachments` 字段，在拼接 message 前做预处理：

```ts
body = {
  message: '帮我分析这份报告',
  attachments: [
    { type: 'image', url: 'https://files.myclawgo.com/xxx.jpg' },
    { type: 'pdf',   url: 'https://files.myclawgo.com/yyy.pdf' },
    { type: 'audio', url: 'https://files.myclawgo.com/zzz.webm' },
  ]
}
```

**服务器端处理逻辑（对齐 Telegram webhook 模式）**：

```ts
async function buildMessageWithAttachments(
  text: string,
  attachments: Attachment[]
): Promise<string> {
  let parts: string[] = [];

  for (const att of attachments) {
    if (att.type === 'image') {
      // Claude/Gemini 支持 markdown 图片语法，模型自动理解图片内容
      parts.push(`![用户上传图片](${att.url})`);
    } else if (att.type === 'pdf') {
      // 调用 Firecrawl 提取文本（已有 FIRECRAWL_API_KEY）
      const text = await extractPdfText(att.url);   // 最多 8000 字符
      parts.push(`[用户上传PDF，内容如下]\n\n${text}`);
    } else if (att.type === 'audio') {
      // 调用 OpenAI Whisper 转写
      const transcript = await transcribeAudio(att.url);
      parts.push(`[用户语音消息转写]\n${transcript}`);
    } else if (att.type === 'text') {
      const content = await fetch(att.url).then(r => r.text());
      parts.push(`[用户上传文件内容]\n\n${content.slice(0, 8000)}`);
    }
  }

  if (text) parts.push(text);
  return parts.join('\n\n');
}
```

最终 `message` 是纯字符串，**bridge 和 OpenClaw 完全不感知变化**。

---

### 事情 3：前端 UI（2-3 天）

**聊天输入框区域（`chat-shell.tsx` 第 2673 行左右）从：**

```tsx
<div className="flex items-end gap-2 rounded-2xl border bg-background px-4 py-2.5">
  <textarea ... />
  <button onClick={onSend}>Send</button>
</div>
```

**改为（对标 Telegram 输入框布局）：**

```tsx
<div className="flex items-end gap-2 rounded-2xl border bg-background px-4 py-2.5">
  {/* 附件预览区（附件被选中后显示） */}
  {attachments.length > 0 && (
    <AttachmentPreviewBar attachments={attachments} onRemove={removeAttachment} />
  )}

  {/* 附件按钮 */}
  <button onClick={() => fileInputRef.current?.click()}>
    <Paperclip className="h-4 w-4" />
  </button>
  <input ref={fileInputRef} type="file" hidden multiple
    accept="image/*,.pdf,.txt,.md,audio/*"
    onChange={handleFileSelect} />

  {/* 文字输入 */}
  <textarea ref={textareaRef} value={input} onChange={handleInputChange} ... />

  {/* 语音按钮（按住说话）or 发送按钮 */}
  {input.trim() || attachments.length > 0 ? (
    <button onClick={onSend} disabled={sending}>Send</button>
  ) : (
    <button onMouseDown={startRecording} onMouseUp={stopRecording}
            onTouchStart={startRecording} onTouchEnd={stopRecording}>
      <Mic className={cn("h-4 w-4", isRecording && "text-red-500 animate-pulse")} />
    </button>
  )}
</div>
```

**逻辑设计：**

```ts
// 选文件时：先上传到 R2，预览缩略图
async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'chat');
    const res = await fetch('/api/storage/upload', { method: 'POST', body: formData });
    const { url } = await res.json();
    setAttachments(prev => [...prev, { type: inferType(file), url, name: file.name }]);
  }
}

// 发送时：把附件 + 文字一起传给 /api/chat/send
async function sendWithAttachments() {
  await fetch('/api/chat/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: input, attachments, agentId/groupId }),
  });
  setAttachments([]);
}
```

---

## 三、语音输入：两种方案

### 方案 A：浏览器原生 Web Speech API（推荐先做）

**优点**：零服务器成本，实时转写，实现简单（约 50 行代码）  
**缺点**：仅 Chrome/Edge 支持，Safari 不支持，中英文识别质量一般

```ts
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'zh-CN';  // 或 'en-US'，可按界面语言切换
recognition.continuous = false;
recognition.interimResults = true;

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  setInput(prev => prev + transcript);  // 追加到现有输入
};

// 触发：点击麦克风按钮
function toggleVoice() {
  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
    setIsListening(true);
  }
}
```

**UI**：点击麦克风图标 → 变红 + pulse 动画 → 说话 → 文字出现在输入框 → 再次点击停止（和微信/钉钉类似）。

### 方案 B：MediaRecorder + Whisper API（备选，更准确）

适合需要高精度或 Safari 支持的场景：

```
按住麦克风按钮录音
    ↓
MediaRecorder 录 webm/opus 格式
    ↓
松手 → POST /api/chat/voice（新端点）
    ↓
服务器：fetch audioUrl → OpenAI Whisper API 转写 → 返回文本
    ↓
文本填入输入框 → 用户确认 → 发送
```

**服务器端**（`src/app/api/chat/voice/route.ts`）：

```ts
import OpenAI from 'openai';
const openai = new OpenAI();

export async function POST(req: Request) {
  const formData = await req.formData();
  const audio = formData.get('audio') as File;
  const transcript = await openai.audio.transcriptions.create({
    file: audio,
    model: 'whisper-1',
    language: 'zh',  // 或 auto
  });
  return NextResponse.json({ text: transcript.text });
}
```

**成本**：Whisper 约 $0.006/分钟，极低。

---

## 四、消息显示（气泡渲染）

用户发送附件后，消息气泡需要展示附件预览（类似 Telegram）：

```tsx
// 在 ChatMessage 组件里，检测消息内容
function renderContent(content: string) {
  // 检测是否含图片语法
  if (content.match(/!\[.*?\]\((https?:\/\/files\.myclawgo\.com\/.*?)\)/)) {
    return <ImageBubble content={content} />;
  }
  // 检测是否含 [用户上传PDF...] 标记
  if (content.startsWith('[用户上传PDF')) {
    return <DocumentBubble content={content} />;
  }
  return <TextBubble content={content} />;
}
```

更简单的做法（推荐）：在 `userChatMessage` 表加 `metaJson` 字段存 attachments 原始信息，消息气泡从 meta 渲染，而不是从内嵌文本里解析。

---

## 五、Telegram 同步支持附件

现有 Telegram webhook 忽略了图片/文件，扩展很简单（`route.ts` 已读取 `message` 对象）：

```ts
// 图片：取最高分辨率
const photo = message?.photo?.at(-1);
// 文件/音频
const document = message?.document;
const voice = message?.voice;
const audio = message?.audio;

// 统一处理：调用 Telegram Bot API 获取文件 URL
async function getTelegramFileUrl(fileId: string, botToken: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  const { result } = await res.json();
  return `https://api.telegram.org/file/bot${botToken}/${result.file_path}`;
}

// 下载 → 上传到 R2 → URL 嵌入消息
const fileUrl = await getTelegramFileUrl(photo.file_id, botToken);
const r2Url = await uploadFromUrl(fileUrl, 'telegram');  // 新工具函数
const messageText = photo ? `![Telegram图片](${r2Url})\n${text}` : text;

// 然后和现在一样发给 bridge
```

---

## 六、不需要改的部分（重要）

| 组件 | 原因 |
|------|------|
| bridge `/chat/send` | message 已是纯文本，不感知附件 |
| OpenClaw Gateway | ws `chat.send` 协议不变 |
| `userChatMessage` 表 | 可选加 metaJson，但不强制 |
| 模型路由器 | 不变，附件内容已内嵌进文本 |

---

## 七、实现优先级

| 阶段 | 内容 | 工作量 | 先后顺序 |
|------|------|--------|---------|
| P0 | 上传 API 加鉴权 + 扩展文件类型 | 0.5 天 | 最先做，安全漏洞 |
| P1 | 前端附件按钮 + 图片上传预览 + 图片 URL 嵌入消息 | 1.5 天 | 效果最直观 |
| P2 | 语音输入（Web Speech API 方案 A） | 1 天 | 无服务器成本 |
| P3 | PDF 文本提取（Firecrawl） | 1 天 | 需要 API 调用 |
| P4 | 语音文件转写（Whisper 方案 B） | 1 天 | P2 的补充 |
| P5 | Telegram 附件同步 | 1 天 | 锦上添花 |
| P6 | 消息气泡渲染优化 | 1 天 | 体验优化 |

**最小可用版本（P0+P1+P2）= 3 天，可以实现：图片上传 + 语音说话输入文字。**

---

## 八、关键约束

1. **图片必须用 R2 公网 URL**（`https://files.myclawgo.com/...`），不能用 base64，否则消息过长超出 OpenClaw context
2. **PDF 提取长度限制**：Firecrawl 返回内容截取前 8000 字符（约 5000 汉字），大文档需分块
3. **语音 Web Speech API**：Chrome/Edge only，需要 HTTPS，本地开发需要 localhost（已满足）
4. **上传文件大小**：图片/文档 10MB，音频 25MB（需要 `export const config` 里的 `maxDuration` 调大到 60s）
5. **No streaming**：现有 bridge 是同步 `agent.wait`，附件内容嵌入文本后消息更长，可能需要把 `timeoutMs` 从 90s 调大到 180s（PDF 类消息模型处理更慢）
