# 竞品深度架构分析报告

> 版本：2026-04-22  
> 研究对象：StartClaw、MyClaw.ai、SimpleClaw、UniClaw、Every.to Plus One  
> 背景：OpenClaw 在 2026 年初病毒式爆发（GitHub 184,000+ Stars，月访问 3800 万，Reddit 10.3 万成员），催生了 104+ 个 OpenClaw 封装产品，合计 MRR 超过 $100K。本报告对其中有代表性的 5 个产品做深度架构与产品分析。

---

## 一、StartClaw（startclaw.com）

### 产品定位

"No Docker, no terminal, no setup — deploy an AI agent in 60 seconds."

2026 年 1 月上线，创始人是 Indie Hackers 用户 @StartClaw（匿名），起因是自己凌晨 2 点 Docker 网络故障被逼出来的。面向完全不懂技术的用户。

### 定价

| 套餐 | 月费 | 年费 |
|------|------|------|
| Free | $0 | — |
| Pro | $29/mo | $290/yr（约 $24/mo）|
| Max | $199/mo | $1,990/yr（约 $166/mo）|

**特殊点：AI 额度内置在套餐里**（Free 300 credits，Pro 1500，Max 20000）。不需要 BYOK，降低了普通用户的上手门槛。这是本组竞品里唯一内置 AI 额度的产品。

### 技术架构（推断）

- **前端**：Next.js（Vercel 托管迹象）
- **计算模型**：每用户独立 VM（"each AI runs on isolated infrastructure"，声称 SOC 2 合规）
- **执行环境**：Python、JavaScript、Bash 可运行，支持包安装
- **实时性**：Live Desktop View（实时流式查看 agent 操作屏幕）+ 截图捕获 + Session 录制
- **消息通道**：WhatsApp（二维码）、Telegram、Discord、Slack、Email
- **调度**：类 Cron 的 Heartbeat 定时任务

### 核心功能

- 浏览器自动化（导航/填表/截图/数据提取）
- 代码执行（隔离沙箱）
- 文档创建（Markdown、电子表格、PDF；CSV/Excel/PDF 导出）
- **实时 Live Desktop 流**（看 agent 实时操作，竞品中独有）
- 定时任务（Heartbeat cron）
- 跨会话持久记忆
- Google Ads API 自动化（特殊垂直领域功能）

### 推广策略

- Indie Hackers "build in public" 帖子
- X/Twitter 社区（44 成员，@StartClaw）
- 早鸟优惠码 + 48 小时免费试用
- SEO 定向"OpenClaw hosting"、"deploy OpenClaw"关键词

### 优势

- **免费套餐**：降低试用门槛
- 内置 AI 额度（无需准备 API Key）
- Live Desktop 流式查看（竞品无）
- SOC 2 合规声称

### 劣势 / 风险

- **数据严重注水**：称有 10,000+ agents、5000 万条消息、150 国用户，但实际 Indie Hackers 披露上线 3 天只有 20 个注册、0 个付费，总收入约 $9,202
- 注册后空白状态，onboarding 差
- Credit 兑换比例不透明
- 社区极小，无 Product Hunt 上架，几乎无 Reddit 讨论
- 初期阶段，长期可靠性未知

---

## 二、MyClaw（myclaw.ai）

### 产品定位

隐私优先的专属 VPS 托管，每个用户一台独立机器，可 SSH 登录。面向有一定技术能力、重视数据隐私的进阶用户。

### 定价

| 套餐 | 月费 | 年费 | vCPU | RAM | 存储 |
|------|------|------|------|-----|------|
| Lite | $19/mo | $199/yr（$16/mo）| 2 | 4 GB | 40 GB SSD |
| Pro | $39/mo | $399/yr（$33/mo）| 4 | 8 GB | 80 GB SSD |
| Max | $79/mo | $799/yr（$66/mo）| 8 | 16 GB | 160 GB SSD |
| Ultra | 定制 | $1,599/yr+（$133/mo+）| 16–64 | 32–128 GB | 320–1,280 GB SSD |

