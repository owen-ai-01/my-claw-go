# 测试环境全流程诊断报告（2026-04-29）

## 总体评估

| 层级 | 状态 | 说明 |
|------|------|------|
| 数据库 | ✅ 正常 | Neon PostgreSQL，18张表，数据一致 |
| Next.js 应用 | ✅ 运行中 | pm2 托管，provision worker 启动 |
| VPS（178.105.21.96） | ✅ 运行中 | Hetzner CX23，资源充裕 |
| openclaw-gateway | ✅ 运行中 | 端口 18789（loopback），已加 `--allow-unconfigured --auth none` |
| myclawgo-bridge | ✅ 运行中 | 端口 18080（公网），健康检查通过 |
| Bridge ↔ Gateway 连通性 | ✅ 正常 | `gatewayReachable: true` |
| **Gateway AI 认证** | ❌ 缺失 | `auth-profiles.json` 不存在，AI 调用会失败 |

---

## 一、VPS 基础设施

**主机**: `178.105.21.96`（Hetzner CX23，cx23，4核 / 8GB → 实测 3.7GB 可用）
**磁盘**: 38GB，已用 4.3GB（13%）
**负载**: 0.28（轻载）
**无 Swap**（正常，内存充裕）

### openclaw-gateway 服务
```
Active: active (running) since 2026-04-29 03:57:43 UTC
ExecStart: /usr/bin/openclaw gateway run --allow-unconfigured --auth none --bind loopback --port 18789
版本: 2026.4.11（最新 2026.4.26，可升级，非阻塞）
插件: acpx, browser, device-pair, phone-control, talk-voice (5个)
启动耗时: 5.6s
```

### myclawgo-bridge 服务
```
Active: active (running) since 2026-04-29 04:00:33 UTC
ExecStart: /usr/bin/node dist/server.js
端口: 0.0.0.0:18080（公网可达）
内存: 28.2MB
```

### Bridge 健康检查（外部访问）
```json
{
  "ok": true,
  "data": {
    "bridge": { "service": "openclaw-bridge", "version": "0.1.0" },
    "openclaw": { "installed": true, "gatewayReachable": true }
  }
}
```

---

## 二、数据库状态

### 用户
- 总用户数：1
- 邮箱：ouyanghuiping@gmail.com
- user_id：`yYUWTprT5vuc7PEHssz1dfHtK2hp7SYB`

### 支付
| 字段 | 值 |
|------|-----|
| scene | subscription |
| status | active |
| paid | true |
| period_end | 2026-05-26 |

### Runtime 表
| 表 | 状态 |
|----|------|
| runtimeHost | `ready`，public_ip: 178.105.21.96 |
| runtimeAllocation | `ready`，bridge_base_url: http://178.105.21.96:18080 |
| runtimeProvisionJob | `done`，attempt_count: 1 |

### 其他
- user_agent：0 条（用户未配置 agent，正常，首次使用时由 bridge 创建）
- user_chat_message：0 条（尚未发送消息）

---

## 三、Bridge API 端点验证

| 端点 | 结果 |
|------|------|
| `GET /health` | ✅ `{"ok":true,...}` |
| `GET /agents` | ✅ `{"ok":true,"data":{"defaultAgentId":"main","agents":[]}}` |
| `GET /agents/main` | ❌ 404 `AGENT_NOT_FOUND`（首次使用时会自动创建） |
| `GET /groups` | ✅ `{"ok":true,"data":{"groups":[]}}` |
| `GET /logs/recent` | ✅ `{"ok":true,"data":{"source":"bridge","lines":[]}}` |
| `GET /activity/recent` | ✅ `{"ok":true,"data":{"events":[]}}` |
| `GET /config` | ❌ 404（此路由未实现，前端未使用，非问题） |
| `GET /activity` | ❌ 404（同上，前端用 `/activity/recent`） |

---

## 四、已知问题

### 🔴 P0：auth-profiles.json 缺失（聊天会失败）

**现象**：
```
[gateway] lane task error: error="No API key found for provider "openai". 
Auth store: /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json"
```

**根因**：VPS 是从 Hetzner snapshot 创建的，snapshot 中没有 openclaw 的 AI provider 认证文件。openclaw-gateway 在 `--allow-unconfigured` 模式下能启动，但执行 agent 任务时仍需要 auth-profiles.json 中的 API key。

**影响**：用户发送任何聊天消息都会失败（gateway 无法调用 OpenAI / Anthropic 等 AI 提供商）。

**修复方案**：
在 `src/app/api/internal/runtime/register/route.ts` 的 `deployBridgeToVps` 中，SCP 部署完成后通过 SSH 写入 auth-profiles.json：

