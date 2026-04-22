# Hetzner 项目结构说明：SaaS 和 Runtime Host 放不放同一个项目？

> 版本：2026-04-22  
> 结论：**放同一个 Hetzner 项目，不需要分开。**

---

## 背景问题

当前 SaaS（Next.js）和 Docker 容器在同一台服务器上。后续要新购 runtime host 专门跑用户 Docker 容器，是否需要在 Hetzner 建立独立的第二个项目？

---

## 结论：不需要，同一个项目就是正确的做法

### 关键原因：Hetzner Private Network 只能连接同一项目内的服务器

Control Plane（SaaS）需要通过 **私网** 访问每台 Runtime Host 上的 Host Agent 和用户容器 Bridge。

如果分成两个项目：
- Private Network 不跨项目 → Control Plane 无法通过私网访问 Runtime Host
- 只能走公网通信 → 不安全 + 慢 + 需要额外配置
- 容器 Bridge 端口（18001–19000）需要对公网开放 → 严重安全风险

**所以必须在同一个 Hetzner 项目内，让所有服务器加入同一个 Private Network。**

---

## 正确的项目结构

```
Hetzner 项目：myclawgo-production（一个项目）
│
├── Private Network：myclawgo-runtime-network（10.0.0.0/24）
│   └── 所有服务器都加入这个私网
│
├── Firewall：myclawgo-runtime-host-fw
│   └── 只给 Runtime Host 用（私网全放行 + SSH）
│
├── SSH Keys：myclawgo-runtime-deploy
│   └── 所有服务器共用
│
├── Snapshot：myclawgo-runtime-host-v1-xxxxxx
│   └── 用于快速初始化新 Runtime Host（60–90 秒 vs 3–8 分钟）
│
├── 服务器 A：Control Plane（现有机器）
│   ├── 角色：跑 Next.js + Stripe + DB + Provision Worker
│   ├── 公网 IP：xxx.xxx.xxx.xxx（myclawgo.com 指向这里）
│   ├── 私网 IP：10.0.0.1
│   └── Label：type=control-plane
│
├── 服务器 B：Runtime Host 1（手动购买，Phase 2）
│   ├── 角色：只跑用户 Docker 容器 + Host Agent
│   ├── 公网 IP：有，但 Firewall 封锁公网入站
│   ├── 私网 IP：10.0.0.10
│   └── Label：type=runtime-host
│
└── 服务器 C：Runtime Host 2（自动购买，Phase 3）
    ├── 角色：同上
    ├── 私网 IP：10.0.0.11
    └── Label：type=runtime-host
```

---

## 两类服务器的核心区别

| 属性 | Control Plane（SaaS） | Runtime Host |
|------|----------------------|--------------|
| 运行内容 | Next.js / Stripe Webhook / DB / Worker | 用户 Docker 容器 + Host Agent |
| 公网访问 | 是（myclawgo.com 域名指向它） | 否（Firewall 封锁所有公网入站） |
| 私网访问 | 是（10.0.0.1） | 是（10.0.0.1X） |
| 用户流量 | 直接承接（HTTPS 443） | 不承接（只接受来自 Control Plane 私网的请求） |
| Hetzner 项目 | 同一个项目 | 同一个项目 |
| Hetzner Label | `type=control-plane` | `type=runtime-host` |
| Firewall | 开放 80/443 给公网 | 只开 SSH + 私网段 |

---

## 通信路径

```
用户浏览器
    │ HTTPS（公网）
    ▼
Control Plane（10.0.0.1，公网 IP 对外）
    │ HTTP（Hetzner 私网，10.0.0.0/24）
    ▼
Runtime Host（10.0.0.10，公网不可达）
    │ 本机回环
    ▼
用户容器内的 OpenClaw Gateway + Bridge
```

Runtime Host 的公网 IP 存在但被 Firewall 封锁，**用户永远不会直接访问 Runtime Host**，所有流量都经过 Control Plane 中转。

---

## 你现在不需要做任何改动

你之前"不小心把资源建在和 SaaS 同一个项目"其实是**正确的做法**。

不需要：
- 新建第二个 Hetzner 项目
- 迁移已创建的 Firewall / SSH Key / Network / Snapshot
- 修改任何现有配置

只需要：
1. 给现有 Control Plane 服务器打上标签 `type=control-plane`
2. 确认它已加入 Private Network，私网 IP 为 `10.0.0.1`
3. 后续自动购买的 Runtime Host 统一打标签 `type=runtime-host`，加入同一 Private Network

---

## 如何给服务器打标签

1. Hetzner Cloud Console → 进入服务器详情页
2. 找到 **Labels** 区域
3. 点击 **Add Label**
4. 填写：Key = `type`，Value = `control-plane`
5. 保存

Labels 会被 Provision Worker 用来识别和过滤服务器，也用于账单分析。

---

## 为什么不建议按"SaaS 功能"拆项目

有些团队习惯按服务拆 Hetzner 项目（如"网站项目"和"计算项目"分开），但在这个架构下有明确缺点：

| 场景 | 同项目 | 跨项目 |
|------|-------|-------|
| Private Network 互通 | ✅ 原生支持 | ❌ 不支持，需走公网 |
| 统一 SSH Key 管理 | ✅ | ❌ 需要在两个项目各自配置 |
| 统一 Firewall 规则 | ✅ | ❌ 各自独立 |
| Snapshot 跨服务器使用 | ✅ | ❌ Snapshot 不跨项目 |
| API Token 权限范围 | 一个 Token 管所有 | 需要两个 Token |
| 账单汇总 | 一张账单 | 分两张（但可以用 Label 分类统计） |

结论：**网络互通是硬约束，必须同项目。** 账单分类用 Label 解决即可。
