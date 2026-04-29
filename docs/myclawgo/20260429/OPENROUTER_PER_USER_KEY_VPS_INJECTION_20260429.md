# OpenRouter 每用户 Key 注入 VPS 方案（2026-04-29）

## 背景

每个付费用户通过 OpenRouter Management API 获得一个独立的子 Key，有月度限额。
该机制在 Docker 模式下已完整实现，但 VPS 模式（Hetzner auto-provision）下还缺最后一步：
将 OpenRouter Key 写入 VPS 上的 `auth-profiles.json`，让 openclaw-gateway 能调用 AI。

---

## 现状梳理

### 已有（可直接复用）

| 组件 | 路径 | 说明 |
|------|------|------|
| Key 创建/更新/吊销 | `src/lib/myclawgo/openrouter-key-provisioner.ts` | 完整实现 |
| DB 表 | `user_openrouter_key` | `key_encrypted`(AES-256-GCM) + `key_hash` + `limit_usd` |
| 加解密工具 | `src/lib/myclawgo/agent-config.ts` | `encryptConfigValue / decryptConfigValue` |
| Stripe 触发点 | `src/payment/provider/stripe.ts` L823 | `invoice.paid` → `provisionUserOpenrouterKey(userId)` |
| Key 吊销触发点 | `src/payment/provider/stripe.ts` L1099 | 订阅到期 → `revokeUserOpenrouterKey(userId)` |
| Docker 注入实现 | `src/lib/myclawgo/docker-manager.ts` | `updateContainerAuthProfile()` — 写 auth-profiles.json 并重启 gateway |
| auth-profiles.json 格式 | docker-manager.ts L224-235 | 见下方格式说明 |

### 测试环境当前状态

用户 `yYUWTprT5vuc7PEHssz1dfHtK2hp7SYB` 已有 OpenRouter sub-key：
```
key_hash: e575a542c44c5b6ba37679d4b425b3766c1c8b73efb334cb0b435a76797dde47
limit_usd: 15（Pro 套餐）
created_at: 2026-04-26（支付时自动创建）
```

VPS 上 `/home/openclaw/.openclaw/agents/main/agent/` 目录只有 `models.json`，
**缺少 `auth-profiles.json`** → 所有 AI 调用失败。

---

## auth-profiles.json 格式

（来自 `docker-manager.ts:updateContainerAuthProfile`）

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

路径：`/home/openclaw/.openclaw/agents/main/agent/auth-profiles.json`
归属：`openclaw:openclaw`

---

## 需要修改的地方

### 1. `register/route.ts` — 部署时注入 auth-profiles.json（核心改动）

在 `deployBridgeToVps` 函数中增加一个参数 `openrouterKey`，在 bridge 部署完成后，
通过 SSH 将 auth-profiles.json 写入 VPS 并重启 gateway。

**位置**：`src/app/api/internal/runtime/register/route.ts`

**改动**：

```typescript
// 1. deployBridgeToVps 增加 openrouterKey 参数
async function deployBridgeToVps(
  publicIp: string,
  bridgeToken: string,
  openrouterKey: string,   // ← 新增
) {
  // ...现有 SCP + npm install + service 修复...

  // 2. 追加写入 auth-profiles.json 的 SSH 命令
  const authProfile = buildAuthProfileJson(openrouterKey);
  const authProfileB64 = Buffer.from(authProfile).toString('base64');

  await execAsync(
    `${sshBase} "
      mkdir -p /home/openclaw/.openclaw/agents/main/agent && \
      printf '%s' ${shellQuote(authProfileB64)} | base64 -d > /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json && \
      chown -R openclaw:openclaw /home/openclaw/.openclaw/agents/main/agent && \
      systemctl restart openclaw-gateway
    "`,
    { timeout: 60_000 }
  );
}

// 3. 新增工具函数
function buildAuthProfileJson(apiKey: string): string {
  return JSON.stringify(
    {
      version: 1,
      profiles: {
        'openrouter:default': {
          type: 'api_key',
          provider: 'openrouter',
          key: apiKey,
        },
      },
      lastGood: { openrouter: 'openrouter:default' },
      usageStats: {},
    },
    null,
    2
  );
}