纯 BYOK 模型，AI 费用完全外置。实际总成本：Lite 大约 $29–$49/mo（含 API 费用）。

### 技术架构（推断）

- **前端**：Next.js（page source 确认）
- **计算模型**：真正的专属独立 VPS，非共享容器
- **云服务商**：行业模式推断为 DigitalOcean 或 Hetzner
- **访问方式**：完整 SSH/root 访问权限（竞品中唯一提供这个的）
- **安全**：端对端加密连接，每日自动备份
- **通道**：WhatsApp、Telegram、Discord、Slack、GitHub 等 50+ 集成

### 核心功能

- 专属独立服务器（非共享）
- **Full SSH/root 访问**（区别于所有其他竞品）
- 自动更新和安全补丁管理
- 每日备份 + 可恢复
- 50+ 集成（含 GitHub）
- Ultra 套餐支持 64 vCPU，面向企业级

### 推广策略

- 高频博客输出（30+ 篇，重 SEO，大量"MyClaw vs XXX"对比文章抢对手流量）
- 定位"开源爱好者"，打技术圈用户
- SourceForge、Trustpilot 社交证明（但评价极差）

### 优势

- 最高原始计算资源（Ultra 64 vCPU）
- SSH/root 完整访问——技术用户的最大需求
- 隐私优先定位清晰

### 劣势 / 风险

- **信任问题严重**：Gridinsoft 评分 35/100，WHOIS 隐藏，域名极新，被多个安全工具列入黑名单
- **平台不稳定**：SourceForge 有"系统宕机 2 天"的评价，Trustpilot 有 session 崩溃、消息消失、媒体处理损坏
- **隐藏收费**：用户投诉订阅后发现还需要额外 credits 才能使用，未事先告知
- **零客服响应**
- **没有免费套餐**，起步就要 $19/mo 加 API 费用
- 博客内容量大但质量低，疑似 AI 批量生成

---

## 三、SimpleClaw（simpleclaw.com）

### 产品定位

最具传奇性的创业故事：来自印度喀拉拉邦的 18 岁开发者 Savio Martin 在 2026 年 2 月 OpenClaw 爆红期间闪电上线，获得 @levelsio 推文背书后病毒传播，5 天 $17K MRR，两周 $30K MRR，30 天 $41K 总收入、700+ 订阅用户。随即以 $225 万要价挂牌出售。

### 定价

网站不公开价格（"稀缺营销"——"仅剩 11 台服务器"）。第三方数据推算约 $44/mo 均价，BYOK 模型。

### 技术架构（推断）

- **前端**：Next.js + React（page source build artifacts 确认）
- **后端**：Node.js/Express + Docker 容器编排
- **计算模型**：每用户独立 VPS 容器（DigitalOcean 或 Hetzner，自动化采购）
- **认证**：Google OAuth
- **支付**：Stripe
- **托管**：Vercel（前端）+ 独立 VPS（agent）
- **通道**：Telegram（确认）、Discord（确认）、WhatsApp（"即将推出"）
- **AI 模型**：Claude Opus 4.5、GPT-5.2、Gemini 3 Flash 可选
- **规格**：8 vCPU / 8 GB RAM / 最高 250 GB 存储

### 核心功能

- 注册时选择 AI 模型（Claude/GPT/Gemini）
- 自然语言配置 agent
- 邮件管理、文档摘要、会议排期、费用追踪、合同生成、销售线索筛选
- 24/7 持续运行
- 多实例支持

### 推广策略

- **病毒时机**：OpenClaw 爆红时第一个冲出来，先发优势明显
- **@levelsio 背书**：77,000 次推文浏览触发跨越式传播
- **稀缺营销**："仅剩 11 台服务器"
- **YC 录取**：被 Y Combinator 录取（重要合法性背书）
- **$SIMPLECLAW 代币**：同步发行（争议极大）

### 优势

