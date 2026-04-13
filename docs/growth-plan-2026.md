# MyClawGo 推广增长计划 2026

> 制定日期：2026-04-13  
> 目标：冷启动期获取首批付费用户，验证产品市场匹配度（PMF）

---

## 一、产品定位

**MyClawGo** 是一个多 AI 智能体 SaaS 平台，核心差异点：
- 用户可配置多个 AI Agent，形成群组并进行接力对话（relay chain）
- 支持 Telegram Bot 绑定，实现跨平台消息
- 支持 L1/L2/L3 模型路由，自动选择最合适的 AI 模型（降本增效）
- 定价：Free / Pro($29.90) / Premium($59.90) / Ultra($199.90)，另有按量积分包

**目标用户：** 重度 AI 用户、独立开发者、内容创作者、AI 工具爱好者（以英文市场为主）

---

## 二、冷启动阶段（第 1-4 周）

### 目标
- 注册用户：100+
- 付费用户：5-10 个
- 重点验证：哪个场景最受用户认可

### 行动项

#### 1. 社区发帖（零成本，高性价比）

| 平台 | 内容形式 | 目标 |
|------|----------|------|
| Reddit r/SideProject | Show HN 风格帖子，讲故事 | 早期用户 |
| Reddit r/artificial | Agent 对话截图 + 功能介绍 | AI 爱好者 |
| Reddit r/selfhosted | 提 Telegram Bot 绑定特性 | 技术用户 |
| Hacker News (Show HN) | 技术向，强调 relay chain 创新 | 开发者 |
| Product Hunt | 正式上线页，收集 upvote | 曝光 + 反馈 |
| X (Twitter) | 简短视频/GIF 演示 relay 对话 | 病毒传播 |
| Discord AI 社群 | 找 AI 工具相关的 Discord 发帖 | 精准用户 |

**发帖模板思路（Show HN 风格）：**
```
I built MyClawGo — a multi-agent AI platform where you can 
set up a group of AI agents and have them relay-chat with each other.

Key features:
- Create multiple agents with custom personas
- Group relay mode: agents hand off to each other automatically
- Telegram bot binding
- Smart model routing (uses cheap/fast models for simple tasks)

Here's a demo: [GIF/video link]
myclawgo.com — free plan available
```

#### 2. 制作演示素材

- **演示 GIF / 短视频（最重要）**：录制一段 relay 对话的实时演示，展示多 agent 协作，30秒内
- **对比图**：MyClawGo relay chain vs 单一 ChatGPT 对话的差异
- 上传到 YouTube / X / LinkedIn

#### 3. 直接触达潜在用户

- 在 X 上搜索提到 "multi-agent" / "AI workflow" / "AI automation" 的用户，@回复并介绍工具
- 找正在做 AI 工具评测的 YouTuber / blogger，提供免费 Pro 账号换评测
- 找 AI 工具导航站收录：There's An AI For That、Futurepedia、AI Tool Hunt 等

---

## 三、增长阶段（第 2-3 个月）

### 目标
- 注册用户：500+
- 付费用户：30-50 个（MRR $1,000+）

### 行动项

#### 1. 内容营销（SEO 中长期）

- 开启博客（`websiteConfig.blog.enable` 目前为 false，需要启用）
- 目标关键词：
  - `multi-agent AI platform`
  - `AI agent relay chat`
  - `custom AI chatbot with Telegram`
  - `AI workflow automation`
- 每周 1-2 篇教程/案例文章，例如：
  - "How to build a 5-agent debate team with MyClawGo"
  - "Setting up a Telegram AI assistant in 5 minutes"
  - "How relay mode saves you 60% AI costs with model routing"

#### 2. 联盟/推荐计划

- **已有基础**：UTM tracking 已上线（`myclawgo_utm` cookie），可追踪来源
- **建议启用 Affonso 或 PromoteKit**（`enableAffonsoAffiliate` / `enablePromotekitAffiliate` 目前为 false）
- 给推荐人设置佣金（建议 20-30%），激励用户自发推广
- 给被推荐新用户赠送积分（`registerGiftCredits` 目前 disable，可以启用）

#### 3. KOL / 合作

- 找 AI 领域 YouTube / Twitter KOL（1-10 万粉）换评测
- 找 No-Code / Automation 社群（Make.com、Zapier 社群）做演讲或帖子
- 找独立开发者聚集的群体（IndieHackers、Maker community）分享 bootstrapping 故事

#### 4. 产品内增长钩子

- 邀请好友机制：邀请成功 → 双方均获积分奖励
- 免费 Plan 显示"Powered by MyClawGo"水印（可选，讨论）
- 用户分享对话结果到 X 时自动带产品链接

---

## 四、渠道优先级排序

```
优先级高（立即做）：
1. Reddit Show HN 风格帖子
2. Product Hunt 上线
3. X 上演示 GIF 发布
4. AI 工具导航站收录

优先级中（1个月内）：
5. 联盟推荐计划启用
6. 注册赠积分启用
7. KOL 换评测触达

优先级低（长期）：
8. SEO 博客内容
9. YouTube 教程视频
10. Discord 社群运营
```

---

## 五、关键指标追踪

| 指标 | 冷启动目标（4周） | 增长目标（3个月） |
|------|-------------------|-------------------|
| 注册用户 | 100 | 500 |
| 付费用户 | 5-10 | 30-50 |
| MRR | $200 | $1,000+ |
| 主要来源渠道 | Reddit / PH / X | SEO + 推荐 |
| UTM 来源追踪 | 已上线 ✅ | 分析并倍投高效渠道 |

---

## 六、近期待办（本周）

- [ ] 录制 30 秒 relay 对话演示视频/GIF
- [ ] 起草 Reddit Show HN 发帖文案
- [ ] 在 AI 工具导航站（Futurepedia 等）提交收录申请
- [ ] 填写 X/Twitter / LinkedIn 社交媒体链接（当前 `websiteConfig.social` 均为空）
- [ ] 确定是否启用联盟推荐计划（Affonso / PromoteKit）
- [ ] 考虑启用注册赠积分（建议 200 积分，约值 $0.15，低成本高感知）

---

## 七、注意事项

- 不要在多个平台发完全相同的文案，容易被标记为 spam
- Reddit 发帖前先在该 subreddit 有一定互动历史，避免被删帖
- Product Hunt 上线最好选周二/周三，流量最高
- 现阶段 `enableCredentialLogin` 为 false（只支持 Google 登录），注意提示新用户
