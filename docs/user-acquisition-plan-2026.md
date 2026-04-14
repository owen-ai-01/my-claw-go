# myclawgo.com 用户获取执行方案

> 制定日期：2026-04-14  
> 参考：myclaw.ai 在约 2 个月内达到 100 万访问量的增长路径  
> 目标：8 周内达到 10 万访问量，首批付费用户 50+

---

## 核心洞察：myclaw.ai 是怎么做到的

通过深度分析 myclaw.ai 的内容结构，其核心打法是：

1. **SEO 内容轰炸**：每天 1-2 篇博客，专门命中每一个 OpenClaw 相关搜索词
2. **竞品对比文章**：大量 "X vs OpenClaw" 文章，截获竞品用户的研究流量
3. **60+ Use Cases 页**：每个 use case 覆盖一个长尾词，形成 SEO 矩阵
4. **Skills Hub（社区市场）**：用户自产内容，形成回流和外链
5. **目录提交**：AI 工具导航站批量收录，获得持续被动流量

**myclawgo.com 的核心优势**：多 Agent 接力对话（relay chain）是真正独特的产品特性，myclaw.ai 没有这个，这是差异化竞争的核心素材。

---

## 总体策略框架

```
基础建设（第 1 周）
    ↓
内容引擎启动（第 2-3 周）
    ↓
爆发式发布（第 4 周 Product Hunt + Reddit）
    ↓
规模化复利（第 5-8 周）
```

---

## 第一阶段：基础建设（第 1 周）

### 目标
把所有"发布前必须有"的东西准备好，这周不追流量。

### Day 1-2：开启基础功能

**① 开启博客**
```
修改 src/config/website.tsx：
blog: { enable: true }
```
- 部署后确认 /blog 路由可访问

**② 开启 Analytics**
```
analytics: {
  enableVercelAnalytics: true,
  enableSpeedInsights: true,
}
```
- 目的：从第一天就记录流量数据，后续有据可依

**③ 开启注册赠积分**
```
registerGiftCredits: {
  enable: true,
  amount: 300,   // 约值 $0.20，感知高
  expireDays: 30,
}
```

**④ 开启 GitHub 登录**
```
enableGithubLogin: true,
```

### Day 3-4：建立社交账号矩阵

| 平台 | 账号名 | 优先级 | 用途 |
|------|--------|--------|------|
| X (Twitter) | @myclawgo | 🔴 必须 | 主要分发渠道，演示 GIF |
| Reddit | u/myclawgo | 🔴 必须 | 社区发帖 |
| YouTube | MyClawGo | 🟡 重要 | 教程视频 |
| LinkedIn | MyClawGo | 🟡 重要 | B2B 用户 |
| Discord | - | 🟢 可选 | 社区建设 |

**注意**：Reddit 账号注册后先在目标 subreddit 互动 3-5 天，避免因账号太新被标记 Spam。

### Day 5-7：提交 AI 工具导航站（批量提交）

以下导航站每个提交约 5-10 分钟，合计约 3-4 小时，但带来的是长期持续流量：

| 导航站 | 提交链接 | 特点 |
|--------|----------|------|
| Futurepedia | futurepedia.io/submit-tool | 流量最大，AI 工具聚合 |
| There's An AI For That | theresanaiforthat.com | 高权重，被大量文章引用 |
| AI Tool Hunt | aitoolhunt.com | 中等流量，收录快 |
| TopAI.tools | topai.tools | 活跃社区 |
| AI Valley | aivalley.ai | 新兴，收录较快 |
| Toolify | toolify.ai | 有流量统计展示 |
| SaaS AI Tools | saasaitools.com | B2B 定向 |
| OpenTools | opentools.ai | 开发者向 |
| AIcyclopedia | aicyclopedia.com | - |
| AIconic | aiconic.ai | - |
| AI Depot | aidepot.co | - |
| AI Scout | aiscout.net | - |
| Insidr.ai | insidr.ai | - |
| AI Finder | ai-finder.net | - |
| EasyWithAI | easywith.ai | - |

**提交模板（英文，复用）：**
```
Product Name: MyClawGo
Website: https://myclawgo.com
Tagline: Multi-agent AI platform with relay chat — your AI team, not just one chatbot
Description: 
MyClawGo lets you create multiple AI agents, organize them into groups, 
and run relay-style conversations where agents hand off to each other 
automatically. Features smart model routing (uses cheap models for simple 
tasks), Telegram bot integration, and persistent memory per agent. 
No VPS needed — cloud-hosted.
Category: AI Productivity / AI Agents / Automation
Pricing: Free credits on signup, Pro from $29.90/mo
```

