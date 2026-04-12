# UTM 来源追踪方案

## 目标

用户访问网站时，自动识别 URL 中的来源参数（`utm_source`、`ref`、`source` 等），在用户注册时将来源写入 `user.utm_source` 字段。以**第一次记录的来源**为准，后续不覆盖。

---

## 当前状态

- `user` 表的 `0000_fine_sir_ram.sql` 初始迁移中已包含 `utm_source text` 字段
- Drizzle `schema.ts` 中缺失该字段定义（需补充）
- 目前无任何 UTM 采集逻辑

---

## 识别的参数（优先级从高到低）

| 参数名 | 说明 |
|--------|------|
| `utm_source` | 标准 UTM 来源参数 |
| `ref` | 常见推荐码 / 邀请链接 |
| `source` | 通用来源参数 |
| `from` | 常见跳转来源 |
| `via` | 常见于 newsletter、分享 |
| `r` | 短推荐码 |
| `referrer` | 来源站点 |
| `referral` | 推荐计划 |
| `aff` | 联盟营销 |
| `invite` | 邀请码 |

最终统一写入 `user.utm_source` 字段，取第一个非空值。

---

## 架构设计

### 整体流程

```
用户带参数访问任意页面
       │
       ▼
[客户端] RootUtmCapture 组件（root layout）
  读取 URL 参数 → 写入 Cookie myclawgo_utm（30天，仅第一次写入）
       │
       ▼
用户注册（邮箱/社交均可）
       │
       ▼
[服务端] Dashboard layout 首次加载
  调用 saveUtmSourceAction()（fire-and-forget）
  读取 Cookie → user.utm_source IS NULL → UPDATE
```

### 设计亮点

- **不侵入注册流程**：注册逻辑完全不变，UTM 写入在登录后首次加载时异步完成
- **同时支持邮箱和社交登录**：两种注册方式都经过 Dashboard layout，统一处理
- **First-touch 保证**：Server action 中使用 `WHERE utm_source IS NULL` 条件，已有来源的用户不会被覆盖
- **Cookie 防重复写**：Cookie 存在时不再覆盖，即使用户多次访问带参数的链接

---

## 实现步骤

### Step 1：补充 schema.ts

在 `src/db/schema.ts` 的 `user` 表中添加：

```ts
utmSource: text('utm_source'),
```

由于字段已在 DB 中存在（初始迁移），直接添加字段定义，**无需新 migration**。

### Step 2：UTM 工具函数 `src/lib/utm.ts`

```ts
// 识别的参数名（优先级从高到低）
export const UTM_PARAM_KEYS = [
  'utm_source', 'ref', 'source', 'from', 'via', 'r', 'referrer', 'referral', 'aff', 'invite',
];

export const UTM_COOKIE_NAME = 'myclawgo_utm';
export const UTM_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

// 从 URLSearchParams 中提取第一个非空来源值
export function extractUtmSource(searchParams: URLSearchParams): string | null {
  for (const key of UTM_PARAM_KEYS) {
    const val = searchParams.get(key)?.trim();
    if (val) return val;
  }
  return null;
}

// 从 Cookie 字符串中读取 utm_source
export function readUtmCookie(cookieHeader: string | null): string | null { ... }
```

### Step 3：客户端采集组件 `src/components/shared/root-utm-capture.tsx`

```tsx
'use client';
// useSearchParams() 读取当前 URL 参数
// 如果 Cookie 尚未设置 且 URL 中有来源参数 → document.cookie 写入
// 仅在客户端执行，不影响 SSR
```

挂载位置：`src/app/[locale]/layout.tsx` 根 layout（所有页面都会经过）

### Step 4：Server Action `src/actions/save-utm-source.ts`

```ts
'use server';
// 读取 request cookies（next/headers）
// 解析 myclawgo_utm cookie 值
// 查询当前用户 utm_source IS NULL
// 若是 → UPDATE user SET utm_source = ? WHERE id = ? AND utm_source IS NULL
// 失败静默忽略，不影响用户体验
```

### Step 5：Dashboard layout 调用

在 `src/app/[locale]/(protected)/layout.tsx` 中：

```tsx
// fire-and-forget，不 await，不阻塞渲染
saveUtmSourceAction().catch(() => {});
```

---

## 不受影响的流程

- 注册表单逻辑不变
- 社交登录流程不变
- Better Auth 钩子不变
- 已有用户的 utm_source 不会被修改

---

## 数据库字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `utm_source` | text, nullable | 用户来源，首次注册后写入，后续不覆盖 |

查询示例（后台分析用）：
```sql
SELECT utm_source, COUNT(*) as count
FROM "user"
WHERE utm_source IS NOT NULL
GROUP BY utm_source
ORDER BY count DESC;
```

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/db/schema.ts` | 添加 `utmSource` 字段定义 |
| `src/lib/utm.ts` | 新建 UTM 工具函数 |
| `src/components/shared/root-utm-capture.tsx` | 新建客户端采集组件 |
| `src/actions/save-utm-source.ts` | 新建 Server Action |
| `src/app/[locale]/layout.tsx` | 挂载 `<RootUtmCapture />` |
| `src/app/[locale]/(protected)/layout.tsx` | 调用 `saveUtmSourceAction()` |
