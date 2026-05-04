# 生产环境 Git 状态分析与修复记录

**日期：** 2026-05-04  
**生产目录：** `/home/openclaw/project/my-claw-go-online`  
**测试目录：** `/home/openclaw/project/my-claw-go`

---

## 问题现象

`git status` 在生产目录显示大量修改：
- 17 个文件 modified
- 约 12 个文件 untracked（包含新博客、新 SVG、新页面）
- 9 个旧博客文件 deleted

同时：`Your branch is behind 'origin/main' by 19 commits`

---

## 根本原因分析

### 部署方式不匹配
生产环境的更新流程历史上是**两条路并行**：

1. **rsync 直接覆盖**（快捷但绕过 git）：  
   测试环境改好 → `rsync` 把文件直接复制到生产目录 → 重新 build  
   结果：文件内容已是最新，但 git 的 HEAD 指针没有移动

2. **git push**（正常流程）：  
   代码提交到 git → 生产目录 `git pull` → 重新 build  
   这条路没有执行完

这导致"文件内容对，git 状态乱"的现象。

### 验证结论
逐一用 `md5sum` 对比了所有 modified / untracked 文件与 `origin/main` 的内容：

| 文件 | 结果 |
|---|---|
| bridge/src/routes/health.ts | ✅ 与 origin/main 完全一致 |
| bridge/src/services/openclaw.ts | ✅ 一致 |
| src/app/api/internal/runtime/register/route.ts | ✅ 一致 |
| src/lib/myclawgo/provision-worker.ts | ✅ 一致 |
| src/lib/myclawgo/cloud-init.ts | ✅ 一致 |
| src/lib/myclawgo/user-chat.ts | ✅ 一致 |
| src/middleware.ts | ✅ 一致 |
| src/payment/provider/stripe.ts | ✅ 一致 |
| src/components/dashboard/chat/chat-shell.tsx | ✅ 一致 |
| messages/en.json / de.json | ✅ 一致 |
| next.config.ts | ✅ 一致 |
| src/app/sitemap.ts | ✅ 一致 |
| src/config/navbar-config.tsx | ✅ 一致 |
| src/config/website.tsx | ✅ 一致 |
| src/routes.ts | ✅ 一致 |
| content/blog/[3 new posts] | ✅ 一致 |
| content/author/myclawgo.mdx | ✅ 一致 |
| content/category/guides.mdx / hosting.mdx | ✅ 一致 |

**结论：无任何生产独有的未保存改动，可以安全 reset。**

---

## 修复方案

### 执行命令（生产目录）

```bash
cd /home/openclaw/project/my-claw-go-online
git reset --hard origin/main
```

这一条命令将：
1. 把 HEAD 移到 origin/main（最新 commit）
2. 把 working tree 的所有 tracked 文件重置为 origin/main 状态
3. 已删除的旧博客文件在 origin/main 中也已删除，状态一致
4. untracked 文件（不属于 origin/main 的，如 bridge/package-lock.json）保留不动

### 修复后预期状态
```
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```
（仅剩 bridge/package-lock.json 等真正不归 git 管的文件为 untracked）

---

## 后续：正确的生产部署流程

**标准流程（今后执行）：**

```
测试环境改代码
    ↓
测试验证通过
    ↓
git commit + git push
    ↓
生产目录: git pull
    ↓
pnpm build
    ↓
pm2 restart my-claw-go-online
```

**严禁单独使用 rsync 绕过 git：**  
rsync 覆盖文件后不移动 git HEAD，导致生产 git 状态持续漂移，积累越来越多的"假改动"，增加后续维护风险（万一某次有真正的生产独有改动混入，很难发现）。

**允许的例外：**  
仅 `public/` 下的静态资源（图片、SVG）可以用 rsync 单独同步，因为这类文件通常不需要重新 build，且变更简单。即便如此，也应在 git 里提交。
