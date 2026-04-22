# Runtime Host 容器公网访问方案

> 版本：2026-04-22  
> 背景：当前架构下用户的 OpenClaw 容器只能通过 Control Plane 私网中转访问。本文档分析后续如果需要让用户直接公网访问容器的可行方案。  
> 结论：可以做，推荐 Phase 2 稳定后再叠加，不影响当前架构。

---

## 当前访问路径（中转模式）

```
用户浏览器
    │ HTTPS（公网）
    ▼
Control Plane（myclawgo.com）
    │ HTTP（Hetzner 私网）
    ▼
Runtime Host 容器内 Bridge
    │ 本机回环
    ▼
OpenClaw Gateway
```

用户不直接接触 Runtime Host，所有流量经 Control Plane 中转。

---

## 四种公网直访方案对比

| 方案 | 原理 | 实现难度 | 安全性 | 推荐程度 |
|------|------|---------|-------|---------|
| **A. 子域名反代** | 每用户一个子域名，Caddy 反代到容器 | 中 | 好 | ⭐⭐⭐ 推荐 |
| **B. Cloudflare Tunnel** | 容器内跑 cloudflared，无需开端口 | 低 | 最好 | ⭐⭐⭐ 推荐 |
| **C. 直接映射公网端口** | Runtime Host 开放 18001–19000 到公网 | 低 | 差 | ❌ 不推荐 |
| **D. Tailscale VPN** | 用户加入 VPN 网络访问容器 | 高 | 最好 | 仅技术用户 |

---

## 方案 A：每用户子域名 + Caddy 反代（推荐）

### 访问效果

```
用户 A 的 OpenClaw：  https://user-abc123.runtime.myclawgo.com
用户 B 的 OpenClaw：  https://user-def456.runtime.myclawgo.com
```

### 架构图

```
用户浏览器
    │ HTTPS 443（公网）
    ▼
*.runtime.myclawgo.com
    │ DNS 泛解析 → Runtime Host 公网 IP
    ▼
Caddy（每台 Runtime Host 上，443 端口）
    │ 根据子域名路由到对应容器端口
    ▼
容器 Bridge（localhost:18001 / 18002 / ...）
    │ 容器内回环
    ▼
OpenClaw Gateway（127.0.0.1:18789）
```

### 需要做的事

1. **DNS 泛解析**：在域名服务商添加 `*.runtime.myclawgo.com → Runtime Host 公网 IP`  
   （多台 Runtime Host 时，每台 Host 有独立的子域前缀，如 `*.host1.runtime.myclawgo.com`）

2. **每台 Runtime Host 安装 Caddy**：Caddy 自动申请 SSL 证书（支持 Let's Encrypt 泛域名），无需手动管理证书

3. **Runtime Host Firewall 开放 443**：仅开放 HTTPS，不需要开放容器端口范围

4. **容器创建时自动注册 Caddy 路由**：
   ```
   容器创建 → host-agent 向 Caddy Admin API 注册路由
   user-{sessionId}.runtime.myclawgo.com → localhost:{hostPort}
   ```

5. **容器删除时自动注销路由**：防止子域名悬空

### 适合场景

- 用户需要直接连接 OpenClaw WebSocket
- 需要用浏览器直接访问 OpenClaw 原生界面
- 对延迟有要求（减少一跳中转）

---

## 方案 B：Cloudflare Tunnel（最安全，推荐）

### 架构图

```
用户浏览器
    │ HTTPS（Cloudflare 全球边缘节点）
    ▼
Cloudflare Edge
    │ 加密隧道（不需要开任何入站端口）
    ▼
容器内 cloudflared 进程
    │
    ▼
Bridge → OpenClaw Gateway
```

### 核心优势

- **Runtime Host 完全不需要开任何公网入站端口**，安全性最强
- Cloudflare 自动处理 SSL 证书、DDoS 防护、WAF
- 每个容器 tunnel 可以绑定自定义域名：`user-abc.runtime.myclawgo.com`
- 不受 Runtime Host IP 变更影响（Tunnel 通过 Cloudflare 路由）

### 需要做的事

1. Cloudflare 账号 + Zero Trust（有免费额度，50 用户以内免费）
2. 容器创建时，host-agent 通过 Cloudflare API 创建一个 Tunnel
3. 容器内启动 `cloudflared` 进程连接 Tunnel
4. Tunnel 绑定子域名 `user-{sessionId}.runtime.myclawgo.com`

### 缺点

- 每个容器多一个 `cloudflared` 进程（约 30–50 MB 内存）
- 依赖 Cloudflare 服务可用性
- 大规模使用需要付费套餐

---

## 方案 C：直接映射公网端口（不推荐）

直接在 Runtime Host Firewall 开放 `18001–19000` 端口到公网。

**问题：**
- 每个用户容器的端口对公网暴露，攻击面极大
- 没有 SSL（HTTPS），数据明文传输
- 端口数字对用户不友好（`http://xxx.xxx.xxx.xxx:18001`）
- 不支持自定义域名

**结论：只适合内部测试，不能用于生产环境。**

---

## 方案 D：Tailscale VPN（仅技术用户）

给每个用户创建一个 Tailscale 节点，用户安装 Tailscale 客户端后加入网络，直接访问容器私网 IP。

**适合场景：** 面向开发者的高级功能，普通用户操作门槛太高，不适合作为默认访问方式。

---

## 实施时机建议

**现在不需要做任何改动。**

当前"Control Plane 中转"模式足以支撑初期用户。公网直访作为后续功能叠加，建议在以下条件满足后再实施：

| 条件 | 说明 |
|------|------|
| Phase 2 多机调度稳定 | Host Agent + 多机路由跑通后，再叠加公网访问层 |
| 有明确用户需求 | 用户需要直连 OpenClaw WebSocket 或原生界面时 |
| 规模达到一定量级 | Control Plane 中转成为性能瓶颈时 |

两种架构（中转 vs 直访）可以并存，不需要推倒重来：
- 普通 Web 聊天：继续走 Control Plane 中转
- 高级用户直连：走子域名或 Cloudflare Tunnel

---

## 与现有架构的兼容性

| 现有组件 | 是否需要改动 |
|---------|------------|
| Control Plane（Next.js） | 不需要（中转模式继续运行） |
| Runtime Host 容器创建逻辑 | 需要小改（容器创建时额外注册子域名/Tunnel） |
| DB schema | 需要在 `runtimeAllocation` 加 `publicUrl` 字段 |
| Host Agent | 需要增加 Caddy Admin API 调用 或 Cloudflare API 调用 |
| Firewall | 方案 A 需要开放 443；方案 B 不需要任何改动 |
