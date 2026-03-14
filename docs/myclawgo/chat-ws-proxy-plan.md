# Chat WS Proxy Plan

## 目标

让已创建用户在后台 `/chat` 页面中，通过 WebSocket 连接到平台的 WS proxy，再由平台代理到该用户 Docker 容器内的 OpenClaw Gateway，从而尽量复用 OpenClaw 自带 `/chat` 的聊天实现思路。

---

## 背景结论

当前不再继续投入以下主路径：
- 旧 `/bot` 页面
- `runtime_tasks` 作为主聊天链路
- `docker exec + openclaw gateway call` 作为长期聊天实现
- 平台自己重写一整套聊天协议

新的聊天主路径收敛为：

```text
Browser /chat
  -> MyClawGo WS proxy
  -> user docker OpenClaw gateway
  -> chat.history / chat.send / chat.abort
```

---

## 为什么需要平台代理

虽然 OpenClaw 原版 `/chat` 可以前端直连 gateway WebSocket，但当前 MyClawGo 架构是：
- 每个用户一个 Docker runtime
- gateway 在容器内运行
- 容器内地址不直接暴露给浏览器
- 多用户隔离必须由平台登录态控制

所以当前最合理的方案是：

## 平台做 WebSocket proxy

而不是：
- 浏览器直连容器内 `127.0.0.1:18789`
- 或给每个用户容器暴露公网端口/域名

---

## 目标架构

### 前端
- 页面路径：`/chat`
- 当用户已创建 runtime 后，前端建立 WebSocket 连接：
  - `wss://<app-domain>/api/chat/gateway-proxy`

### 平台
- 校验当前登录态
- 识别当前 userId
- 找到该用户 Docker container/runtime
- 建立到容器 OpenClaw Gateway 的 WS 连接
- 双向转发消息帧

### 容器
- OpenClaw Gateway 继续运行在容器内部
- 不直接对公网暴露
- 作为该用户聊天真相源

---

## 页面状态模型

### 状态 1：not_created
页面显示：
- `Create MyClawGo`

点击后执行创建流程：
- 创建用户 runtime
- 创建 Docker 容器
- 准备 OpenClaw 基础环境

### 状态 2：ready
页面显示：
- 直接聊天界面
- 自动建立到 WS proxy 的连接
- 不再混合创建流程

---

## 鉴权方案

### 浏览器 -> 平台
继续使用网站现有登录态：
- Session cookie
- 服务端从 cookie 中识别当前用户

### 平台 -> 容器 gateway
第一版采用：
- 服务器本机内网可信访问
- 平台内部负责定位容器
- 不把每个用户的 gateway 对公网开放

后续可加强为：
- 容器 gateway token/password
- 用户级短期连接 token
- 更严格的 proxy 授权校验

---

## 消息协议

尽量贴着 OpenClaw 自带 `/chat` 的协议：
- `connect`
- `chat.history`
- `chat.send`
- `chat.abort`

### 第一版目标
先优先打通：
1. `chat.history`
2. `chat.send`

后续再加：
3. `chat.abort`
4. 更细的事件流 / 中间态处理

---

## 运行时定位

平台代理连接容器时，按以下信息定位：
1. 当前登录用户 `userId`
2. `session-store` 中该用户 runtime session
3. 对应 `containerName`
4. 容器内 OpenClaw Gateway 地址（容器内部 18789）

注意：
- 不允许前端传 userId 来指定目标容器
- 目标 runtime 必须由服务端根据当前登录用户推导

---

## 实现步骤

## Step 1
文档化 WS proxy 方案（本文件）

## Step 2
实现平台 WS proxy 入口：
- `/api/chat/gateway-proxy`
- 完成登录态识别
- 能定位当前用户 runtime

## Step 3
实现平台 -> 容器 gateway 的 WS 转发：
- 双向转发消息帧
- 验证可建立稳定连接

## Step 4
前端 `/chat` 接入 WS client：
- ready 状态自动连接 proxy
- 展示连接状态

## Step 5
接 `chat.history`

## Step 6
接 `chat.send`

## Step 7
接 `chat.abort`

## Step 8
降级/移除旧过渡聊天 API：
- `/api/chat/history`
- `/api/chat/send`
- 使 `/chat` 主路径完全以 WS + Gateway 为核心

---

## 关键风险

### 1. WebSocket upgrade
Next.js 常规 route 对 WS upgrade 支持不如普通 HTTP 直接，需要确认当前运行时最稳的承载方式。

### 2. 容器内 gateway 访问方式
需要稳定解决：
- 如何从平台进程访问指定用户容器内 gateway
- 如何保持代理连接稳定

### 3. 多用户隔离
必须保证：
- 用户 A 只能连接自己的 runtime
- 不能通过参数构造访问别人的 gateway

---

## 当前主结论

新的聊天主路线正式确认为：
- `/chat` 两态（not_created / ready）
- ready 后通过平台 WS proxy 连接用户 Docker 内 OpenClaw Gateway
- 聊天协议尽量复用 OpenClaw 自带 `/chat`

这是后续重构聊天主链路的标准方案。

---

## Step 3.3 落地更新（独立 WS proxy 承载）

为避免把 WS upgrade 强行塞到 Next route handler，新增独立 Node WS proxy 进程：

- `scripts/chat-gateway-proxy.ts`
- 启动命令：`pnpm chat-proxy:start`
- 默认监听：`ws://127.0.0.1:3020/api/chat/gateway-proxy`

### 连接方式

1. 前端先请求：`GET /api/chat/gateway-connection`
2. 后端签发短期 token（当前默认 5 分钟）
3. 前端使用返回的 `gateway.wsUrl` 建立 WS
4. 独立 proxy 进程验 token + 定位用户容器
5. 连接容器内 gateway：`ws://<container-ip>:18789`
6. 双向转发 WebSocket 帧

### 新增环境变量

- `MYCLAWGO_CHAT_PROXY_PORT`（默认 `3020`）
- `MYCLAWGO_CHAT_PROXY_PATH`（默认 `/api/chat/gateway-proxy`）
- `MYCLAWGO_CHAT_PROXY_WS_BASE_URL`（可选；用于 gateway-connection 返回外部 WS 地址）
- `MYCLAWGO_CHAT_PROXY_SECRET`（可选；未设置则回落到现有 secret）

### 说明

- Next 的 `/api/chat/gateway-proxy` route 仍保留作为占位入口。
- 真正 WebSocket 连接应走独立 proxy 进程（由反向代理转发该路径）。