// 4. POST handler 中获取 key 并传入
import { getUserOpenrouterKey } from '@/lib/myclawgo/openrouter-key-provisioner';

// 在 deployBridgeToVps 调用前：
const openrouterKey =
  (await getUserOpenrouterKey(userId)) ?? process.env.OPENROUTER_API_KEY ?? '';

await deployBridgeToVps(publicIp, host.bridgeToken!, openrouterKey);
```

---

### 2. Key 更新时同步到 VPS（后续功能，暂不实现）

当用户升级/降级套餐，`provisionUserOpenrouterKey` 会更新 DB 中的 key 限额，
但 VPS 上的 `auth-profiles.json` 不会自动更新（key 本身不变，只是限额变化，
OpenRouter 侧已更新，auth-profiles.json 无需重写）。

**如果将来 key 本身需要轮换**（安全策略/用户撤销重建），需要：
1. 记录 `runtimeHost.public_ip`
2. SSH 写入新 auth-profiles.json 并 `systemctl restart openclaw-gateway`
3. 或通过 bridge 提供一个 `/admin/reload-auth` 内部端点（更干净）

当前版本：key 一旦创建不会轮换，暂不需要处理。

---

### 3. 回退策略

如果 `getUserOpenrouterKey` 返回 null（key 未创建或 DB 异常），fallback 到：
- `process.env.OPENROUTER_API_KEY`（平台公共 key，无限额保护）
- 若两者都为空，部署照常进行，auth-profiles.json 不写入，gateway 在 `--allow-unconfigured` 下运行但 AI 调用会失败（与现状一致）

---

## 实施步骤

### Step 1：修改 register/route.ts（一次改动）

1. 新增 `buildAuthProfileJson(apiKey)` 工具函数
2. `deployBridgeToVps` 增加 `openrouterKey` 参数，在 gateway restart 前写入 auth-profiles.json
3. POST handler 中 `await getUserOpenrouterKey(userId)` 获取 key，传入 `deployBridgeToVps`

### Step 2：修复当前 VPS（手动执行一次）

测试环境 VPS（178.105.21.96）已运行，无需重新 provision。
直接手动写入 auth-profiles.json 并重启 gateway：

```bash
# 本地执行
KEY=$(node -e "
const { decryptConfigValue } = require('./src/lib/myclawgo/agent-config');
// 或通过脚本从 DB 读取 key_encrypted 后解密
")

ssh -i ~/.ssh/myclawgo_runtime root@178.105.21.96 'cat > /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json << EOF
{
  "version": 1,
  "profiles": {
    "openrouter:default": {
      "type": "api_key",
      "provider": "openrouter",
      "key": "<解密后的 key>"
    }
  },
  "lastGood": { "openrouter": "openrouter:default" },
  "usageStats": {}
}
EOF
chown openclaw:openclaw /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json
systemctl restart openclaw-gateway'
```

### Step 3：验证

```bash
# gateway 日志应出现 ready 而不是 "No API key found"
journalctl -u openclaw-gateway -n 20
# 发送一条测试消息，验证 AI 响应正常
```

---

## 方案影响面

| 文件 | 改动类型 | 风险 |
|------|----------|------|
| `src/app/api/internal/runtime/register/route.ts` | 修改 | 低 — 仅在 VPS deploy 时执行 |
| `src/lib/myclawgo/openrouter-key-provisioner.ts` | 不改 | — |
| `src/lib/myclawgo/docker-manager.ts` | 不改 | — |

**改动范围极小**，只在 `register/route.ts` 的 `deployBridgeToVps` 函数末尾追加写 auth-profiles.json 的 SSH 命令，与现有逻辑完全隔离。

---

## 限额配置参考

| 套餐 | limitUsd/月 |
|------|-------------|
| Pro | $15 |
| Premium | $30 |
| Ultra | $100 |

来源：`openrouter-key-provisioner.ts` 中的 `TIER_LIMIT_USD`。
