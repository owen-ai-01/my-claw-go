# OpenRouter 用户 Key 防泄露方案 - 2026-05-05

## 背景

当前架构是：

- 每个付费用户一个独立 VPS。
- 每个用户一个独立 OpenRouter sub-key。
- App 通过 OpenRouter Management API 创建 / 更新 / 吊销用户 key。
- key 加密存储在 `user_openrouter_key.key_encrypted`。
- VPS 初始化时，App 解密 key，并写入 VPS 上的：

```text
/home/openclaw/.openclaw/agents/main/agent/auth-profiles.json
```

当前 `auth-profiles.json` 中包含明文 OpenRouter key：

```json
{
  "version": 1,
  "profiles": {
    "openrouter:default": {
      "type": "api_key",
      "provider": "openrouter",
      "key": "<用户 OpenRouter sub-key>"
    }
  },
  "lastGood": { "openrouter": "openrouter:default" },
  "usageStats": {}
}
```

相关代码：

- `src/lib/myclawgo/openrouter-key-provisioner.ts`
- `src/app/api/internal/runtime/register/route.ts`
- `src/lib/myclawgo/docker-manager.ts`

## 关键结论

如果用户能拿到 VPS 的 SSH / root / shell 权限，就无法真正阻止用户获取当前写入 VPS 的 OpenRouter key。

原因很直接：

- key 明文存在于 `auth-profiles.json`。
- 即使改文件权限，运行 OpenClaw gateway 的进程仍然需要读取 key。
- 如果用户能以同一系统用户执行命令，或能让 agent 工具读取文件，就可能读出 key。
- 如果用户是 root，任何本机文件、环境变量、进程参数、网络请求都可以被读取或抓取。

所以要实现“用户不能获取 key”，不能把真实 OpenRouter key 放到用户可控的 VPS 上。

## 目标安全边界

目标不是“用户完全不能使用模型”，而是：

1. 用户可以通过 MyClawGo 使用 OpenClaw。
2. 用户不能看到、复制、导出 OpenRouter sub-key。
3. 即使用户诱导 agent 读文件，也读不到真实 key。
4. 用户取消订阅后，平台可以立即切断模型访问。
5. 每个用户仍然有独立 OpenRouter spending limit / usage 隔离。

## 推荐方案：平台侧 OpenRouter Proxy，不把真实 key 下发到 VPS

### 核心思路

真实 OpenRouter key 只保留在 MyClawGo App / DB 中。

VPS 不保存真实 key。VPS 上的 OpenClaw 请求不直接打到 OpenRouter，而是打到 MyClawGo 控制平面的内部代理：

```text
OpenClaw Gateway on user VPS
  -> MyClawGo OpenRouter Proxy
  -> OpenRouter API
```

代理根据 Bridge token / runtime allocation 识别 userId，再从 DB 读取并解密该用户的 OpenRouter sub-key，然后代用户请求 OpenRouter。

### 调用链

```text
用户 Web UI
  -> MyClawGo App
  -> 用户 VPS Bridge
  -> 用户 VPS OpenClaw Gateway
  -> MyClawGo OpenRouter Proxy
  -> OpenRouter
```

### 关键变化

当前：

```text
VPS 上保存真实 OpenRouter key
OpenClaw -> OpenRouter
```

改为：

```text
VPS 上只保存 MyClawGo runtime token / proxy token
OpenClaw -> MyClawGo Proxy -> OpenRouter
```

VPS 只能拿到一个平台内部 token。这个 token 只能访问 MyClawGo proxy，不能直接调用 OpenRouter。

## 具体设计

### 1. 新增 App 侧 OpenRouter Proxy API

建议新增：

```text
POST /api/internal/openrouter-proxy/v1/chat/completions
```

或兼容 OpenRouter / OpenAI 风格：

```text
POST /api/openrouter-proxy/api/v1/chat/completions
```

请求头：

```http
Authorization: Bearer <runtime proxy token>
X-MyClawGo-Runtime-User: <optional user id, only for logging>
```

服务端逻辑：

1. 校验 proxy token。
2. 通过 token 解析 `runtimeAllocation.userId`。
3. 校验 allocation 状态必须为 `ready`。
4. 读取 `user_openrouter_key.key_encrypted`。
5. 解密得到 OpenRouter sub-key。
6. 转发请求到：

```text
https://openrouter.ai/api/v1/chat/completions
```

7. 使用用户 sub-key 填充：

```http
Authorization: Bearer <decrypted user OpenRouter sub-key>
```

8. 将 OpenRouter 响应原样返回给 VPS。

### 2. VPS 只保存 proxy token，不保存 OpenRouter key

当前 `register/route.ts` 中会写入真实 OpenRouter key：

```ts
printf '%s' <authProfileB64> | base64 -d > auth-profiles.json
```

需要改为写入一个“非 OpenRouter key”的 proxy token。

方案 A：如果 OpenClaw 支持自定义 OpenAI-compatible base URL

将 provider 指向 MyClawGo proxy：