---

## 第二阶段：内容引擎启动（第 2-3 周）

### 核心认知
myclaw.ai 流量的最大来源是 **SEO 内容**，尤其是竞品对比类文章。这类文章有以下特点：
- 有明确搜索意图（用户在对比工具时会搜索）
- 竞品本身有搜索量，你的对比文章直接截流
- 内容结构简单，写起来快

### 文章生产节奏

**第 2 周目标：写出 10 篇种子文章**（可以用 AI 辅助写，人工润色）

**文章类型 A：竞品对比（高优先级）**

每篇标题格式：`[竞品] vs MyClawGo: Which Multi-Agent AI Platform is Better?`

| 篇序 | 标题 | 目标关键词 | 搜索量预估 |
|------|------|-----------|-----------|
| 1 | ChatGPT vs MyClawGo: When You Need Multiple AI Agents | chatgpt alternatives | 高 |
| 2 | AutoGPT vs MyClawGo: Relay Chat vs Traditional Agent Loops | autogpt alternatives | 中 |
| 3 | OpenClaw vs MyClawGo: Local vs Cloud Multi-Agent | openclaw cloud | 中 |
| 4 | Manus AI vs MyClawGo: Which AI Agent Platform Fits Your Workflow | manus ai alternatives | 中 |
| 5 | CrewAI vs MyClawGo: Developer Framework vs Ready-to-Use Platform | crewai alternatives | 中 |
| 6 | Claude vs MyClawGo: Single AI vs Multi-Agent Relay | claude alternatives | 高 |

**文章类型 B：教程类（长尾，持续带流量）**

| 篇序 | 标题 | 目标关键词 |
|------|------|-----------|
| 7 | How to Set Up a 5-Agent AI Team That Works Without You | multi agent ai setup |
| 8 | How to Connect AI Agents to Telegram in 5 Minutes | ai telegram bot |
| 9 | How to Cut AI Costs by 60% with Smart Model Routing | reduce ai api costs |
| 10 | OpenClaw Without a VPS: Cloud Hosting Guide 2026 | openclaw no vps |

**文章类型 C：行业热点（蹭搜索量）**

每当 AI 领域有重大新闻，快速发布相关评论文章。例如：
- "What [新 AI 发布] Means for Multi-Agent Platforms"
- "Why [热门竞品] Users Are Looking for Relay Chat Alternatives"

### Use Cases 页面建设（第 3 周）

参考 myclaw.ai 的 60+ use cases 策略，建立 `/use-cases` 页面：

**50 个 Use Cases 分类规划：**

```
开发者类（15个）：
- AI Code Review + Auto-Fix Agent
- Overnight Debugging Agent
- Multi-Agent Architecture Discussion
- Test Generation Pipeline
- CI/CD Status Monitor via Telegram
...

创作者类（10个）：
- Newsletter Research + Writing Pipeline
- YouTube Script to Blog Post Relay
- Social Media Content Calendar Agent
- SEO Article Optimizer Team
...

运营/创业类（15个）：
- Customer Support Relay Agent
- Competitor Monitoring Pipeline
- Weekly Business Review Automation
- Lead Qualification Agent Team
...

个人效率类（10个）：
- Personal Knowledge Manager
- Daily Briefing + Task Planner
- Email Triage Assistant
...
```

每个 Use Case 都是独立页面，自然带来长尾搜索词。

---

## 第三阶段：爆发式发布（第 4 周）

这是最重要的一周，目标是单周获得 5 万+ 访问量。

### Day 22（周二）：Product Hunt 发布

**准备工作（提前 1 周）：**
- [ ] 制作 60 秒演示视频（展示 relay chain 的神奇效果）
- [ ] 设计 Product Hunt 封面图（建议展示多个 agent 对话的截图）
- [ ] 准备 Gallery 截图（5 张：Dashboard、Chat、Group Relay、Telegram 绑定、定价）
- [ ] 写好 maker comment（第一个评论，介绍产品故事）
- [ ] 联系 10-20 个早期用户，请他们当天 upvote 并留言

**发布时间：** 美东时间 00:01（北京时间 12:01）

**Product Hunt 描述模板：**
```
MyClawGo — Your AI team, not just one chatbot

We built MyClawGo because we kept hitting the same wall: 
one AI can't handle everything. You need a researcher, 
a writer, a coder, a reviewer — working together.

With MyClawGo:
→ Create multiple AI agents with different personas
→ Group them and let them relay-chat automatically
→ Smart routing sends simple tasks to cheap models (saves 60% cost)
→ Connect to Telegram so your agents work even when you're offline

No VPS. No setup. Start in 5 minutes.

🎁 300 free credits for everyone who signs up today.
```

