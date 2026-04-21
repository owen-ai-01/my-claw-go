# OpenClaw 自动化部署最佳实践

> 整理时间：2026-04-21  
> 适用场景：MyClawGo 及同类 SaaS 平台（每用户一容器模式）

---

## 目录

1. [安装方式](#1-安装方式)
2. [多租户隔离模型选择](#2-多租户隔离模型选择)
3. [容器配置最佳实践](#3-容器配置最佳实践)
4. [auth-profiles.json 注入模式](#4-auth-profilesjson-注入模式)
5. [Gateway 进程管理](#5-gateway-进程管理)
6. [Gateway 就绪检测](#6-gateway-就绪检测)
7. [安全加固清单](#7-安全加固清单)
8. [已知坑和绕过方案](#8-已知坑和绕过方案)
9. [监控与运维](#9-监控与运维)
10. [MyClawGo 当前实现对应关系](#10-myclawgo-当前实现对应关系)

---

## 1. 安装方式

### 官方推荐安装

```bash
# 脚本安装（macOS/Linux/WSL2）
curl -fsSL https://openclaw.ai/install.sh | bash

# npm 全局安装
npm i -g openclaw
# 或
pnpm add -g openclaw

# 初始化（交互式）
openclaw onboard --install-daemon

# 非交互式/自动化安装
openclaw onboard --no-onboard
```

**运行环境要求：**
- Node.js 24（最低 Node 22.14+）
- 内存：运行时 ≥512 MB，镜像构建时 ≥2 GB（1 GB 会 OOM/exit 137）
- **生产环境强烈推荐使用预构建镜像**，避免构建时 OOM

### 使用预构建镜像（推荐）

```bash
# 官方 GHCR 镜像，标签：main / latest / 版本号（如 2026.2.26）
OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:latest ./scripts/docker/setup.sh

# 或指定具体版本（MyClawGo 用法）
MYCLAWGO_OPENCLAW_NPM_SPEC=2026.3.8
```

---

## 2. 多租户隔离模型选择

| 隔离模型 | 安全性 | 月均成本/用户 | 复杂度 | 适用场景 |
|---|---|---|---|---|
| VM per user | 最强 | ~$15–30 | 低 | <20 用户，高安全要求 |
| **Container per user** | **好** | **~$5–15** | **中** | **20–100+ 用户（推荐）** |
| 共享 VM 多进程 | 弱 | ~$2–5 | 低 | 仅开发/测试 |
| Kubernetes namespace per user | 最强 | ~$3–5 (100用户均摊) | 高 | 100+ 用户，云原生 |

**MyClawGo 采用的是容器每用户模式**，这是 20–100+ 用户规模的最佳平衡。

### 容器命名规范

```
openclaw-{sessionId}   # MyClawGo 实际用法
openclaw-{username}    # 另一种常见方案
```

### 端口分配（如果需要对外暴露）

```
18800–18899  → 前 100 个用户槽位，存入 DB 追踪
```

> **MyClawGo 不暴露端口**，通过 `docker exec` 与 gateway 通信，更安全。

---

## 3. 容器配置最佳实践

### 关键环境变量

| 变量 | 用途 |
|---|---|
| `OPENCLAW_IMAGE` | 使用远程镜像而非本地构建 |
| `OPENCLAW_SANDBOX` | 启用 agent 沙箱（`1`/`true`） |
| `OPENCLAW_HOME_VOLUME` | 将 `/home/node` 持久化到命名卷 |
| `OPENCLAW_GATEWAY_BIND` | 绑定模式：`lan`/`loopback`/`custom`/`tailnet` |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway 认证 token（**用环境变量，不用配置文件**，见已知坑） |
| `OPENCLAW_HOME` | 自定义 home 目录路径 |
| `OPENCLAW_STATE_DIR` | 自定义状态存储目录 |

### docker run 推荐参数

```bash
docker run -d \
  --name "openclaw-{sessionId}" \
  --memory=2g \
  --cpus=1 \
  --memory-swap=2g \                    # 等于 memory，禁止 swap
  --storage-opt size=20g \              # 磁盘配额（需 XFS + overlay）
  --security-opt no-new-privileges \
  --cap-drop NET_RAW \
  --cap-drop NET_ADMIN \
  -v "{userDataDir}:/home/openclaw/.openclaw" \
  -v "{seedConfig}:/etc/openclaw/seed/openclaw.json:ro" \
  -e OPENCLAW_GATEWAY_TOKEN="{perUserToken}" \
  -e NODE_OPTIONS="--max-old-space-size=1536" \
  {IMAGE_NAME} \
  sleep infinity
```

### 按套餐分配资源（MyClawGo 实际配置）

| 套餐 | CPU | 内存 | 磁盘 |
|---|---|---|---|
| Pro | 1 核 | 2 GB | 20 GB |
| Premium | 2 核 | 4 GB | 40 GB |
| Ultra | 4 核 | 8 GB | 80 GB |

### 官方 docker-compose.yml 结构

```yaml
services:
  openclaw-gateway:
    image: ${OPENCLAW_IMAGE:-openclaw:local}
    ports:
      - "18789:18789"   # WebSocket gateway
      - "18790:18790"   # bridge
    restart: unless-stopped
    healthcheck:
      test: node -e "fetch('http://127.0.0.1:18789/healthz').then(r=>process.exit(r.ok?0:1))"
      interval: 30s
      timeout: 10s
    volumes:
      - config:/home/node/.openclaw
      - workspace:/home/node/.openclaw/workspace

  openclaw-cli:
    network_mode: service:openclaw-gateway   # 共享网络命名空间
    security_opt:
      - no-new-privileges
    cap_drop:
      - NET_RAW
      - NET_ADMIN
    tty: true
    stdin_open: true
    depends_on:
      openclaw-gateway:
        condition: service_healthy
```

---

## 4. auth-profiles.json 注入模式

### 文件路径

```
~/.openclaw/agents/{agentId}/agent/auth-profiles.json
# 默认 agentId 为 main：
/home/openclaw/.openclaw/agents/main/agent/auth-profiles.json
```

### 正确格式（2026.2.19 后）

```json
{
  "version": 1,
  "profiles": {
    "openrouter:default": {
      "type": "api_key",
      "provider": "openrouter",
      "key": "sk-or-..."
    }
  },
  "lastGood": { "openrouter": "openrouter:default" },
  "usageStats": {}
}
```

> **注意**：2026.2.19 字段从 `token` 改为 `key`（旧版本同时接受两者，有弃用警告）

### 推荐注入方式：base64 管道

```bash
# 生成 JSON → base64 编码 → docker exec 写入 → 重启 gateway
B64=$(echo '{"version":1,"profiles":{"openrouter:default":{"type":"api_key","provider":"openrouter","key":"sk-or-xxx"}}}' | base64 -w0)

docker exec {containerName} bash -c "
  printf '%s' '${B64}' | base64 -d > /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json \
  && chown openclaw:openclaw /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json \
  && pkill -f openclaw-gateway || true
"
```

**为什么用 base64？**
- 避免 JSON 中的引号、换行等特殊字符破坏 shell 命令
- 避免 API Key 出现在 `ps aux` 进程参数中（安全）
- 避免 shell history 记录明文 key

**为什么写完要 pkill gateway？**
- gateway 进程把 key 缓存在内存中，会周期性写回 `auth-profiles.json`
- 直接写文件后不重启，gateway 会用旧的内存缓存覆盖新文件
- `pkill -f openclaw-gateway || true` 杀死 gateway 后，`keep-gateway.sh` 循环会重启它，重启时从磁盘重新读取文件

### 不支持的方式

```bash
# ❌ 不支持环境变量替换（Issue #7254，已关闭 NOT_PLANNED）
{
  "profiles": {
    "openrouter:default": {
      "key": "${OPENROUTER_API_KEY}"   # 不生效！
    }
  }
}

# ❌ 不要用 echo 直接写（引号转义问题）
docker exec {container} bash -c "echo '{...}' > auth-profiles.json"
```

---

## 5. Gateway 进程管理

### keep-gateway.sh 模式（容器内推荐）

```bash
#!/bin/bash
# 无限循环重启 gateway，类似 supervisord 的轻量替代
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=1536"

while true; do
  /usr/local/bin/openclaw gateway run \
    --allow-unconfigured \
    --auth none \
    --bind loopback \
    --port 18789 \
    >> /home/openclaw/.openclaw/gateway.log 2>&1
  sleep 2    # 重启延迟，防止 CPU 占用过高
done
```

**关键参数说明：**
- `--allow-unconfigured`：key 未配置时也能启动（避免先写 key 再启 gateway 的时序问题）
- `--auth none`：内部通信无需认证（通过 loopback 绑定保证安全）
- `--bind loopback`：只监听 127.0.0.1，不对外暴露

**注入并启动：**

```bash
# 写入脚本（仅首次，文件不存在时）
docker exec {container} bash -c "
  [ -f /home/openclaw/keep-gateway.sh ] || printf '%s' '$(cat keep-gateway.sh | base64 -w0)' | base64 -d > /home/openclaw/keep-gateway.sh
  chmod +x /home/openclaw/keep-gateway.sh
"

# 检查是否已在运行
docker exec {container} pgrep -f keep-gateway.sh >/dev/null 2>&1

# 后台启动（以 openclaw 用户身份）
docker exec -d --user openclaw {container} /home/openclaw/keep-gateway.sh
```

### systemd 方式（裸金属/VPS）

```ini
# /etc/systemd/system/openclaw-gateway.service
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/opt/openclaw/.env
WorkingDirectory=/root/.openclaw
ExecStart=/usr/bin/openclaw gateway --force
Restart=always
RestartSec=2
User=openclaw

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now openclaw-gateway.service
```

### systemd Watchdog 定时器（可选增强）

```ini
# ~/.config/systemd/user/openclaw-gateway-watchdog.service
[Service]
Type=oneshot
ExecStart=%h/.local/bin/openclaw-gateway-watchdog.sh
Environment=FAIL_THRESHOLD=2
Environment=HEALTH_TIMEOUT_MS=8000

# ~/.config/systemd/user/openclaw-gateway-watchdog.timer
[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true
```

```bash
loginctl enable-linger $USER   # 用户级别服务开机自启
```

### 信号处理

| 信号 | 作用 |
|---|---|
| `SIGUSR1` | 优雅重启（in-process reload） |
| `SIGTERM` | 优雅关闭 |
| `pkill -f openclaw-gateway` | 强制终止（keep-gateway.sh 会自动重启） |

---

## 6. Gateway 就绪检测

### 健康检测端点（无需认证）

```
GET http://127.0.0.1:18789/healthz   → liveness（进程是否活着）
GET http://127.0.0.1:18789/readyz    → readiness（是否准备好处理请求）
```

### CLI 检查方式

```bash
# 进程是否存在
pgrep -f 'keep-gateway.sh|openclaw gateway run' >/dev/null 2>&1

# 日志中确认监听
grep '\[gateway\] listening on ws://127.0.0.1:18789' /home/openclaw/.openclaw/gateway.log

# 通过 CLI 调用（最可靠）
openclaw gateway call health --json
```

### 轮询等待模式（MyClawGo 实际用法）

```ts
// 最多 10 次，每次间隔 1.5 秒
for (let i = 0; i < 10; i++) {
  const result = await dockerExec(containerName, 'openclaw gateway call health --json');
  if (result.includes('"ok":true')) break;
  await sleep(1500);
}
// 超时后回退到 --local 模式
```

---

## 7. 安全加固清单

### 容器层

- [x] 以非 root 用户运行（容器内 `openclaw` 用户，uid 1001）
- [x] `--cap-drop NET_RAW --cap-drop NET_ADMIN`
- [x] `--security-opt no-new-privileges`
- [x] Gateway 只绑定 loopback（`--bind loopback`），不暴露端口
- [x] `--memory-swap` 等于 `--memory`，禁止 swap 滥用
- [x] `--storage-opt size=` 磁盘配额（需 XFS + overlay）
- [ ] `--read-only` 容器根文件系统（仅数据卷可写）

### 密钥管理

- [x] 平台主 API key 永不注入用户容器，使用 per-user 子 key
- [x] 子 key 加密存储于 DB（AES-256）
- [x] 通过 base64 管道写入，key 不出现在进程参数中
- [x] `OPENCLAW_GATEWAY_TOKEN` 用环境变量，不用配置文件
- [x] 订阅取消时吊销对应子 key

### 网络隔离

- [x] Docker bridge 网络隔离（容器间无法互访）
- [x] 通过 `docker exec` 通信，无需暴露 18789 端口
- [ ] Kubernetes 场景：每 namespace NetworkPolicy 隔离
- [ ] 对外路由：Caddy/Nginx path-based proxy，不直接暴露 gateway

### 数据隔离

- [x] 每用户独立 `~/.openclaw` volume
- [x] 种子配置以只读方式挂载（`:ro`）
- [x] 容器之间的数据目录不共享

### CVE 注意

- **CVE-2026-25253**（CVSS 8.8）：精心构造的 prompt 可触发命令注入，升级至 2026.1.2.3+ 修复

---

## 8. 已知坑和绕过方案

### 坑1：Gateway 在容器内无法用 `openclaw gateway restart/stop`

**原因：** 容器内没有 systemd，`isLoaded()` 返回 false。  
**解决：** 用 `pkill -f openclaw-gateway` 直接发信号，或 `kill -SIGUSR1 {pid}`。PR #39355 已修复（需更新版本）。

---

### 坑2：Gateway 覆盖 auth-profiles.json

**原因：** gateway 进程把 key 缓存在内存，会周期性写回文件。  
**解决：** 写完文件后立即 `pkill -f openclaw-gateway`，让 keep-gateway.sh 重启时从磁盘读取。

---

### 坑3：`openclaw update` / `openclaw doctor` 删除 gateway.auth 配置

**原因：** 这些命令做全量替换而非深度合并，会丢弃 `openclaw.json` 中的 `gateway.auth` 块。  
**解决：** 改用 `OPENCLAW_GATEWAY_TOKEN` 环境变量（新版本已改为深度合并）。

---

### 坑4：auth-profiles.json 不支持环境变量替换

**原因：** Issue #7254 被关闭为 `NOT_PLANNED`。  
**解决：** 必须以编程方式写入明文 key，使用 base64 编码避免安全风险。

---

### 坑5：2026.3.7 breaking change — gateway.auth.mode

**现象：** 同时设置了 token 和 password 时，gateway 启动失败。  
**解决：** 显式设置 `gateway.auth.mode` 为 `token` 或 `password`。

---

### 坑6：`--storage-opt size=` 在非 XFS 主机上静默失效

**原因：** 需要 XFS 文件系统 + overlay driver 才生效。  
**解决：** 检测主机文件系统类型；不满足条件时用主机级别 quota 替代方案（如 `xfs_quota`），或监控磁盘用量并主动清理。

---

### 坑7：Gateway 锁冲突导致无限重启

**原因：** 并发启动时 lock 文件冲突，exit 1 触发 keep-gateway.sh 立刻重试，形成死循环。  
**解决：** 已在 commit `beadd4c553` 修复（改为 wait/retry）。升级 openclaw 版本即可。

---

### 坑8：镜像构建时 OOM（exit 137）

**原因：** npm install 需要 ≥2 GB 内存，1 GB VPS 必然 OOM。  
**解决：** 生产环境始终用预构建镜像（`OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:latest`），不要在用户机器/小内存 VPS 上构建。

---

### 坑9：userDataDir 权限问题（容器用户 vs 宿主机用户）

**现象：** 容器内 openclaw 用户（uid 1001）创建的文件，宿主机进程（uid 1000）无法读取。  
**解决：**
```bash
# 方案A：chmod 修正权限
sudo chmod 755 {userDataDir}

# 方案B（推荐）：不依赖从宿主机读取容器内文件，改用 docker exec
# MyClawGo 的修复：删除 fs.access 检查，改为只验证 session + container 是否存在
```

---

## 9. 监控与运维

### 健康状态检查

```bash
# 容器状态
docker inspect --format='{{.State.Health.Status}}' {containerName}

# 资源使用
docker stats --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}" --no-stream

# Gateway 日志最后 100 行
docker exec {container} tail -100 /home/openclaw/.openclaw/gateway.log
```

### 日志轮转配置

```json
// /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
```

### 常见运维操作

```bash
# 手动更新单个用户的 API key
docker exec {container} bash -c "
  printf '%s' '{b64}' | base64 -d > /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json \
  && pkill -f openclaw-gateway || true
"

# 查看 gateway 是否在运行
docker exec {container} pgrep -f 'openclaw-gateway' && echo "running" || echo "stopped"

# 强制重启用户 gateway
docker exec {container} pkill -f openclaw-gateway || true

# 清理僵尸锁文件（agent 异常退出后留下的 .jsonl.lock）
docker exec {container} bash -c "
  for lockfile in /home/openclaw/.openclaw/projects/**/*.jsonl.lock; do
    pid=\$(cat \"\$lockfile\" 2>/dev/null)
    kill -0 \"\$pid\" 2>/dev/null || rm -f \"\$lockfile\"
  done
"
```

### Kubernetes 部署参考（大规模）

AWS EKS 样例（[aws-samples/sample-openclaw-multi-tenant-platform](https://github.com/aws-samples/sample-openclaw-multi-tenant-platform)）：

- 每用户一个 Kubernetes namespace：`openclaw-{tenant}`
- 每 namespace 包含：Deployment + Service + ConfigMap + HTTPRoute + NetworkPolicy + PodDisruptionBudget
- KEDA scale-to-zero：冷启动 15–30 秒
- EFS PVC（RWX）跨扩缩容持久化数据
- Amazon Cognito post-signup Lambda 自动创建 namespace
- 成本参考：3 租户约 $243/月，100 租户约 $331–418/月

---

## 10. MyClawGo 当前实现对应关系

| 最佳实践 | MyClawGo 实现位置 | 状态 |
|---|---|---|
| 容器每用户 | `docker-manager.ts` → `ensureUserContainer` | ✅ |
| 按套餐资源限制 | `docker-manager.ts` → `RESOURCE_LIMITS` | ✅ |
| base64 注入 auth-profiles.json | `docker-manager.ts` → `updateContainerAuthProfile` | ✅ |
| 写 key 后重启 gateway | `updateContainerAuthProfile` → `pkill -f openclaw-gateway` | ✅ |
| keep-gateway.sh 循环 | `docker-manager.ts` → `ensureGatewayForContainer` | ✅ |
| Gateway 就绪轮询 | `docker-manager.ts` → `runOpenClawChatInContainer` | ✅ |
| Per-user 子 key（不暴露主 key） | `openrouter-key-provisioner.ts` | ✅ |
| 子 key 按套餐限额 | Pro=$15/mo, Premium=$30/mo, Ultra=$100/mo | ✅ |
| 容器去重锁 | `ensureContainerLocks` Map | ✅ |
| 僵尸锁文件清理 | `runOpenClawChatInContainer` 内 lock 清理 | ✅ |
| 种子配置只读挂载 | `docker run -v seed:ro` | ✅ |
| loopback 绑定 | `--bind loopback --port 18789` | ✅ |
| 磁盘配额 (storage-opt) | `--storage-opt size=` (graceful fallback) | ✅ |
| Gateway token 环境变量 | `OPENCLAW_GATEWAY_TOKEN` per container | ✅ |
| 容器内非 root 运行 | `--user openclaw` | ✅ |
| `OPENCLAW_GATEWAY_TOKEN` env var | 待确认是否注入 | ⚠️ |
| `--read-only` 根文件系统 | 未实现 | ❌ |
| Kubernetes 支持 | 未实现（当前规模不需要） | — |

---

## 参考资料

- [OpenClaw 官方文档 - 安装](https://docs.openclaw.ai/install)
- [OpenClaw 官方文档 - Docker](https://docs.openclaw.ai/install/docker)
- [OpenClaw 官方文档 - Gateway 协议](https://docs.openclaw.ai/gateway/protocol)
- [OpenClaw 官方文档 - 认证](https://docs.openclaw.ai/gateway/authentication)
- [GitHub - openclaw/openclaw](https://github.com/openclaw/openclaw)
- [ClawTank - 多租户 Docker 指南](https://clawtank.dev/blog/openclaw-multi-tenant-docker-guide)
- [AWS Samples - OpenClaw 多租户平台 (EKS)](https://github.com/aws-samples/sample-openclaw-multi-tenant-platform)
- [GitHub Issue #36137 - 容器内 restart/stop 失败](https://github.com/openclaw/openclaw/issues/36137)
- [GitHub Issue #52922 - Gateway 锁冲突](https://github.com/openclaw/openclaw/issues/52922)
- [GitHub Issue #13835 - update 后丢失 gateway.auth](https://github.com/openclaw/openclaw/issues/13835)
- [GitHub Issue #7254 - auth-profiles.json 不支持环境变量](https://github.com/openclaw/openclaw/issues/7254)
- [Medium - 构建 OpenClaw Gateway 自动恢复系统](https://medium.com/@automateandtweak/how-to-build-an-auto-recovery-system-for-the-openclaw-gateway-bcf959c45728)
- [Medium - 防止 OpenClaw Gateway 随机停止](https://skorudzhiev.medium.com/prevent-your-openclaw-gateway-from-randomly-stopping-30ecd396415f)
- [LumaDock - OpenClaw systemd 持久运行](https://lumadock.com/tutorials/openclaw-systemd-discord-qwen-free-model)
- [Simon Willison's TIL - 在 Docker 中运行 OpenClaw](https://til.simonwillison.net/llms/openclaw-docker)