```json
{
  "version": 1,
  "profiles": {
    "openrouter:default": {
      "type": "api_key",
      "provider": "openrouter",
      "key": "<myclawgo-runtime-proxy-token>",
      "baseUrl": "https://myclawgo.com/api/openrouter-proxy/api/v1"
    }
  },
  "lastGood": { "openrouter": "openrouter:default" },
  "usageStats": {}
}
```

需要确认 OpenClaw 当前 auth profile 是否支持 `baseUrl` / `baseURL` / `apiBase`。如果不支持，需要走方案 B。

方案 B：如果 OpenClaw 不支持自定义 base URL

在 VPS 上运行一个本地 OpenRouter-compatible proxy：

```text
127.0.0.1:19090/api/v1/chat/completions
```

OpenClaw 仍调用“本地代理”，本地代理再调用 MyClawGo App 的 proxy。VPS 本地代理只持有 runtime proxy token，不持有 OpenRouter key。

链路变成：

```text
OpenClaw -> 127.0.0.1 local proxy -> MyClawGo proxy -> OpenRouter
```

### 3. Proxy token 设计

不要复用 `bridgeToken` 直接访问模型代理，建议新增专用 token：

```text
runtimeAllocation.openrouterProxyToken
```

要求：

- 每个 user / VPS 单独生成。
- 至少 32 字节随机值。
- DB 中只存 hash，明文只在部署时写入 VPS。
- 支持 rotate。
- 支持 revoke。
- 只允许调用 OpenRouter proxy，不允许访问 Bridge 管理 API。

表字段建议：

```ts
openrouterProxyTokenHash: text('openrouter_proxy_token_hash')
openrouterProxyTokenRotatedAt: timestamp('openrouter_proxy_token_rotated_at', { withTimezone: true })
```

校验方式：

```text
sha256(token) == runtimeAllocation.openrouterProxyTokenHash
```

### 4. Proxy 侧必须做限流和余额校验

因为 VPS 仍然能调用 proxy token，所以必须在 proxy 侧加平台控制：

- 每用户 QPS 限制。
- 每用户并发限制。
- 每日 / 每小时请求上限。
- 根据套餐做限额。
- 调用前检查用户订阅状态。
- 调用前检查用户 credits / OpenRouter limit 状态。
- OpenRouter 返回 usage 后写入 billing audit。

即使 proxy token 被用户拿到，也只能在 MyClawGo 的限制内使用，不能直接拿去 OpenRouter 消费。

### 5. 网络出口限制

为了减少绕过路径，VPS 应限制直接访问 OpenRouter：

```text
禁止用户 VPS 直接访问 openrouter.ai
只允许访问 myclawgo.com / MyClawGo proxy
```

可以用：

- `ufw` / `iptables`
- Hetzner firewall
- 出站代理策略

注意：如果用户有 root 权限，这类限制可以被改掉。所以网络限制只在“用户没有 root / shell 权限”的托管模式下有效。

## 权限边界设计

### 不给用户 VPS shell 权限

MyClawGo 当前产品定位是托管 OpenClaw，不是“把 VPS 交给用户管理”。

建议明确产品边界：

- 用户不能 SSH 到 VPS。
- 用户不能拿 root。
- 用户不能直接执行任意 shell。
- Web UI 只暴露受控的 OpenClaw / Agent 操作。
- 命令执行 API 必须保持白名单。

这点非常关键：只要给用户 SSH/root，就不能承诺 key 不可见。

### 分离 Gateway 用户和工具执行用户

如果短期内仍必须在 VPS 上保存某种敏感 token，至少要避免 agent 工具直接读到：

```text
gateway 用户：openclaw-gateway
agent 工具用户：openclaw
```

敏感文件：

```text
/etc/myclawgo/openrouter-proxy.env
owner: openclaw-gateway
mode: 0400
```

OpenClaw gateway 以 `openclaw-gateway` 用户运行，agent 工具 / 用户文件操作以低权限 `openclaw` 用户运行。

但这只能降低 prompt/tool 读文件风险，不能解决 root 权限风险，也不能解决同进程泄露风险。长期仍应走平台 proxy。

## 不推荐方案

### 不推荐 1：只 chmod auth-profiles.json

例如：

```bash
chmod 600 auth-profiles.json
chown openclaw:openclaw auth-profiles.json
```

问题：

- OpenClaw gateway 能读，通常 agent 工具也可能以同一用户读。
- 用户如果能执行命令，也可能读到。
- root 一定能读。

### 不推荐 2：把 key 放环境变量

例如：

```bash
OPENROUTER_API_KEY=...
```

问题：

- 进程环境可能被同用户或 root 读取。
- systemd env 文件也需要落盘。
- 对用户 shell 权限没有本质防护。

### 不推荐 3：把 key 加密后放 VPS，再在本地解密

问题：

- VPS 上必须同时有解密逻辑和解密材料。
- 用户能拿到密文、解密程序、运行时内存或调用接口。
- 只是增加逆向成本，不是安全边界。

