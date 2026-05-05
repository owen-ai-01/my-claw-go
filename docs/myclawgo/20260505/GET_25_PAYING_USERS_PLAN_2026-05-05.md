# 25 个付费用户获客方案

**日期：** 2026-05-05  
**背景：** 当前有 25 个 VPS 槽位可立即分配，目标是尽快填满这 25 个付费席位  
**当前定价：** Pro $29.90/mo · Premium $59.90/mo · Ultra $199.90/mo

---

## 一、现状评估

### 资产盘点
| 资产 | 状态 |
|---|---|
| 25 个 VPS 槽位 | ✅ 就绪 |
| 官网 myclawgo.com | ✅ 上线 |
| 3 篇 SEO 博客 | ✅ 已发布 |
| /openclaw-hosting 落地页 | ✅ 已上线 |
| Pro 订阅流程 | ✅ Stripe 接入 |
| 多 Agent 群组功能 | ✅ 独有功能 |

### 当前短板
- 无社区曝光（Reddit/GitHub 没有帖子）
- 无用户评价 / 案例
- SEO 文章刚发布，排名需要时间
- 无免费试用钩子

### 目标收入（填满 25 个槽）
- 25 × Pro $29.90 = **$747.50/mo**
- 若 10 Pro + 10 Premium + 5 Ultra = **$1,888/mo**

---

## 二、获客策略

### 策略 A：限时早鸟定价（最快见效，本周内）

**方案：** 前 25 名用户享受"创始会员价"，锁定终身折扣

| 套餐 | 正常价 | 早鸟价 | 折扣 |
|---|---|---|---|
| Pro | $29.90/mo | $16.90/mo | 44% off |
| Premium | $59.90/mo | $33.90/mo | 43% off |

**执行：**
1. 在 Stripe 创建 Coupon（FOUNDER25，50% off，仅限前 25 次使用）
2. 定价页面顶部加 Banner："🚀 Founding Member Pricing — 25 seats only"
3. 在所有推广渠道统一打"创始会员"概念

**心理逻辑：** 稀缺性（只有 25 个）+ 永久折扣（值得早下手）

---

### 策略 B：Reddit 直接触达（本周，优先级最高）

**目标社区：**

**r/OpenClaw**（最精准）
- 发帖：《I got tired of babysitting my self-hosted OpenClaw. So I built a managed version.》
- 内容：以第一人称讲述自托管的痛点（SSL 过期、Node 版本冲突、凌晨宕机无报警），然后自然引出 MyClawGo
- 结尾：提供创始会员链接，首批 25 席

**r/selfhosted**
- 发帖：《Self-hosting OpenClaw for 3 months — here's the honest time breakdown》
- 内容：具体数字（4 小时初始配置、2 小时 Node 版本冲突、45 分钟证书过期），吸引"想用但怕麻烦"的用户
- 不硬推，评论里有人问再自然提

**r/artificial / r/ChatGPT**
- 发帖：《Multi-agent relay for OpenClaw — how to chain 3 agents to write, review, and edit autonomously》
- 内容：展示 MyClawGo 的多 Agent 功能（竞品没有），截图/GIF 演示

**发帖节奏：** 每隔 2 天一个社区，避免集中被判广告

---

### 策略 C：OpenClaw 官方 GitHub 曝光（本周）

**行动 1：** 在 OpenClaw 官方仓库的 README（如有 "Hosting" 或 "Deploy" 小节）提交 PR，加入 MyClawGo 链接

**行动 2：** 在 GitHub Issues 里搜索近 30 天内问"how do I host OpenClaw"类型的 issue，提供有帮助的回答，自然提及 MyClawGo

**预计回报：** 5-10 个精准访问/天，转化率高（已经在研究部署问题的用户）

---

### 策略 D：直接 DM 自托管用户（本周）

在 Reddit 搜索历史帖子（过去 6 个月）：
- `"self-hosted openclaw"` 
- `"openclaw vps"`
- `"openclaw install"`

找到曾经提问或分享自托管经验的用户，发送 DM：

> "Hi, I saw your post about self-hosting OpenClaw — we just launched a managed version that handles setup, updates, and backups automatically. Founding member price is $16.90/mo (normally $29.90). 25 spots only. Happy to share a link if interested."

**预计回报：** 发 50 条 DM，预期 2-5 个付费

---

### 策略 E：中文社区（V2EX / 即刻 / 少数派）

**V2EX（节点：分享创造）**
- 标题：《做了一个 OpenClaw 托管服务，解决自部署的维护烦恼》
- 核心卖点：多 Agent 接龙功能、中文界面、独立 OpenRouter Key
- 价格优势：对比 myclaw.ai 的 $33/mo，MyClawGo Pro $29.90

**即刻**
- 发布使用场景截图：多 Agent 自动接龙完成一篇文章的全流程
- 附链接

