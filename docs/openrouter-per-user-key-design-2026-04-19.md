# OpenRouter 按用户预分配子密钥方案

> 实现日期：2026-04-19  
> Commit：dab67d9  
> 背景：解决平台 OPENROUTER_API_KEY 被用户容器读取的安全风险

---

## 一、问题背景

原方案将平台的 `OPENROUTER_API_KEY` 直接作为环境变量注入每个用户容器。用户只需对 OpenClaw agent 说：

```
运行一下 printenv OPENROUTER_API_KEY
```

即可拿走平台主密钥，绕过计费并消耗平台配额。

---

## 二、解决方案

利用 OpenRouter 官方 **Keys Management API**，为每位付费用户独立创建一个子密钥，并设置按月重置的消费上限。容器中注入的是用户自己的子密钥，而非平台主密钥。

### 核心原则

- 用户就算读到容器内的 key，也只能消耗自己的配额（OpenRouter 侧强制上限）
- 平台主密钥永远不进用户容器
- 用户降级/封号时可单独 revoke，不影响其他用户
- OpenRouter 按 key 统计用量，天然对应平台计费
- 子密钥泄漏的爆炸半径限定在该用户自身

---

## 三、OpenRouter Keys API

| 操作 | 方法 | 端点 |
|------|------|------|
| 创建子密钥 | POST | `https://openrouter.ai/api/v1/keys` |
| 更新子密钥（调整 limit） | PATCH | `https://openrouter.ai/api/v1/keys/{hash}` |
| 删除/revoke 子密钥 | DELETE | `https://openrouter.ai/api/v1/keys/{hash}` |

**创建请求 body：**
```json
{
  "name": "myclawgo-user-{userId}",
  "limit": 15,
  "limit_reset": "monthly"
}
```

**响应：**
```json
{
  "key": "sk-or-v1-xxxx...",   // 实际密钥，仅返回一次，需立即加密存储
  "data": {
    "hash": "key_abc123",       // 用于后续 update/delete
    ...
  }
}
```

---

## 四、各计划消费上限

| 计划 | 月费 | 容器 OpenRouter 月限额 | 重置周期 |
|------|------|----------------------|---------|
| Pro | $29.90 | $15 | monthly |
| Premium | $59.90 | $30 | monthly |
| Ultra | $199.90 | $100 | monthly |

---

## 五、架构实现

### 新增 DB 表：`user_openrouter_key`

```ts
// src/db/schema.ts
export const userOpenrouterKey = pgTable("user_openrouter_key", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  keyHash: text("key_hash").notNull(),        // OpenRouter key hash，用于 update/delete
  keyEncrypted: text("key_encrypted").notNull(), // AES-256-GCM 加密的实际 key
  limitUsd: integer("limit_usd").notNull(),   // 消费上限（整数 USD）
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 新增服务：`src/lib/myclawgo/openrouter-key-provisioner.ts`

提供三个函数：

| 函数 | 调用时机 | 说明 |
|------|---------|------|
| `provisionUserOpenrouterKey(userId)` | 订阅激活/续费（invoice.paid） | 创建或更新子密钥 |
| `revokeUserOpenrouterKey(userId)` | 订阅取消（subscription.deleted） | 删除子密钥 |
| `getUserOpenrouterKey(userId)` | 容器启动时 | 返回解密后的子密钥 |

### 容器注入逻辑修改（`docker-manager.ts`）

```ts
// 优先用用户子密钥；未配置时 fallback 到平台 key
const userOrKey = await getUserOpenrouterKey(session.id);
const openrouterKey = userOrKey ?? process.env.OPENROUTER_API_KEY;
```

### Stripe Webhook 触发点

```
invoice.paid
  → processSubscriptionPurchase()
    → provisionUserOpenrouterKey(userId)   ← 新增

customer.subscription.deleted
  → onDeleteSubscription()
    → revokeUserOpenrouterKey(userId)      ← 新增
```

---

## 六、整体工作流

```
用户付款成功（invoice.paid）
       ↓
调用 OpenRouter API 创建子密钥
  POST /api/v1/keys { name, limit, limit_reset }
       ↓
子密钥加密（AES-256-GCM）存入 user_openrouter_key 表
       ↓
容器启动时优先读取用户子密钥注入容器
       ↓
用户订阅取消（subscription.deleted）
  → 调用 DELETE /api/v1/keys/{hash} 撤销密钥
  → 从 DB 删除记录
```

---

## 七、配置要求

### 必须新增的环境变量

```bash
# OpenRouter 管理密钥（管理角色，非普通 API key）
OPENROUTER_MANAGEMENT_KEY=sk-or-v1-xxxx...
```

**获取方式：** 登录 OpenRouter 控制台 → API Keys → 创建一个具有管理权限的 key。

### 已有变量（保持不变）

```bash
# 平台主密钥，用于 Next.js 侧直接 AI 调用（不注入容器）
OPENROUTER_API_KEY=sk-or-v1-xxxx...
```

---

## 八、降级处理

`OPENROUTER_MANAGEMENT_KEY` 未配置时：
- 打 `warn` 日志，跳过子密钥创建
- 容器继续 fallback 注入平台 key（现有行为）
- **不会崩溃，现有用户不受影响**

子密钥创建/撤销失败时（网络等原因）：
- 记录 error 日志
- 非致命，不影响用户登录和容器启动

---

## 九、后续可以做的优化

- **现有付费用户补发子密钥**：写一个脚本遍历 active subscription 用户，批量调用 `provisionUserOpenrouterKey`
- **Webhook 幂等保护**：`provisionUserOpenrouterKey` 内部已做 upsert，重复调用安全
- **Key 轮换**：定期 PATCH 更新 key 的 limit（如套餐升级时）已在 `provisionUserOpenrouterKey` 中实现