### 不推荐 4：继续 fallback 到平台公共 `OPENROUTER_API_KEY`

旧方案中如果用户 sub-key 不存在，会 fallback 到平台公共 key。

这不建议继续保留：

- 平台公共 key 一旦进入 VPS，风险更高。
- 没有 per-user spending limit。
- 泄露后影响全局。

建议：

```text
没有用户 sub-key => 不启动 AI 调用能力，返回明确错误并触发修复任务
```

## 分阶段实施方案

### Phase 0：立即止血

目标：减少当前明文 key 的暴露面。

1. 不给用户 SSH/root/shell。
2. 确认 Web UI 的命令执行能力仍然只允许白名单命令。
3. 移除 VPS 注入时对 `process.env.OPENROUTER_API_KEY` 的 fallback。
4. OpenRouter sub-key 必须设置严格 monthly limit。
5. 缩短 key rotate 周期，支持一键吊销 / 重建用户 key。
6. `auth-profiles.json` 文件权限收紧，至少避免 world-readable：

```bash
chown openclaw:openclaw /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json
chmod 0600 /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json
```

这一步不能保证用户拿不到 key，只是降低误暴露风险。

### Phase 1：实现 MyClawGo OpenRouter Proxy

目标：真实 OpenRouter key 不再下发到 VPS。

需要新增：

- App 侧 proxy route。
- runtime proxy token。
- token hash 存储。
- proxy 请求审计。
- proxy rate limit。
- proxy billing audit。

需要修改：

- `src/app/api/internal/runtime/register/route.ts`
  - 不再写真实 OpenRouter key。
  - 写入 proxy token / proxy base URL。
- `src/lib/myclawgo/openrouter-key-provisioner.ts`
  - 保持 key 创建和加密存储。
  - 不再向 runtime 注入明文 key。

### Phase 2：VPS 出站访问收敛

目标：让用户 runtime 只能通过 MyClawGo 控制面访问模型。

处理：

- 禁止 VPS 直连 `openrouter.ai`。
- 只允许到 MyClawGo App / proxy 域名。
- 对 proxy token 加 per-user / per-runtime 限制。

### Phase 3：权限隔离增强

目标：降低 agent 工具读取运行时敏感文件的风险。

处理：

- gateway 用户和 agent 工具用户分离。
- 敏感 runtime token 放到 `/etc/myclawgo/`，不放在 `/home/openclaw/.openclaw`。
- 用户 workspace 目录只放非敏感配置。
- 禁止 agent 工具读取 `/etc/myclawgo`。

## 推荐最终架构

```text
MyClawGo DB
  user_openrouter_key.key_encrypted
        |
        v
MyClawGo App / OpenRouter Proxy
  decrypt per-user OpenRouter key
  enforce subscription / credits / rate limit
        |
        v
OpenRouter API

User VPS
  OpenClaw Gateway
  stores only runtime proxy token
  never stores OpenRouter key
```

## 需要改动的文件

预计新增：

- `src/app/api/internal/openrouter-proxy/v1/chat/completions/route.ts`
- `src/lib/myclawgo/openrouter-proxy-token.ts`
- `src/lib/myclawgo/openrouter-proxy-forward.ts`

预计修改：

- `src/db/schema.ts`
  - 给 `runtimeAllocation` 增加 proxy token hash 字段。
- `src/app/api/internal/runtime/register/route.ts`
  - 不再写真实 OpenRouter key。
  - 改写 proxy token / proxy endpoint。
- `src/lib/myclawgo/openrouter-key-provisioner.ts`
  - 保持 key 管理，但移除“用于注入 runtime”的语义。
- `bridge` 部署配置
  - 如果需要本地 proxy，则新增本地 proxy 服务和 systemd unit。

## 验收标准

1. 新 VPS 上不存在真实 OpenRouter key：

```bash
grep -R "sk-or-" /home/openclaw /etc/myclawgo
```

应无结果。

2. `auth-profiles.json` 中不包含 OpenRouter key，只包含 proxy token 或 proxy provider 配置。

3. OpenClaw 聊天仍然可用。

4. MyClawGo proxy 日志能记录：

- userId
- runtimeAllocation id
- model
- status
- usage
- upstream latency

5. 取消订阅 / 吊销 runtime 后，proxy token 立即失效。

6. 即使 proxy token 泄露，也不能直接调用 OpenRouter，只能被 MyClawGo proxy 限制和审计。

## 最终判断

当前“把用户 OpenRouter key 写入用户 VPS”的方案，无法满足“用户不能获取 key”的要求。

要满足该要求，必须调整为：

```text
真实 OpenRouter key 只留在 MyClawGo 控制面；
用户 VPS 只拿受限 proxy token；
所有模型请求通过 MyClawGo OpenRouter Proxy 转发。
```

同时，产品层面必须明确：MyClawGo 提供托管 OpenClaw runtime，不向用户提供 VPS shell/root 权限。否则无法对 key 保密做出可靠承诺。