**少数派**
- 投稿：《OpenClaw 托管服务横评：我为什么从自托管切换到 MyClawGo》

---

### 策略 F：Product Hunt 发布（第 2 周）

**时机：** 等前 5 个付费用户入驻后，有真实评价再发布  
**发布标题：** "MyClawGo — Managed OpenClaw Hosting with Multi-Agent Relay"  
**Tagline：** "The only OpenClaw host with multi-agent relay. No VPS. No maintenance. 5 minutes setup."  

**准备清单：**
- [ ] 3 张产品截图（Dashboard、群组配置、relay 运行中）
- [ ] 60 秒 demo 视频
- [ ] 5 个早期用户评价
- [ ] Hunter 联系（找 500+ follower 的人来 hunt）

---

## 三、转化漏斗设计

### 落地页优化（本周内修改）

**当前问题：** `/openclaw-hosting` 页面没有 Free Trial 或低门槛入口

**优化项：**
1. **加 7 天免费试用**：减少首次付费的心理阻力
   - Stripe 支持 trial_period_days，不需要改 DB schema
   - 试用期内创建 VPS，到期不续费则停止实例

2. **加实时席位计数器**："仅剩 X 个席位 / 25"（可以先手动改数字）

3. **FAQ 新增问题：** 
   - "Can I cancel anytime?" → Yes, no commitment
   - "What happens to my data if I cancel?" → Stays 7 days, then archived

### 注册到付费的流程
```
访客点击 CTA
    ↓
注册账号（Google OAuth，10秒）
    ↓
选择套餐 → Stripe Checkout（可加 FOUNDER25 折扣码）
    ↓
自动申请 VPS（5分钟内 ready）
    ↓
Dashboard 显示 OpenClaw 实例链接
    ↓
onboarding 邮件：如何添加第一个 Agent
```

---

## 四、内容辅助（配合推广）

### 本周必发博客（配合 Reddit 推广）
以下 2 篇博客需要在 Reddit 发帖前发布，用来作为帖子的"延伸阅读"链接：

| 博客标题 | 配合的 Reddit 帖子 |
|---|---|
| MyClawGo vs MyClaw.ai: Which OpenClaw Host Wins in 2026? | r/OpenClaw 帖子 |
| OpenClaw Multi-Agent Groups: A Step-by-Step Setup Guide | r/artificial 帖子 |

---

## 五、执行时间表

### 第 1 天（今天）
- [ ] Stripe 创建 FOUNDER25 折扣码（50% off，限 25 次）
- [ ] 定价页面加创始会员 Banner
- [ ] `/openclaw-hosting` 页面加席位计数和试用说明

### 第 2-3 天
- [ ] 写并发布"MyClawGo vs MyClaw.ai"博客
- [ ] 发 r/OpenClaw 第一帖（自托管痛点文章）
- [ ] 搜索 GitHub OpenClaw Issues，回答 5 个部署问题

### 第 4-5 天
- [ ] 写并发布"Multi-Agent Relay Guide"博客  
- [ ] 发 r/selfhosted 帖子
- [ ] 发送 20 条 Reddit DM（自托管经历者）

### 第 6-7 天
- [ ] V2EX 分享创造帖
- [ ] 发 r/artificial 多 Agent demo 帖
- [ ] 发送剩余 30 条 DM

### 第 2 周
- [ ] 统计注册和付费数据
- [ ] 对已注册未付费用户发邮件（附 FOUNDER25 码）
- [ ] 准备 Product Hunt 发布资料

### 第 3 周
- [ ] Product Hunt 发布
- [ ] 针对 Product Hunt 流量优化落地页

---

## 六、预期结果

| 渠道 | 预计带来访客 | 预计付费 |
|---|---|---|
| Reddit r/OpenClaw + r/selfhosted | 500-1000 | 5-10 |
| GitHub Issues 曝光 | 100-200 | 2-4 |
| Reddit DM 直接触达 | - | 2-5 |
| V2EX / 中文社区 | 300-500 | 3-6 |
| 有机 SEO（3篇博客） | 200-400 | 1-3 |
| Product Hunt | 2000-5000 | 5-15 |
| **合计（3周内）** | | **18-43** |

**保守预期：** 3 周内 18-20 个付费用户  
**乐观预期：** Product Hunt 反响好的话 3 周内填满 25 个

---

## 七、成本估算

| 项目 | 成本 |
|---|---|
| 25 个 Hetzner VPS（CPX21，约 $7/台） | $175/mo |
| FOUNDER25 折扣损失（25 人 × $13/mo） | -$325/mo |
| 实际收入（25 × $16.90） | $422.50/mo |
| **首月净收入** | **~$247/mo** |

折扣期间亏损不大，但能快速建立用户基础和口碑。第 2 个月新用户恢复原价后利润空间明显改善。

---

*定期更新：每周回顾付费数量，调整渠道权重*
