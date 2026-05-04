# 测试环境到生产环境部署流程

> 日期：2026-05-04

## 概述

测试环境（`my-claw-go`）和生产环境（`my-claw-go-online`）是两个独立的代码目录。所有开发和调试在测试目录进行，验证通过后需要手动同步到生产目录并重新构建。

---

## 目录结构

| 目录 | 用途 | pm2 进程 | 端口 |
|------|------|---------|------|
| `/home/openclaw/project/my-claw-go` | 测试环境 | `my-claw-go-test` | 3010 |
| `/home/openclaw/project/my-claw-go-online` | 生产环境 | `my-claw-go-online` | 3021 |
| `/home/openclaw/project/my-claw-go/bridge` | Bridge 源码（共用） | `my-claw-go-chat-proxy` | — |

> **注意**：`my-claw-go-chat-proxy` 运行目录是 `/home/openclaw/project/my-claw-go`，两套环境共用同一个本地 bridge 进程。VPS 上的 bridge 在 provisioning 时从 `/home/openclaw/project/my-claw-go/bridge/dist` 复制部署。

---

## 部署步骤

### 1. 在测试环境验证

确保所有改动在测试环境（`https://test.myclawgo.com`）完整走通：
- 注册 / Google OAuth 登录
- 支付（Stripe）
- VPS 创建与初始化
- 聊天功能

### 2. 确认差异文件

```bash
# 查看源码差异（排除 .env、node_modules、构建产物）
diff -rq --exclude='.next' --exclude='node_modules' --exclude='.env*' --exclude='*.log' \
  /home/openclaw/project/my-claw-go/src \
  /home/openclaw/project/my-claw-go-online/src

diff -rq --exclude='node_modules' \
  /home/openclaw/project/my-claw-go/bridge/src \
  /home/openclaw/project/my-claw-go-online/bridge/src
```

### 3. 同步源码文件

只同步在测试环境验证过的文件，**不要把仍在开发的功能同步到生产**。

```bash
SRC=/home/openclaw/project/my-claw-go
DST=/home/openclaw/project/my-claw-go-online

# 按需复制已验证的文件，例如：
cp $SRC/src/middleware.ts                                     $DST/src/middleware.ts
cp $SRC/src/app/api/internal/runtime/register/route.ts       $DST/src/app/api/internal/runtime/register/route.ts
cp $SRC/src/lib/myclawgo/cloud-init.ts                       $DST/src/lib/myclawgo/cloud-init.ts
cp $SRC/src/lib/myclawgo/provision-worker.ts                 $DST/src/lib/myclawgo/provision-worker.ts
cp $SRC/src/lib/myclawgo/user-chat.ts                        $DST/src/lib/myclawgo/user-chat.ts
cp $SRC/src/components/dashboard/chat/chat-shell.tsx         $DST/src/components/dashboard/chat/chat-shell.tsx
cp $SRC/src/payment/provider/stripe.ts                       $DST/src/payment/provider/stripe.ts
cp $SRC/bridge/src/routes/health.ts                          $DST/bridge/src/routes/health.ts
cp $SRC/bridge/src/services/openclaw.ts                      $DST/bridge/src/services/openclaw.ts
```

### 4. 确认生产环境变量

生产 `.env` 在 `/home/openclaw/project/my-claw-go-online/.env`。特别注意：

- `NEXT_PUBLIC_STRIPE_PRICE_*` — Stripe 价格 ID（`NEXT_PUBLIC_` 变量在构建时打包，改了必须重建）
- `DATABASE_URL` — 生产数据库，确保不是测试库
- `NEXT_PUBLIC_APP_URL` — 生产域名

### 5. 构建 Bridge

```bash
cd /home/openclaw/project/my-claw-go-online/bridge
npm run build
```

### 6. 构建 Next.js

```bash
cd /home/openclaw/project/my-claw-go-online
pnpm build
```

### 7. 重启服务

```bash
pm2 restart my-claw-go-online my-claw-go-chat-proxy
```

### 8. 验证

```bash
pm2 list  # 确认状态均为 online，无 unstable restarts
```

访问生产域名确认功能正常。

---

## 常见问题

### `NEXT_PUBLIC_` 环境变量改了不生效

`NEXT_PUBLIC_` 变量在 **构建时** 静态打包进 JS bundle，修改 `.env` 后必须重新 `pnpm build` 才生效，仅重启 pm2 无效。

### 改了测试目录但生产没更新

生产运行目录是 `my-claw-go-online`，必须把文件复制过去再构建。仅在 `my-claw-go` 里构建对生产无效。

### Bridge 改动没生效

Bridge 有两处需要更新：
1. **本地 bridge**（`my-claw-go-online/bridge`）：编译后重启 `my-claw-go-chat-proxy`
2. **VPS bridge**：下次 provisioning 时自动从 `my-claw-go/bridge/dist` 复制到新 VPS；已有 VPS 需要手动 scp 或重新 provision

---

## 快速参考

```bash
# 一键同步 + 构建 + 重启（根据实际修改的文件调整 cp 列表）
SRC=/home/openclaw/project/my-claw-go
DST=/home/openclaw/project/my-claw-go-online

# 1. 同步文件（按需）
cp $SRC/src/... $DST/src/...

# 2. 构建
cd $DST/bridge && npm run build
cd $DST && pnpm build

# 3. 重启
pm2 restart my-claw-go-online my-claw-go-chat-proxy

# 4. 确认
pm2 list
```
