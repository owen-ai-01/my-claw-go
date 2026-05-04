# 网站全貌与 SEO 分析

> 日期：2026-05-04

## 一、网站基本信息

| 项目 | 值 |
|------|----|
| 站点名称 | MyClawGo |
| 域名 | myclawgo.com |
| 测试域名 | test.myclawgo.com |
| 主标题 | MyClawGo: Your own OpenClaw without setup \| OpenClaw Start |
| 主描述 | My Claw Go helps you launch your own private OpenClaw workspace without VPS, local setup, or API key hassle. Sign up, pay, and start fast. |
| 框架 | Next.js 15 App Router |
| 多语言 | next-intl；当前仅 `en`（中文 `de.json` 备份存在但未启用） |
| 默认语言 | English (`en`) |
| URL 前缀策略 | `as-needed`（默认语言不加 `/en/` 前缀） |

---

## 二、页面结构总览

### 2.1 营销页（公开可索引）

| 路由 | 文件 | generateMetadata | 说明 |
|------|------|-----------------|------|
| `/` | `(home)/page.tsx` | ✅ | 首页，最重要 SEO 页面 |
| `/pricing` | `pricing/page.tsx` | ✅ | 定价页 |
| `/about` | `(pages)/about/page.tsx` | ✅ | 关于我们 |
| `/contact` | `(pages)/contact/page.tsx` | ✅ | 联系我们 |
| `/changelog` | `(pages)/changelog/page.tsx` | ✅ | 更新日志 |
| `/waitlist` | `(pages)/waitlist/page.tsx` | ❌ 缺少 | 候补名单 |
| `/privacy` | `(legal)/privacy/page.tsx` | ✅ | 隐私政策（MDX 驱动） |
| `/terms` | `(legal)/terms/page.tsx` | ✅ | 使用条款（MDX 驱动） |
| `/cookie` | `(legal)/cookie/page.tsx` | ✅ | Cookie 政策（MDX 驱动） |
| `/ai/text` | `ai/text/page.tsx` | ✅ | AI 文字演示 |
| `/ai/image` | `ai/image/page.tsx` | ✅ | AI 图片演示 |
| `/ai/video` | `ai/video/page.tsx` | ✅ | AI 视频演示 |
| `/ai/audio` | `ai/audio/page.tsx` | ✅ | AI 音频演示 |
| `/ai/chat` | `ai/chat/page.tsx` | ✅ | AI 聊天演示 |
| `/blog` | `(blog)/page.tsx` | ❌ 禁用 | 博客（配置关闭） |
| `/docs` | `docs/[[...slug]]/page.tsx` | ✅ | 文档（配置关闭） |

### 2.2 受保护页面（不索引）

| 路由 | 说明 |
|------|------|
| `/chat` | 聊天界面（登录后默认落地页） |
| `/dashboard` | 主控制台 |
| `/office` | 工作空间 |
| `/tasks` | 任务管理 |
| `/settings/profile` | 用户设置 |
| `/settings/agents` | Agent 管理 |
| `/settings/billing` | 账单 |
| `/settings/credits` | 积分管理 |
| `/settings/security` | 安全设置 |
| `/settings/notifications` | 通知设置 |
| `/payment` | 支付页面 |
| `/admin/users` | 管理后台 |

### 2.3 认证页面

| 路由 | 说明 |
|------|------|
| `/auth/login` | 登录（Google OAuth） |
| `/auth/register` | 注册 |
| `/auth/forgot-password` | 找回密码 |
| `/auth/reset-password` | 重置密码 |

---

## 三、首页详细结构（SEO 核心页）

### 3.1 页面结构

```
H1: Launch your private OpenClaw workspace in minutes—no VPS, no setup, no API key hassle.

信任标签: No VPS required / No local setup / No API key hassle / Start in minutes

H2: What is My Claw Go?
  → 两段价值主张文字

H2: Features (id="features")
  → 6个功能卡片
  → 🔐 Private workspace
  → 🧩 No VPS/server setup
  → ⚡ No API key maze
  → 💬 Natural language control
  → 🧠 Persistent memory
  → 📈 Built for creators/operators

H2: How It Works (id="how-to-use")
  → Step 1: 注册 & 选择套餐
  → Step 2: 打开工作空间 & 下指令
  → Step 3: 随工作量增长升级

H2: Choose Your Plan (id="choose-plan")
  → <PricingTable /> 动态组件

H2: FAQ (id="faq")
  → 6个常见问题

H2: Ready to start?
  → CTA + 注册 + support 邮件

H2: OpenClaw Highlights
  → 3列网格（hosted / no setup / SaaS）
```