### Day 23（周三）：Reddit 多社区发布

**目标 Subreddit（按顺序发，不要同天发多个）：**

| Subreddit | 发帖类型 | 标题思路 |
|-----------|----------|---------|
| r/SideProject | Show & Tell | "I built a multi-agent AI platform where agents relay-chat each other" |
| r/artificial | Discussion | "What if your AI team could work like a relay race? (demo inside)" |
| r/MachineLearning | Project | "Multi-agent relay orchestration without code — how we built it" |
| r/ChatGPT | Alternative | "ChatGPT is great but sometimes you need a team of AIs" |
| r/productivity | Tool | "I set up 5 AI agents that hand off tasks to each other automatically" |
| r/selfhosted | Alternative | "Built a hosted OpenClaw alternative with multi-agent relay" |

**Reddit 发帖模板（r/SideProject）：**
```
Title: I built a multi-agent AI platform where AIs relay-chat each other 
       (no setup, no VPS)

Hey r/SideProject!

I've been working on MyClawGo for a few months. The core idea: 
instead of one AI doing everything, you set up a "team" of agents 
that hand off to each other.

Here's how it works:
- You create agents (researcher, writer, critic, etc.)
- Put them in a group
- Send a message → leader responds → @mentions another agent → relay continues
- Stop any time with #stop

[GIF: 30-second relay conversation demo]

We also built a model router that automatically uses cheap/fast models 
for simple tasks and powerful models when needed. This alone saves ~60% 
on AI costs.

Tech: Next.js + Fastify bridge + OpenClaw gateway
Stack: Vercel AI SDK v5, Drizzle ORM, Better Auth

It's live at myclawgo.com — 300 free credits on signup.

Happy to answer any questions about the architecture or business side!
```

### Day 24（周四）：Hacker News Show HN

**HN 帖子标题（需简洁、技术性）：**
```
Show HN: MyClawGo – Multi-agent relay chat platform 
         (agents hand off to each other, smart model routing)
```

**HN 帖子正文：**
```
I built MyClawGo (https://myclawgo.com), a hosted multi-agent AI platform 
with a "relay chain" model: agents pass conversations to each other via 
@mentions, up to a configurable max turns.

The interesting technical bits:
- Bridge server (Fastify) orchestrates between web app and OpenClaw gateway (WebSocket)
- Rule-based L1/L2/L3 model router: short greetings → Gemini Flash, 
  code review → Claude Haiku, architecture → Claude Sonnet
- Relay loop guards prevent cycles and infinite handoffs
- First-touch UTM attribution via cookie → DB

No setup for end users — cloud-hosted OpenClaw workspace.

Would love feedback on the relay UX and model routing approach.
```

### Day 25-27（周末）：X/Twitter 内容冲刺

**发 3 条推文（间隔 24 小时）：**

推文 1（演示型）：
```
I gave 5 AI agents a task and watched them hand it off to each other 
automatically.

Researcher → Writer → Critic → Editor → Publisher

All via @mentions, no code needed.

[GIF 演示]

myclawgo.com — 300 free credits to try it
```

推文 2（数字型）：
```
AI cost breakdown no one talks about:

Simple "hello" → costs same as complex analysis? No.

We built a 3-tier model router:
- L1: Gemini Flash (fast + cheap) for simple tasks  
- L2: Claude Haiku for code/Chinese
- L3: Claude Sonnet for architecture + long context

Result: ~60% cost reduction automatically.

How it works: [link to blog post]
```

推文 3（故事型）：
```
3 months ago I got tired of switching between ChatGPT tabs.

I wanted a researcher, writer, and critic talking to each other — 
not me managing each one manually.

So I built it.

[screenshot of relay conversation]

myclawgo.com
```

---

## 第四阶段：规模化复利（第 5-8 周）

### 内容规模化

**目标：每周 8-10 篇文章**（2 人团队可实现）

**每日写作模板流程（AI 辅助，约 30-45 分钟/篇）：**
1. 确定目标关键词（用 Google Trends / Ahrefs / 免费用 Ubersuggest）
2. 用 Claude 生成文章大纲
3. 人工补充产品独特视角和案例
4. 发布，内链到其他相关文章

**文章发布矩阵（第 5-8 周各周主题）：**

| 周次 | 主题重点 | 目标关键词集群 |
|------|----------|---------------|
| 第 5 周 | 竞品对比第二批 | n8n vs, make.com vs, Zapier vs |
| 第 6 周 | 使用场景深度 | ai automation, workflow automation |
| 第 7 周 | Telegram AI 专题 | telegram bot ai, telegram agent |
| 第 8 周 | 开发者工具专题 | multi agent framework, agent orchestration |