- 上市最快（OpenClaw 爆红后几天内）
- YC 背景
- @levelsio 病毒式背书
- 注册时可选模型（竞品少见）
- 实际证明了市场需求（$41K 收入，700 用户）

### 劣势 / 风险

- **创始人立即要卖**：上线即挂牌出售，对用户是巨大红旗
- **无价格透明**：用户报告价格惊喜
- **可靠性极差**："一次交互后崩溃"，无调试工具
- **安全事故**：有报告未经授权访问和数据泄露
- **Trustpilot 3.2 星**："产品不工作，零客服，无法退款"
- **$SIMPLECLAW 代币**发行是严重的信任危机
- ScamDoc 信任评分 25%

---

## 四、UniClaw（uniclaw.ai）

### 产品定位

本组竞品中技术最完善、功能最全面的产品。不只是 VPS 转卖，而是有自研运行时（TypeScript/Rust 的 clawrun 项目）。提供 40+ 预装技能、340+ AI 模型、零暴露防火墙、agent 应用发布（`*.clawrun.app` 子域名）、浏览器内终端等大量自研功能。

### 定价

| 套餐 | 月费 | vCPU | RAM | 存储 |
|------|------|------|-----|------|
| Lite | $12/mo | 1 | 1 GB | 25 GB SSD |
| Core | $22/mo | 1 | 2 GB | 50 GB SSD |
| Plus | $32/mo | 2 | 2 GB | 60 GB SSD |
| Pro | $42/mo | 2 | 4 GB | 80 GB SSD |
| Turbo | $72/mo | 4 | 8 GB | 160 GB SSD |
| Max | $132/mo | 8 | 16 GB | 320 GB SSD |

BYOK 或通过 OpenRouter 按用量付费（OpenRouter 按 token 计，不是月度订阅）。所有套餐功能相同，只按算力分级。

### 技术架构（较确定）

- **前端**：Next.js（确认）
- **后端运行时**：自研 clawrun（TypeScript 88.6%、Rust 3.2%，pnpm + Turbo monorepo，GitHub: clawrun-sh/clawrun，91 stars）
- **计算模型**：每用户专属云机器（非共享）
- **安全架构（零暴露）**：
  - **无开放端口，无公网 IP**
  - 所有流量通过加密隧道传输
  - 拒绝所有入站连接；只接受认证后的隧道流量
  - 这是技术上真正优越的安全设计
- **AI 路由**：OpenRouter 集成，支持 340+ 模型（Claude/GPT/Gemini/DeepSeek 等）
- **应用发布**：自动分配 `*.clawrun.app` 子域名，agent 可对外暴露 Web 界面
- **Web 控制台**：浏览器内终端 + 文件浏览器 + 监控 + 诊断（无需 SSH）
- **通道**：Telegram、WhatsApp、Discord、Slack、Feishu、Lark、DingTalk、WeCom（覆盖中文市场）
- **技能**：40+ 预装预配置技能（含搜索、图像生成、浏览器自动化、代码执行、PDF 处理）
- **备份**：自动配置备份 + 一键回滚
- **基准测试**：OpenClaw Arena（跨 19 个模型的 500 项基准测试）

### 核心功能

- 40+ 预装技能，开箱即用
- 340+ AI 模型按需切换
- **`*.clawrun.app` 应用发布**（竞品无）
- 浏览器内终端 + 文件管理（无需任何 CLI）
- **零暴露防火墙**（技术最强安全设计）
- 8+ 消息通道（含 Feishu、DingTalk 中国平台）
- OpenClaw Arena 内置基准测试工具
- 智能诊断与自动恢复
- 每台云机自动备份

### 推广策略

- **大量 SEO 内容**（33+ 分类博客，覆盖所有 OpenClaw 使用场景）
- **OpenClaw Arena 双用途**：产品功能 + SEO 飞轮（用户来测试模型，顺带发现 UniClaw）
- YouTube 频道（@UniClawai）
- 定位"功能完整的托管平台"——暗示竞品不完整
- 定向亚洲市场（Feishu、DingTalk、WeCom 集成）

