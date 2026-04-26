好问题。需要想清楚一件事：OpenClaw Gateway 只监听 127.0.0.1:18789（本机回环），外部根本访问不到它。

  外部（SaaS）无法直接访问
           ✗
           ↓
  用户 VPS 内部
  ├── OpenClaw Gateway（127.0.0.1:18789）← 只有本机能访问
  └── Bridge（0.0.0.0:18080）           ← 对外开放，做翻译

  Bridge 存在的核心原因不是多用户管理，而是协议翻译：

  ┌───────────────────┬────────────────────────────────┐
  │        层         │              协议              │
  ├───────────────────┼────────────────────────────────┤
  │ SaaS → Bridge     │ 普通 HTTP REST（简单）         │
  ├───────────────────┼────────────────────────────────┤
  │ Bridge → OpenClaw │ WebSocket + 有状态会话（复杂） │
  └───────────────────┴────────────────────────────────┘

  OpenClaw 的 WebSocket 协议需要：先 openGatewaySession 建连 → sessions.patch 注入 model → chat.send 发消息 → agent.wait 阻塞等待 → chat.history
  取结果 → 关闭连接。这个复杂度放在 SaaS 侧处理不合适。

  有一个简化方向：把 OpenClaw 改为监听 0.0.0.0:18789 而不是 loopback，然后 SaaS 直连 WebSocket。但这样：
  1. 要在防火墙开放 18789 端口
  2. SaaS 要自己实现整套 OpenClaw WebSocket 协议
  3. OpenClaw 直接暴露在公网，安全性存疑

  结论：Bridge 保留是最简路径，代码已经存在，在 1 用户 1 VPS 下它变得非常简单——不再需要处理多用户路由、group relay
  状态管理等复杂逻辑，就是一个轻量的协议翻译层，systemd 服务跑着基本不占资源。