### 3.2 JSON-LD 结构化数据

首页包含 3 种 Schema：

**① SoftwareApplication**
```json
{
  "@type": "SoftwareApplication",
  "name": "MyClawGo",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Any",
  "offers": { "price": "$19.9 - $199.9" },
  "featureList": ["私有工作空间", "无需VPS", "无需API Key", ...]
}
```

**② WebSite**
```json
{
  "@type": "WebSite",
  "name": "MyClawGo",
  "description": "Hosted OpenClaw workspace for non-technical users — no VPS, no setup."
}
```

**③ FAQPage**
```json
{
  "@type": "FAQPage",
  "mainEntity": [6个Q&A对]
}
```

### 3.3 首页 generateMetadata

```typescript
title: "My Claw Go: Hosted OpenClaw Without Setup | OpenClaw Start"
description: "My Claw Go helps you launch your own private OpenClaw workspace
              without VPS, local setup, or API key hassle. Sign up, pay, and start fast."
```

---

## 四、定价体系

### 4.1 订阅套餐（月付）

| 套餐 | 价格 | 积分/月 | 视频秒数 | 图片数 |
|------|------|--------|---------|--------|
| Free | 免费 | 0 | 0 | 0 |
| Pro | $29.90/mo | 4,000 | 420s | 140张 |
| Premium ⭐ | $59.90/mo | 8,000 | 1,440s | 480张 |
| Ultra | $199.90/mo | 40,000 | 48,000s | 16,000张 |

### 4.2 订阅套餐（年付）

| 套餐 | 价格 | 积分/年 |
|------|------|--------|
| Pro | $287.04/yr | 48,000 |
| Premium ⭐ | $575.04/yr | 96,000 |
| Ultra | $1,919.04/yr | 480,000 |

### 4.3 一次性积分包

| 包名 | 价格 | 积分 |
|------|------|------|
| Basic | $9.90 | 1,320 |
| Standard ⭐ | $19.90 | 2,650 |
| Premium | $39.90 | 5,320 |
| Enterprise | $99.90 | 19,980 |

---

## 五、导航结构

### 5.1 顶部导航栏

```
Features → /#features
Tutorial → /#how-to-use
Pricing  → /pricing
Pages ▼
  About
  Contact
  Changelog
```

（Blog、Docs 已在配置中关闭，导航中不显示）

### 5.2 页脚导航（4列）

| Product | Resources | Company | Legal |
|---------|-----------|---------|-------|
| Features | Blog（禁用） | About | Cookie Policy |
| Pricing | Docs（禁用） | Contact | Privacy Policy |
| FAQ | Changelog | Waitlist | Terms of Service |

---

## 六、SEO 技术基础设施

### 6.1 robots.txt

```
User-Agent: *
Allow: /
Disallow: /api/*
Disallow: /_next/*
Disallow: /settings/*
Disallow: /dashboard/*
Sitemap: https://myclawgo.com/sitemap.xml
```

### 6.2 sitemap.xml（动态生成）

| 路由 | 更新频率 | 权重 |
|------|---------|------|
| `/` | weekly | 1.0 |
| `/pricing` | monthly | 0.9 |
| `/about` | monthly | 0.7 |
| `/contact` | yearly | 0.5 |
| `/privacy` | yearly | 0.3 |
| `/terms` | yearly | 0.3 |

**注：** Blog 和 Docs 路由在功能关闭时不进入 sitemap。

### 6.3 Metadata 基础设施

- **工具函数：** `src/lib/metadata.ts` → `constructMetadata()`
- **OG 图片：** 动态生成 `/api/og?title=...&desc=...`
- **Twitter Card：** `summary_large_image`
- **Canonical URL：** 自动生成，带 locale 处理
- **hreflang：** `generateHreflangUrls()` 已实现（多语言就绪）
- **Favicon 体系：** `/favicon.ico` + `/favicon-32x32.png` + `/apple-touch-icon.png` + `/manifest.webmanifest`

---

## 七、内容资源（暂未开放）

### 7.1 博客内容（功能已关闭）

`content/blog/` 下有 12 篇文章，分属 3 个分类：
- `company` / `news` / `product`

典型文章：`comparisons.mdx`、`internationalization.mdx`、`premium.mdx`

### 7.2 文档内容（功能已关闭）

`content/docs/` 下有 51 个 MDX 文件，使用 **Fumadocs** 框架。

包含：Getting Started、Features、Components（10篇）、Layouts（5篇）、MDX Deep Dive（5篇）

### 7.3 法律页面（正常开放）

- `content/pages/privacy-policy.mdx`
- `content/pages/terms-of-service.mdx`
- `content/pages/cookie-policy.mdx`