### KOL 外联计划

**Week 5-6 联系以下类型的创作者：**

| 类型 | 粉丝规模 | 接触方式 | 提供条件 |
|------|----------|---------|---------|
| AI 工具 YouTuber | 1-10 万 | 邮件/X DM | 免费 Pro 账号 3 个月 |
| AI Newsletter 作者 | 5000-5万 | 邮件 | 免费 Pro 账号 + 独家功能抢先体验 |
| 独立开发者 Twitter 博主 | 5000-5万 | X DM | 合作推广，互推 |
| 播客主持人（AI/自动化主题） | 任意 | 邮件 | 作为嘉宾分享产品故事 |

**外联邮件模板：**
```
Subject: Free Pro access to MyClawGo — multi-agent relay AI platform

Hi [Name],

Loved your [具体内容] — it's exactly the audience I'm building for.

I'm the founder of MyClawGo (myclawgo.com). We let users create teams 
of AI agents that relay-chat with each other automatically — think 
researcher → writer → critic, all on autopilot.

I'd love to give you a free Pro account to try it. If it resonates 
with your audience, I'd be happy to provide an affiliate link too.

No pressure either way. Happy to jump on a 15-min demo call.

[Name]
```

### 联盟推荐计划启动（第 6 周）

**配置建议：**
- 佣金：30%（市场中等偏高，激励强）
- 发放时机：用户付费满 30 天后
- 推荐人奖励：每成功推荐 1 名付费用户，推荐人获 30% 首月佣金
- 被推荐人奖励：额外 500 积分（约值 $0.38）

**开启方式：**
```
enableAffonsoAffiliate: true  // 或 enablePromotekitAffiliate: true
```

### Use Cases 社区征集（第 7 周）

参考 myclaw.ai 的 Skills Hub 策略：

1. 在 X、Reddit 发帖征集用户的使用方式
2. 最优秀的 use case 展示在官网 `/use-cases` 页面并@作者
3. 贡献者获得 1 个月免费 Premium 账号
4. 每周在 X 上发布"本周最酷 Use Case"

---

## 关键指标追踪

| 指标 | 第 2 周末 | 第 4 周末 | 第 6 周末 | 第 8 周末 |
|------|----------|----------|----------|----------|
| 月访问量 | 500 | 10,000 | 30,000 | 100,000 |
| 注册用户 | 50 | 300 | 800 | 2,000 |
| 付费用户 | 2 | 15 | 35 | 80 |
| MRR | $60 | $450 | $1,000 | $2,400 |
| 博客文章数 | 10 | 25 | 50 | 80+ |
| 导航站收录 | 15 | 25 | 30 | 35 |
| 外链数量 | 5 | 30 | 80 | 150+ |

---

## 本周立即执行清单（优先级排序）

```
🔴 今天（1 小时内）：
  □ 注册 X/Twitter 账号 @myclawgo
  □ 注册 Reddit 账号
  □ 开启 Vercel Analytics（1 行代码）

🔴 本周（优先）：
  □ 录制 30 秒 relay 对话演示 GIF/视频
  □ 写前 5 篇博客文章（竞品对比类）
  □ 提交 15 个 AI 导航站
  □ 开启 blog + GitHub 登录 + 注册赠积分

🟡 下周：
  □ 第一批 Reddit 发帖
  □ 写 Use Cases 页面内容
  □ 联系第一批 KOL
  □ 准备 Product Hunt 发布材料

🟢 第 4 周：
  □ Product Hunt 正式发布（周二）
  □ HN Show HN 发布
  □ X 内容冲刺
```

---

## 附：myclaw.ai 增长打法拆解总结

通过分析其博客内容结构，myclaw.ai 的 100 万访问量主要来自：

| 流量来源 | 估计占比 | 核心策略 |
|---------|---------|---------|
| SEO 自然搜索 | ~55% | 竞品对比文章 + 教程文章，每天发布 |
| AI 导航站引荐 | ~20% | 批量提交 20+ 导航站 |
| 社交媒体（X/Reddit） | ~15% | 产品演示内容，社区参与 |
| 直接访问 | ~10% | 品牌认知积累，口碑传播 |

**关键启示**：他们并不是靠一次爆发，而是靠**每天高频发布内容**形成 SEO 复利——前两周看不到效果，第 4-6 周开始指数级增长。

**myclawgo.com 的差异化优势**：relay chain 多 Agent 对话是 myclaw.ai 没有的，这是独特的演示素材，在 X 上的演示 GIF 有很强的传播潜力。
