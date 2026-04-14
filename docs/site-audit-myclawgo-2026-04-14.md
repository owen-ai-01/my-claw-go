# myclawgo.com 网站全面审查报告

> 审查日期：2026-04-14  
> 审查范围：营销页面、代码质量、SEO、转化率、功能配置

---

## 一、代码 Bug（需立即修复）

### 1. Navbar 中存在 `console.log` 输出到生产环境

**文件：** `src/components/layout/navbar.tsx:53`

```ts
console.log('Navbar render:', { mounted, isPending, hasUser: !!currentUser });
```

每次页面渲染都会在浏览器控制台输出，暴露内部状态信息，影响专业度，**应立即删除**。

### 2. `<AffonsoScript />` 重复渲染

**文件：** `src/app/[locale]/layout.tsx:94-95`

```tsx
<AffonsoScript />
<AffonsoScript />  {/* 重复！ */}
```

同一个脚本被加载两次，影响页面性能。**删除其中一个**。

### 3. JSON-LD 中存在不存在的路由

**文件：** `src/app/[locale]/(marketing)/(home)/page.tsx:137`

```ts
urlTemplate: `${baseUrl}/search?q={search_term_string}`,
```

`/search` 路由并不存在，会导致搜索引擎解析错误，**应删除这段 SearchAction**。

---

## 二、功能配置问题

### 1. 社交链接全部被注释掉

**文件：** `src/config/social-config.tsx`

所有社交平台链接（GitHub、Twitter、Discord 等）均被注释，页脚只显示邮件图标。

**影响：** 用户无法通过社交媒体找到产品，E-E-A-T 信任度低。

**建议：** 至少填上 Twitter/X 链接并取消注释对应代码块。

### 2. 只支持 Google 登录

**文件：** `src/config/website.tsx`

```ts
enableGoogleLogin: true,
enableGithubLogin: false,
enableCredentialLogin: false,
```

没有 Google 账号的用户无法注册。目标用户（开发者/技术用户）多用 GitHub 账号。

**建议：** 开启 `enableGithubLogin: true`，一行配置，零开发量。

### 3. 暗色模式无法切换

```ts
defaultMode: 'dark',
enableSwitch: false,
```

强制暗色且不允许切换，部分用户（尤其是移动端）会有不适。

**建议：** 改为 `enableSwitch: true`，尊重用户偏好。

### 4. 注册赠积分未启用

```ts
registerGiftCredits: {
  enable: false,
  amount: 0,
}
```

新用户注册没有任何试用额度，门槛偏高。

**建议：** 启用并设置少量赠送积分（如 200 积分），帮助新用户体验产品价值。

### 5. Analytics 全部关闭

```ts
enableVercelAnalytics: false,
enableSpeedInsights: false,
```

没有任何数据采集，无法了解用户行为、页面性能和转化漏斗。

**建议：** 至少开启 Vercel Analytics（免费），了解流量来源和页面浏览数据。

### 6. Blog 和 Docs 均已关闭

```ts
blog: { enable: false }
docs: { enable: false }
```

缺乏内容营销入口，长期 SEO 无法积累。

**建议：** 制定内容计划后尽快开启 Blog，每周 1-2 篇。

---

## 三、首页营销效果问题

### 1. 缺少产品截图 / 演示图

当前首页完全没有产品截图或 GIF 演示，用户无法直观了解"使用后是什么样子"。

**建议：** 在 Hero 区下方加一张产品 Dashboard 的截图或录屏 GIF。

### 2. 没有用户评价（Testimonials）区块

没有任何社会证明，冷启动期尤其需要早期用户的真实反馈。

**建议：** 收集 3-5 个早期用户的文字评价，加在定价区块上方。

### 3. 没有竞品对比区块

myclaw.ai 有"Local Install vs VPS vs MyClaw"对比表，效果很好。

**建议：** 加入类似对比表：

| | 自己装 VPS | 本地运行 | myclawgo.com |
|--|--|--|--|
| 上手时间 | 4-6 小时 | 2-4 小时 | 5 分钟 |
| 需要服务器 | ✅ | ❌ | ❌ |
| 24/7 在线 | 需手动维护 | 需电脑开机 | ✅ |

### 4. "OpenClaw highlights" 区块像关键词堆砌

