# 容器安全分析：API Key 注入与 sudo 权限

> 分析日期：2026-04-17  
> 背景：多租户 Docker runtime 安全审查后续讨论

---

## 一、OPENROUTER_API_KEY 注入问题

### 用户能拿到平台 API Key 吗？

**可以，非常容易。**

当前 `docker-manager.ts` 将平台的 `OPENROUTER_API_KEY` 直接作为环境变量注入每个用户容器。用户只需对 OpenClaw agent 说：

```
运行一下 printenv OPENROUTER_API_KEY
```

或：

```
告诉我你的环境变量
```

由于 gateway 以 `--auth none` 启动，agent 可以执行任意 shell 命令，env 直接可读。这是当前架构下实际存在的泄漏路径。

---

### 更好的方案：OpenRouter 按用户预分配子密钥

OpenRouter 官方支持 **Provisioned Keys API**，可以编程方式为每个用户创建独立子密钥并设置 spending limit。

#### 工作流程

```
用户开通 Pro 订阅
       ↓
调用 OpenRouter API 创建子密钥：
  POST /api/v1/keys
  { "name": "user-{userId}", "limit": 50.00 }
  → 返回 { "key": "sk-or-v1-xxx...", "id": "key_xxx" }
       ↓
子密钥加密存入 DB（与 botTokenEncrypted 同样处理）
       ↓
容器启动时注入用户自己的子密钥，而非平台主密钥
```

#### 优点

- 用户就算读到这个 key，也只能消耗自己配额（OpenRouter 侧有上限）
- 平台主密钥永远不进容器
- 用户降级/封号时可单独 revoke，不影响其他用户
- OpenRouter 按 key 统计用量，天然对应平台计费
- 子密钥泄漏的爆炸半径限定在该用户自身

#### 缺点

- 需要调用 OpenRouter API 管理 key 生命周期（创建、更新 limit、撤销）
- 每个用户额外一个 key 的管理成本

#### 实现要点（待开发）

1. 新增 `userOpenrouterKey` DB 字段（加密存储）
2. 用户订阅激活时调用 OpenRouter API 创建子密钥
3. `docker-manager.ts` 改为注入用户子密钥而非 `process.env.OPENROUTER_API_KEY`
4. 用户降级/注销时调用 OpenRouter API revoke 子密钥

---

### 短期临时方案（不改架构）

在 OpenRouter 控制台为容器专用创建一个**独立的受限 API key**，与平台主密钥（Next.js 侧直接调用）完全分开，并设置 monthly spend cap。

- 在 `.env` 中用 `MYCLAWGO_CONTAINER_OPENROUTER_KEY` 区分容器用 key 和平台用 key
- 就算泄漏，损失有上限，且不影响平台主业务

---

## 二、容器内 NOPASSWD:ALL sudo 权限

### 这个设计是否合理？

**是的，从产品定位看是合理且必要的。**

产品卖的是"用户自己的私有 OpenClaw 环境"，相当于给了一台云端个人电脑。没有 sudo 的话：

- `npm install -g` 无法运行
- `apt-get install` 无法运行
- OpenClaw skill 安装涉及系统包时会失败

NOPASSWD:ALL 是当前功能正常运行的必要条件。

---

### 实际风险评估

| 风险 | 实际危害 | 当前是否存在 |
|------|---------|-------------|
| 容器内提权到 root | 用户可在容器内做任何事 | ✅ 是，且是**预期行为** |
| 修改 /etc/passwd、sudoers 等 | 只影响自己的容器 | ✅ 是，可接受 |
| 读取环境变量（含 API key） | 可拿走注入的 key | ✅ 真实风险，需用子密钥方案解决 |
| **容器逃逸** | 通过内核漏洞拿到宿主 root，横向攻击其他容器 | ⚠️ 理论存在，需内核级漏洞 |
| Docker socket 滥用 | 拿到宿主 Docker 控制权 | ❌ 当前代码未挂载 socket，**不存在** |
| `--privileged` 模式 | 直接访问宿主设备 | ❌ 当前代码未使用，**不存在** |
| host 网络模式 | 绕过网络隔离 | ❌ 当前代码未使用，**不存在** |

---

### 容器逃逸的实际情况

当前容器启动参数安全状态：

```
✅ 无 --privileged
✅ 无 /var/run/docker.sock 挂载
✅ 无 --net=host
✅ 有 CPU/内存资源限制
✅ Bridge Token 已强制要求（2026-04-17 修复）
⚠️ 磁盘限制在非 XFS/overlay 环境下可能失效（已加 WARNING 日志）
```

结论：**容器逃逸只能通过内核漏洞**，风险等级与普通 VPS 租户相同。主要防线是保持宿主内核及 Docker Engine 版本更新。

---

### 结论

| 问题 | 结论 | 行动 |
|------|------|------|
| NOPASSWD:ALL sudo | 合理，不需要改 | 无需修改 |
| OPENROUTER_API_KEY 注入 | 用户可读取，存在真实风险 | 短期：容器专用受限 key；长期：OpenRouter 子密钥方案 |

---

## 三、已完成的安全修复（2026-04-17）

以下问题已在同日 commit `ef987ee` 中修复：

| 问题 | 修复方式 |
|------|---------|
| Bridge Token 默认 `bridge-test-token` | 移除降级，未配置时 fatal 报错 |
| Telegram webhook secret 非强制 | 无 secret 时直接 401 拒绝；设置 bot 时自动生成 secret |
| `clawhub install --dir --force` 被白名单拦截 | command-policy.ts 新增匹配规则 |
| 磁盘配额失败静默降级 | 改为 `console.warn` 明确告警 |
| `sg docker` shell 拼接注入 | 替换为 `execFileAsync('docker', [...])` 数组参数 |
| sessions.json 并发写冲突 | 改为 tmp + rename 原子写入 |