### 优势

- **`*.clawrun.app` 应用发布**：唯一提供此功能的产品，agent 可作为 Web App 对外服务
- **零暴露防火墙**：技术上最强的安全模型
- **自研 TypeScript/Rust 运行时**：不是简单 VPS 转卖，有真正的技术护城河
- **最低入门价格**（$12/mo）且功能最全
- **340+ AI 模型**（OpenRouter 集成）
- **浏览器内终端**：消除所有 CLI 需求
- **中文平台集成**：覆盖 Feishu/Lark/DingTalk/WeCom

### 劣势 / 风险

- **团队完全匿名**：无 LinkedIn、About 页面 404、无融资信息
- 无免费套餐
- AI 费用额外（OpenRouter 按 token 收费），定价复杂
- Lite 套餐 1 GB RAM 对 OpenClaw 实际运行偏紧
- 无独立评价，Product Hunt 未确认上架
- clawrun GitHub 仅 91 stars，社区规模有限

---

## 五、Every.to Plus One（every.to/plus-one）

### 产品定位

**与其他四个产品完全不同的路线**。Every 是一家媒体 + 软件公司（2020 年创立，CEO Dan Shipper），Plus One 是其 OpenClaw agent 产品，但定位是"知识工作者和团队的首席助理"，而非开发者工具。

活在 Slack 里，不需要学新工具。面向企业团队，而非个人技术用户。

### 定价

**尚未公开**（2026 年 4 月 22 日写稿时仍为邀请制，每周仅 20 个用户上线）。Every 订阅 $20/mo 或 $288/yr，Plus One 在邀请期间内含在 Every 订阅中。Dan Shipper 提到每用户需要专属服务器，暗示正式上线后价格不低。

### 技术架构（部分公开）

- **运行时**：OpenClaw（官方明确说明）
- **计算模型**：每用户专属服务器 + 零数据保留 LLM
- **集成方式**：Slack 原生（1-click 安装到工作区）
- **Every 自研 App 套件**：
  - Cora（邮件）
  - Spiral（语音转内容）
  - Proof（文档协作）
  - Monologue（语音听写）
  - Sparkle（文件整理）
  - Lex（AI 写作）
- **分析栈**：PostHog、Google Analytics、Facebook Pixel、Intercom、Cloudflare CDN
- **多 agent**：多个 Plus One 可以在团队内协同工作

### 核心功能

- **Slack 原生**（用户无需学任何新工具）
- 与 Every App 套件深度集成
- 真实团队 agent 案例：R2-C2（Bug 分类）、Iris（市场运营）、Alfredo（设计系统）、Montaigne（增长实验）
- 自主执行周期性任务
- 跨团队多 agent 协作
- 长期记忆（自我改进）
- Google Workspace + Notion 连接

### 推广策略

- **利用 Every 现有受众**（大型订阅通讯，不需要从零获客）
- 邀请制候补名单（制造稀缺感）
- 内容营销（AI & I 播客，每日通讯，深度文章）
- B2B 企业定位，客户案例 3 个（公司，非个人）
- 无付费广告迹象，纯有机增长

### 优势

- **唯一嵌入媒体公司的产品**：Every 的分发渠道是其他四个产品没有的
- **Slack 原生**：在用户已在用的工具里运行，零学习成本
- **深度集成 Every App 套件**：独有，竞品无法复制
- **团队协作多 agent**：其他竞品基本都是单用户产品
- **B2B 企业角度**：客户预算更大，续费率更高
- **Dan Shipper / Every 的品牌信誉**：在 AI/科技媒体有 6 年积累
- **不叫"DevOps"**：叫"首席助理"——完全不同的产品叙事

### 劣势 / 风险

- 无价格透明
- 候补名单摩擦（每周 20 个）
- **仅 Slack**：不支持 WhatsApp、Telegram、Discord、Web Dashboard
- 功能集不透明（无技能列表、无模型列表、无规格）
- 对开发者和高级用户无吸引力（无 BYOK、无 SSH、无模型选择）
- 与 Every 生态绑定（不用 Cora/Spiral 等就失去大量价值）
- 定价尚未公布