首页最后一个区块（`OpenClaw highlights in My Claw Go`）反复出现 "hosted OpenClaw"、"OpenClaw without VPS" 等短语，读起来像 SEO 关键词堆砌而非面向用户的内容，可能被搜索引擎降权。

**建议：** 用真实使用场景案例（"用来做什么"）替代，既自然又有 SEO 价值。

### 5. Hero 副标题过长，信息密度低

当前 Hero 副标题：
> "My Claw Go is built for people who want results, not setup friction. You do not need to learn server operations, buy infrastructure, or debug credentials before seeing value..."

文字太多，核心价值被稀释。

**建议：** 精简为一句话：
> "Your own private OpenClaw workspace — ready in minutes, no server required."

### 6. 没有免费试用 / Free Plan

定价起点是 Pro ($29.90/月)，没有免费试用期。

**建议：** 考虑：
- 7 天免费试用（推荐）
- 或注册赠积分（低成本体验）

---

## 四、SEO 问题

### 1. 页面 `<title>` 末尾 "| OpenClaw Start" 语义不清

当前：`My Claw Go: Hosted OpenClaw Without Setup | OpenClaw Start`

"OpenClaw Start" 这个词无搜索量，尾部无意义。

**建议：** 改为：`MyClawGo — Hosted OpenClaw, No VPS Required`

### 2. 导航栏 `LocaleSwitcher` 被注释

```tsx
{/* <LocaleSwitcher /> */}
```

如果将来要做多语言 SEO，这里需要重新开启。

### 3. 缺少 Sitemap 和 Robots.txt 检查

建议确认 `/sitemap.xml` 和 `/robots.txt` 能正常访问，以便搜索引擎收录。

---

## 五、代码整洁度问题

### 1. `navbar-config.tsx` 有大量注释掉的代码

文件中约 70% 的内容是被注释掉的菜单项（`// { title: t('ai.title') ... }`），影响可读性。

**建议：** 清理掉确定不用的注释块，保留文件简洁。

### 2. `AffonsoAffiliate` / `PromotekitAffiliate` 功能禁用但脚本仍渲染

```ts
enableAffonsoAffiliate: false,
enablePromotekitAffiliate: false,
```

虽然配置关闭，但组件仍被 import 并渲染在 layout 中，会引入不必要的脚本请求。应在组件内部加条件判断，或在 layout 中条件渲染。

### 3. "GDPR Ready" 徽章是德国市场遗留

页脚有：`🔒 GDPR Ready`，明显是之前针对德国市场（`de` locale 已被注释掉）的遗留内容。

**建议：** 改为更通用的信任标识，或去掉。

---

## 六、优先级排序

| 优先级 | 问题 | 文件 | 工作量 |
|--------|------|------|--------|
| 🔴 立即 | 删除 `console.log` | `navbar.tsx:53` | 1 分钟 |
| 🔴 立即 | 修复重复 `<AffonsoScript />` | `layout.tsx:94` | 1 分钟 |
| 🔴 立即 | 删除不存在的 SearchAction JSON-LD | `home/page.tsx:137` | 5 分钟 |
| 🟡 本周 | 开启 GitHub 登录 | `website.tsx` | 1 行 |
| 🟡 本周 | 开启 Vercel Analytics | `website.tsx` | 1 行 |
| 🟡 本周 | 开启注册赠积分 | `website.tsx` | 5 分钟 |
| 🟡 本周 | 填写社交链接并取消注释 | `social-config.tsx` | 30 分钟 |
| 🟡 本周 | Hero 副标题精简 | `home/page.tsx` | 15 分钟 |
| 🟡 本周 | 修复 `<title>` | `home/page.tsx` | 5 分钟 |
| 🟠 下周 | 首页加产品截图 | `home/page.tsx` | 2 小时 |
| 🟠 下周 | 首页加竞品对比区块 | `home/page.tsx` | 2 小时 |
| 🟠 下周 | 清理 navbar-config 注释代码 | `navbar-config.tsx` | 30 分钟 |
| 🟠 下周 | 替换"OpenClaw highlights"为真实场景 | `home/page.tsx` | 1 小时 |
| 🟢 下月 | 开启 Blog，开始内容营销 | `website.tsx` + 内容 | 持续 |
| 🟢 下月 | 考虑加免费试用机制 | 讨论定价 | — |