```typescript
// 在 npm install 之后追加
await execAsync(`${sshBase} "
  mkdir -p /home/openclaw/.openclaw/agents/main/agent && \
  cat > /home/openclaw/.openclaw/agents/main/agent/auth-profiles.json << 'AUTHEOF'
${buildAuthProfiles()}
AUTHEOF
  chown -R openclaw:openclaw /home/openclaw/.openclaw/agents/main/agent
"`);
```

`buildAuthProfiles()` 从平台 `.env`（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`GOOGLE_GENERATIVE_AI_API_KEY`）读取并生成 openclaw 格式的认证文件。

**临时修复（当前 VPS）**：手动将 auth-profiles.json 写入 VPS，再重启 gateway。

---

### 🟡 P1：VPS snapshot 未包含 openclaw-gateway 的正确 systemd 配置

**现象**：每次从 snapshot 创建新 VPS，openclaw-gateway 都会因缺少 `--allow-unconfigured` 导致 exit 78 失败。

**状态**：已在部署脚本（`register/route.ts`）中修复——deploy 时通过 `sed` 自动修正 service 文件。下次从 snapshot 创建的 VPS 会被自动修复。

**建议**：更新 snapshot，在 snapshot 中直接包含正确的 service 配置，避免每次部署时都依赖 sed 修复。

---

### 🟡 P2：Bridge 入口点 dist/index.js → dist/server.js 不匹配

**状态**：已修复。systemd service 文件已在部署脚本中通过 `sed` 自动修正，已提交代码。

---

### 🟡 P3：Bridge 借用 openclaw 内部 ws 模块路径硬编码

**根因**：`bridge/src/services/openclaw.ts` 原来 `require('/usr/local/lib/node_modules/openclaw/.../ws')` 但 npm 全局安装路径是 `/usr/lib/node_modules/openclaw/`。

**状态**：已修复，`ws` 作为正式依赖加入 `bridge/package.json`，通过正常 import 引入。已提交代码（commit `65ef9d2`）。

---

## 五、完整流程验证清单

| 步骤 | 状态 | 备注 |
|------|------|------|
| 1. 用户注册 | ✅ | Better Auth 正常 |
| 2. Stripe 支付 | ✅ | subscription active，period_end 2026-05-26 |
| 3. provision worker 触发 | ✅ | ENABLE_PROVISION_WORKER=true，30s 轮询 |
| 4. Hetzner VPS 创建 | ✅ | VPS ID 128049957，178.105.21.96 |
| 5. cloud-init 运行 | ✅ | 启动 gateway，回调 register endpoint |
| 6. register callback 接收 | ✅ | JWT 验证通过，publicIp 解析 |
| 7. bridge SCP 部署 | ✅ | dist + package.json 传输成功 |
| 8. npm install on VPS | ✅ | ws 等依赖已安装 |
| 9. gateway service 修正 | ✅ | 加入 --allow-unconfigured --auth none |
| 10. bridge service 启动 | ✅ | port 18080 监听，健康检查通过 |
| 11. DB 更新 ready | ✅（手动） | 本次手动执行，后续自动 |
| 12. 前端显示 workspace | ✅ | runtimeAllocation.status=ready |
| **13. 发送聊天消息** | ❌ | **auth-profiles.json 缺失** |

---

## 六、近期提交记录

| commit | 内容 |
|--------|------|
| `65ef9d2` | fix: bridge ws dependency and VPS deploy reliability |
| `03e6199` | fix: cloud-init JSON body bash quoting |
| `4f90182` | fix: Hetzner API firewalls/ssh_keys format |

---

## 七、下一步行动项

### 必须（P0）
1. **写入 auth-profiles.json** 到当前 VPS（手动）并在 deploy 脚本中自动化
2. **验证聊天** 发送一条消息，确认 AI 响应正常

### 建议
3. 更新 Hetzner snapshot，包含正确的 service 配置（减少 deploy 时的修复步骤）
4. 升级 openclaw-gateway 到 v2026.4.26（当前 v2026.4.11）
5. 为 snapshot 制作流程写入操作文档

---

## 八、auth-profiles.json 格式参考

openclaw gateway 的认证文件位于：
`/home/openclaw/.openclaw/agents/main/agent/auth-profiles.json`

格式（需要确认 openclaw 2026.4.x 的实际 schema）：
```json
{
  "profiles": [
    {
      "provider": "anthropic",
      "apiKey": "<ANTHROPIC_API_KEY>"
    },
    {
      "provider": "openai",
      "apiKey": "<OPENAI_API_KEY>"
    },
    {
      "provider": "google",
      "apiKey": "<GOOGLE_GENERATIVE_AI_API_KEY>"
    }
  ]
}
```

建议：从 Docker 容器的 `/seed/auth-profiles.json` 提取实际使用的格式，或通过 `openclaw agents add main` 命令生成后查看。
