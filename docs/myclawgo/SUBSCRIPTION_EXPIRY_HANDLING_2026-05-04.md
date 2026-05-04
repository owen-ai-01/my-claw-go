# 订阅到期处理逻辑

> 日期：2026-05-04

## 概述

订阅到期后，系统需要：停止用户 VPS、撤销 OpenRouter API Key、记录付款状态。这套逻辑由两条独立路径保障：Stripe Webhook（实时）+ Provision Worker（兜底轮询）。

---

## 支付类型

| scene | type | 到期逻辑 |
|-------|------|---------|
| `lifetime` | `ONE_TIME` | 永久有效，不会到期 |
| `subscription` | `SUBSCRIPTION` | 按 `periodEnd` 到期 |
| `credit` | `ONE_TIME` | 点数不过期，不影响 VPS |

---

## 路径一：Stripe Webhook（实时触发）

### 事件流

```
用户取消订阅 / 续费失败 / 订阅自然到期
  ↓
Stripe 发送 customer.subscription.deleted
  ↓
/api/webhooks/stripe → onDeleteSubscription()
```

### 核心逻辑

**文件：** `src/payment/provider/stripe.ts:1074`

```typescript
private async onDeleteSubscription(stripeSubscription) {
  // 更新 payment 记录状态为 canceled
  await db.update(payment).set({ status: 'canceled' })...

  // 关键判断：只有 period_end 已过，才停机、撤 Key
  // 用户立即取消但仍在订阅期内 → 不停机，继续享用剩余时间
  const periodEndMs = stripeSubscription.current_period_end * 1000;
  if (periodEndMs <= Date.now() + 300_000) {  // 5分钟容差
    revokeUserOpenrouterKey(userId);   // 撤销 OpenRouter Key
    stopRuntimeForUser(userId);        // 停止 VPS
  }
}
```

### 两种取消场景

| 场景 | Stripe 状态 | `current_period_end` | 系统行为 |
|------|------------|----------------------|---------|
| 立即取消 | `canceled` | 未来（还有剩余天数） | 仅更新 DB 状态，不停机 |
| 到期取消（自然到期 / 续费失败后到期） | `canceled` | 已过 | 停机 + 撤 Key |

---

## 路径二：Provision Worker 兜底轮询

Webhook 可能丢失（网络问题、Stripe 重试失败）。Worker 每轮执行时额外扫描，确保已过期用户最终被停机。

**文件：** `src/lib/myclawgo/provision-worker.ts:230`

### 逻辑

```typescript
async function stopExpiredSubscriptionVps(db) {
  // 1. 找所有状态为 ready 的 runtimeAllocation（运行中的 VPS）
  const activeAllocs = await db.select({ userId })
    .from(runtimeAllocation)
    .where(eq(runtimeAllocation.status, 'ready'));

  // 2. 找其中仍有有效付款的用户
  //    有效条件：
  //    - lifetime: paid=true AND status='active'
  //    - subscription: paid=true AND status IN ('active','trialing','canceled')
  //                    AND (periodEnd IS NULL OR periodEnd > NOW())
  const validPayments = await db.select({ userId }).from(payment)
    .where(and(
      eq(payment.paid, true),
      inArray(payment.userId, activeUserIds),
      sql`(
        (scene='lifetime' AND status='active')
        OR (scene='subscription' AND status IN ('active','trialing','canceled')
            AND (periodEnd IS NULL OR periodEnd > NOW()))
      )`
    ));

  // 3. 差集：运行中但无有效付款的用户 → 停机
  const expiredUserIds = activeAllocs
    .filter(id => !coveredUserIds.has(id));

  for (const userId of expiredUserIds) {
    await stopRuntimeForUser(userId);
  }
}
```

### 注意：`canceled` 状态也属于有效

Stripe 将"立即取消但仍在订阅期内"的订阅状态设为 `canceled`，但 `periodEnd > NOW()` 仍成立，Worker 不会停机。这与 Webhook 逻辑一致。

---

## VPS 停机后的生命周期

```
subscription.deleted (到期)
  ↓
stopRuntimeForUser()
  → runtimeHost.status: ready → stopped
  → runtimeHost.stoppedAt = NOW()
  → Hetzner API: 关闭服务器电源（poweroff，不删除）
  ↓
cleanupExpiredVps() 每轮扫描
  → 条件：status='stopped' AND stoppedAt < NOW() - VPS_DATA_RETENTION_DAYS
  → Hetzner API: deleteServer()
  → runtimeHost.status: stopped → deleted
```

**保留天数：** `VPS_DATA_RETENTION_DAYS`（默认 7 天）。停机后 7 天内数据仍在 Hetzner，可手动恢复。

---

## OpenRouter Key 生命周期

| 事件 | 操作 |
|------|------|
| 订阅激活 / invoice.paid | `provisionUserOpenrouterKey(userId)` — 创建专属 Key |
| subscription.deleted（到期） | `revokeUserOpenrouterKey(userId)` — 撤销 Key |
| VPS 新建时 | Key 写入 `/home/openclaw/.openclaw/agents/main/agent/auth-profiles.json` |

撤销后，VPS 上的 Gateway 仍有旧 Key 文件，但 OpenRouter 端已失效，AI 请求会报 401。

---

## 数据库状态变化汇总

### payment 表

| 阶段 | `status` | `paid` | `cancelAtPeriodEnd` |
|------|---------|--------|---------------------|
| 订阅激活 | `active` | `true` | `false` |
| 用户申请取消（保留到期） | `active` | `true` | `true` |
| 到期后 / 立即取消 | `canceled` | `true` | — |

### runtimeAllocation 表

| 阶段 | `status` |
|------|---------|
| 正常运行 | `ready` |
| 停机后 | `stopped` |

### runtimeHost 表

| 阶段 | `status` |
|------|---------|
| 正常运行 | `ready` |
| 停机 | `stopped` |
| 数据保留期满删除 | `deleted` |

---

## 常见问题

### 用户取消后立即无法使用？

不会。系统检查 `periodEnd > NOW()`，只要当前订阅周期未结束，VPS 继续运行。

### Webhook 丢了怎么办？

Provision Worker 每次运行都执行 `stopExpiredSubscriptionVps()`，作为兜底。Worker 触发频率由调用方（cron / server.ts）决定，目前为每分钟或每几分钟一次。

### 停机后数据还在吗？

停机（`stopped`）阶段 VPS 只是关电，硬盘数据保留。满足 `VPS_DATA_RETENTION_DAYS`（默认 7 天）后才永久删除。

### 重新订阅能恢复 VPS 吗？

目前重新订阅会触发 `queueRuntimeProvision()`，创建**新** VPS，不会恢复原 VPS 的数据。

---

## 相关文件

| 文件 | 作用 |
|------|------|
| `src/payment/provider/stripe.ts` | Webhook 处理，`onDeleteSubscription()` |
| `src/lib/myclawgo/provision-worker.ts` | 兜底轮询，`stopExpiredSubscriptionVps()` + `cleanupExpiredVps()` |
| `src/lib/myclawgo/runtime-provision.ts` | `stopRuntimeForUser()` 实现 |
| `src/lib/myclawgo/openrouter-key-provisioner.ts` | OR Key 创建/撤销 |
