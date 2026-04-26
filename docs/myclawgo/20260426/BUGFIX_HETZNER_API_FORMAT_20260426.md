# Bug Fix：Hetzner API 请求格式错误（2026-04-26）

## 现象

测试环境用户注册并完成 Stripe 支付后，`runtimeProvisionJob` 状态停在 `pending`，`last_error` 为：

```json
Hetzner API POST /servers → 422: {
  "error": {
    "code": "invalid_input",
    "message": "failed to parse json",
    "details": {
      "fields": [
        {
          "name": "firewalls.firewall",
          "messages": ["cannot parse type  as LaxInt"]
        }
      ]
    }
  }
}
```

## 根因

`src/lib/hetzner/client.ts` 的 `createServer` 方法构造请求体时，`firewalls` 和 `ssh_keys` 字段格式不符合 Hetzner API 规范：

**错误格式（修复前）：**
```typescript
firewalls: [{ firewall: { id: params.firewallId } }],  // ❌ 嵌套对象
ssh_keys: [{ id: params.sshKeyId }],                   // ❌ 嵌套对象
```

**正确格式（修复后）：**
```typescript
firewalls: [{ firewall: params.firewallId }],  // ✓ 直接整数
ssh_keys: [params.sshKeyId],                   // ✓ 直接整数数组
```

Hetzner API 期望 `firewalls[].firewall` 是整数 ID，`ssh_keys` 是整数 ID 数组，不接受嵌套对象。

## 修复

commit `4f90182`，文件 `src/lib/hetzner/client.ts`，两行改动。

## 验证

`runtimeProvisionJob` 在 worker 下次轮询（≤30s）时自动重试，`attempt_count` 递增，`status` 应从 `pending` 变为 `buying_vps` → `waiting_init`，最终 `done`。

## 相关配置注意事项

`.env` 中 `HETZNER_PROJECTS` 的 `sshKeyId` 和 `firewallId` 必须填整数，不能加引号：

```env
# ✓ 正确
HETZNER_PROJECTS='[{"id":"proj-01","sshKeyId":12345678,"firewallId":56789012,...}]'

# ✗ 错误（字符串会导致 Hetzner API 拒绝）
HETZNER_PROJECTS='[{"id":"proj-01","sshKeyId":"12345678","firewallId":"56789012",...}]'
```

`projects.ts` 的 `parseNumber()` 会把字符串转成数字再校验，所以运行时不会抛出解析错误，但实际传给 API 时是数字，这不是问题。真正的问题是历史代码把整数包成了对象再传。
