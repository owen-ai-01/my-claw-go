# myclaw.ai 网站改进与优化建议

> 分析日期：2026-04-13  
> 分析对象：https://myclaw.ai/

---

## 一、转化率问题（最重要）

### 1. CTA 按钮混乱

当前存在 4 种 CTA："Run OpenClaw Now" / "Reserve Your Spot" / "See Pricing" / "Get Started"，让用户不知道该点哪个。

**建议：** 统一为单一主 CTA，建议 **"Get Started Free"**（或 "Start in 30 Seconds"），其他按钮降级为次要样式。

### 2. 首屏 Hero 信息量不够

当前 Hero 只有 "Your OpenClaw Ready for You" + "works 24/7, no setup needed"，太抽象，用户第一眼不清楚这是什么。

**建议：** Hero 副标题改为一句话说清价值，例如：
> "Skip the setup. Get a private OpenClaw instance running in 30 seconds — no terminal, no Docker."

### 3. "10,000+ 已预约"社会证明可疑

冷启动期这个数字需要真实或有来源背书，否则反而降低可信度。**建议去掉或换成可验证的数据。**

---

## 二、SEO 问题

### 1. 关键词覆盖不足

当前页面标题是 "Your OpenClaw Ready for You"，但用户搜索意图可能是 "OpenClaw cloud hosting" / "run OpenClaw online"。建议在 `<title>` 和 H1 里明确包含这些关键词。

### 2. Blog 需要持续产出

导航里有 Blog 入口，需要持续发布 "OpenClaw tutorials"、"OpenClaw use cases" 等长尾 SEO 文章，才能带来自然流量。

### 3. 社交链接全部为空

`websiteConfig.social` 中 GitHub、Twitter、Discord 等全部为空字符串，页脚社交链接缺失，影响 E-E-A-T 信任度。

**立即行动：** 填上 Twitter/X 和 GitHub 链接。

---

## 三、产品定位问题

### 1. 定价偏高且无免费试用

- Lite 计划 $16/月起，无 Free Plan
- 对冷启动期新产品门槛偏高

**建议：** 增加 7 天免费试用，或一个限制版免费 Plan（1 vCPU，7 天有效），降低用户尝试成本。

### 2. OpenClaw 与 MyClaw 的关系说明位置靠后

很多访客不了解 OpenClaw，FAQ 虽有解释但位置偏后。

**建议：** 在 Hero 下方立刻增加一个简短的 "What is OpenClaw?" 说明卡片。

### 3. 比较页面有竞争力但曝光不足

"Local Install vs VPS vs MyClaw" 的对比非常有说服力，但当前只在子页面展示。

**建议：** 在首页更靠前的位置展示这个对比，或做成独立的 `/compare` SEO 落地页。

---

## 四、信任度问题

### 1. SOC 2 没有证书链接

提到了 SOC 2 compliance，但没有证书或第三方链接。如果还未认证，不要随意提及，容易被用户质疑。

### 2. Testimonial 缺乏可验证性

用户评价只有文字和用户名，缺乏真实感。

**建议：** 附上用户的 X/Twitter 主页链接，或使用真实头像。

### 3. "Editors' Pick by AI Secret" 缺少来源链接

如果有这个认证，应加上来源链接；否则显得是自夸，反而降低可信度。

---

## 五、技术与用户体验问题

### 1. 只支持 Google 登录

`enableCredentialLogin: false`，没有 Google 账号的用户会直接流失。

**建议：** 开启 GitHub 登录（`enableGithubLogin: true`），开发者用户群体大，一行配置即可开启。

### 2. 暗色模式无法切换

`defaultMode: 'dark'`，`enableSwitch: false`，部分用户偏好浅色主题，建议开放切换（`enableSwitch: true`）。

---

## 六、优先级排序

| 优先级 | 改进项 | 预估工作量 |
|--------|--------|-----------|
| 🔴 立即 | 填写社交链接（Twitter/GitHub） | 5 分钟 |
| 🔴 立即 | 统一 CTA 按钮文字 | 30 分钟 |
| 🔴 立即 | Hero 副标题改得更具体 | 30 分钟 |
| 🟡 本周 | 开启 GitHub 登录 | 1 行配置 |
| 🟡 本周 | 增加免费试用或 Free Plan | 需讨论定价 |
| 🟡 本周 | 首页更早出现"What is OpenClaw"说明 | 1 小时 |
| 🟡 本周 | 首页增加 Local/VPS/MyClaw 对比区块 | 2 小时 |
| 🟢 下月 | Blog 持续产出 SEO 文章 | 持续投入 |
| 🟢 下月 | 替换为可验证的真实用户 Testimonial | 持续积累 |
| 🟢 下月 | 去掉或核实 SOC 2 / 10000+ 数据 | 1 小时 |