---

## 八、当前 SEO 问题清单

### ① 高优先级

| # | 问题 | 影响 | 改进方向 |
|---|------|------|---------|
| 1 | **博客功能关闭** | 无长尾内容流量，无内链机会 | 开启博客，先发布 3-5 篇原创文章（OpenClaw 使用指南、对比竞品） |
| 2 | **首页主关键词偏窄** | 搜索量局限 "OpenClaw" 长尾 | 补充 "AI agent platform"、"hosted AI workspace" 等更宽泛词 |
| 3 | **无任何外链/社媒信号** | Domain Authority 低 | 注册 Twitter/X、GitHub，完善 social-config.tsx |
| 4 | **文档功能关闭** | 无教程类页面，无技术 SEO 权重 | 开启 docs，先写 3-5 篇使用文档 |

### ② 中优先级

| # | 问题 | 影响 | 改进方向 |
|---|------|------|---------|
| 5 | `/waitlist` 缺 generateMetadata | 页面分享无 OG 卡片 | 补充 metadata |
| 6 | `SITE_LAST_MODIFIED` 硬编码为 `2026-03-04` | Sitemap 日期不准确 | 改为动态日期或定期更新 |
| 7 | 无 Analytics | 无 SEO 数据支持决策 | 接入 Google Search Console + Vercel Analytics |
| 8 | 图片 alt 属性未系统检查 | 可能影响图片搜索和可访问性 | 全站 audit 一次 |
| 9 | 中文版未启用 | 错过中文 AI 工具搜索流量 | 补完 zh 翻译（messages 已有框架），开启中文路由 |

### ③ 低优先级

| # | 问题 |
|---|------|
| 10 | `/test`、`/magicui` 页面可能被索引（非生产内容） |
| 11 | 页脚 Blog/Docs 链接在功能关闭时仍显示（用户体验问题） |
| 12 | 无 `Organization` Schema（结构化数据不完整） |

---

## 九、SEO 改进优先路线图

### 近期（本周）

1. **开启博客功能** — `website.tsx` 中 `blog.enable: true`，补充 3 篇文章
2. **完善首页 H1/描述** — 加入 "AI agent"、"no-code" 等搜索量更高的关键词
3. **补充 `/waitlist` metadata**
4. **注册 Google Search Console** — 提交 sitemap，监控收录

### 中期（本月）

5. **启用 Docs** — 写 3-5 篇使用指南，建立技术内容权重
6. **接入 Analytics** — 开启 Vercel Analytics / 接入 GA4
7. **社媒账号** — Twitter/X + GitHub，填充 `social-config.tsx`
8. **更新 SITE_LAST_MODIFIED** 为动态时间

### 长期

9. **启用中文路由** — 面向中国用户市场
10. **外链建设** — Product Hunt 发布、AI 工具目录收录（futurepedia, there's an ai for that, etc.）
11. **补充 Organization Schema** — 提升品牌知识图谱

---

## 十、功能开关速查

所有开关在 `src/config/website.tsx`：

| 功能 | 当前状态 | 开启方式 |
|------|---------|---------|
| Blog | ❌ 关闭 | `blog: { enable: true }` |
| Docs | ❌ 关闭 | `docs: { enable: true }` |
| Credits | ✅ 开启 | — |
| Newsletter | ✅ 开启 | — |
| Google Login | ✅ 开启 | — |
| GitHub Login | ❌ 关闭 | `github: true` |
| 中文（zh） | ❌ 未配置 | 在 `locales` 中添加 `zh` 并补充 `messages/zh.json` |
| Crisp Chat | 仅 demo 模式 | 设置 `NEXT_PUBLIC_DEMO_WEBSITE=true` |
| Vercel Analytics | ❌ 关闭 | `vercelAnalytics: true` |

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `src/config/website.tsx` | 全站配置中心（功能开关、定价、社媒） |
| `src/config/navbar-config.tsx` | 顶部导航链接 |
| `src/config/footer-config.tsx` | 页脚链接 |
| `src/config/social-config.tsx` | 社交媒体链接 |
| `src/lib/metadata.ts` | Metadata 构建工具函数 |
| `src/app/robots.ts` | robots.txt 生成 |
| `src/app/sitemap.ts` | sitemap.xml 动态生成 |
| `src/i18n/routing.ts` | 语言路由配置 |
| `messages/en.json` | 英文翻译（含 SEO 元数据字段） |
| `content/blog/` | 博客文章（12篇，功能关闭中） |
| `content/docs/` | 文档内容（51篇，功能关闭中） |
| `src/app/[locale]/(marketing)/(home)/page.tsx` | 首页实现 |