---

## 六、横向对比矩阵

### 技术能力对比

| 维度 | StartClaw | MyClaw | SimpleClaw | UniClaw | Every Plus One |
|------|-----------|--------|------------|---------|----------------|
| 计算模型 | 独立 VM | 独立 VPS | 容器（VPS）| 专属云机 | 专属服务器 |
| SSH/root 访问 | ❌ | ✅ | ❌ | ❌（Web 终端代替） | ❌ |
| 流式输出 | ✅ Live Desktop | ❌ | ❌ | ❌（未确认） | ❌（未确认） |
| 自研运行时 | ❌ | ❌ | ❌ | ✅（clawrun）| ❌（原生 OpenClaw）|
| 安全架构 | 隔离 VM | 独立 VPS | 容器 | 零暴露无公网 IP | 专属服务器 |
| 应用发布 | ❌ | ❌ | ❌ | ✅（*.clawrun.app）| ❌ |
| Web 终端 | ❌ | ❌ | ❌ | ✅ | ❌ |
| 模型数量 | 少（内置）| BYOK 任意 | 3 种可选 | 340+（OpenRouter）| 不透明 |
| 技能预装 | 部分 | ❌（原生）| 部分 | 40+ | Every 套件 |
| 多 agent 协作 | ❌ | ❌ | ❌ | ❌（未确认）| ✅ |

### 推广渠道对比

| 维度 | StartClaw | MyClaw | SimpleClaw | UniClaw | Every Plus One |
|------|-----------|--------|------------|---------|----------------|
| 免费套餐 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 产品最低价 | $0 | $19/mo | ~$44/mo | $12/mo | 未公布 |
| 博客 SEO | 初步 | 大量（质量低）| 无 | 大量（质量高）| 高质量通讯 |
| 病毒传播 | 少 | 少 | ✅（levelsio）| 中 | ✅（Every 受众）|
| 融资/背书 | 无 | 无 | YC | 无 | Every 品牌 |
| 社区 | 微小 | 负面为主 | 快速但不稳 | 中等 | 精英小圈子 |
| 目标市场 | 普通用户 | 技术用户 | 普通用户 | 开发者/技术用户 | 企业团队 |

### 可信度与风险

| 产品 | 信任评分 | 主要风险 |
|------|---------|---------|
| StartClaw | 中（数据注水）| 数据造假，规模不可核实 |
| MyClaw | ⚠️ 低（35/100）| 宕机、隐藏收费、信任危机 |
| SimpleClaw | ⚠️ 低（25%）| 创始人想卖、代币、可靠性差 |
| UniClaw | 中（团队匿名）| 无法核实背景，但产品本身扎实 |
| Every Plus One | 高（品牌背书）| 无价格透明、可用性限制 |

---

## 七、市场背景与结构性风险

### OpenClaw 政策变化（2026 年 4 月）

Anthropic 于 2026 年 4 月 4 日修改 Claude 订阅政策：**Claude 订阅用户不再可以用订阅额度通过第三方工具（含 OpenClaw）使用 Claude**。

这个政策变化直接打击了所有"帮用户省钱用 Claude"的定位，整个生态的经济模型受到冲击。各产品需要：
- 转向 BYOK + OpenRouter 策略
- 或建立自己的 AI 成本分摊模型

### 护城河稀薄的根本原因

OpenClaw 本身开源，自托管成本 $5–$20/月（一台 Hetzner cx22）。真正的护城河必须来自：

1. **运营经验**（帮用户解决部署和维护的麻烦）
2. **生态集成**（预装技能、渠道集成、应用发布）
3. **企业级功能**（多 agent 协作、合规、账单管理）
4. **分发渠道**（Every 的通讯受众、UniClaw 的 SEO、SimpleClaw 的病毒传播）

纯粹的"一键部署 + 托管"已经是红海，护城河几乎为零。
