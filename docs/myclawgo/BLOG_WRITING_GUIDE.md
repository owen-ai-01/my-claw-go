# MyClawGo 博客写作技巧指南

> 适用于所有 MyClawGo 博客文章。每次新写博客前先读一遍这份指南。

---

## 一、核心原则

**不要让读者感觉是 AI 在说话。**

AI 写的文章有几个明显特征：
- 开头是总结性废话（"In this article, we will explore..."）
- 每个段落都很完整、很对称
- 没有任何犹豫、矛盾或个人偏好
- 用词像教科书

好的技术博客应该：有观点、有不足的承认、有具体的场景、有作者的"味道"。

---

## 二、开头钩子（Hook）— 最重要的部分

**读者决定是否继续阅读，只看前 3 句话。**

### 五种有效的 Hook 类型

**1. 挫折场景**（最有共鸣）
> "The first time I tried to run OpenClaw, I spent four hours on it and ended up with a server that wouldn't start. Not because I'm not technical. Because the documentation assumed I already knew things I didn't."

**2. 数字/意外对比**
> "OpenClaw has 347,000 GitHub stars. According to the Discord, fewer than 12% of people who star it ever actually run it. That gap has a name: setup friction."

**3. 反常识开头**
> "Managed hosting sounds like the lazy choice. I used to think so too. Then I did the math."

**4. 问题直击**
> "You've heard about OpenClaw. You want to use it. You opened the GitHub page, saw the installation instructions, and quietly closed the tab. This guide is for you."

**5. 对比故事**
> "Two people discover OpenClaw on the same day. One has a Linux server, knows what `systemctl` means, and has OpenClaw running by midnight. The other Googles 'what is a VPS' and gives up by Tuesday. This article is about closing that gap."

### Hook 规则
- 不超过 3 句话
- 不解释文章结构（绝对不写 "In this post, I will..."）
- 不用 "Great news!" / "Are you ready?" 之类的措辞
- 如果用第一人称，要有具体细节，不是泛泛而谈

---

## 三、文章结构模板

```
[Hook — 2-3 句话，直接进入场景或问题]

[问题描述 — 1-2 段，让读者觉得"这说的就是我"]

[解决方案/主体内容 — 分 H2 标题，每段 3-5 句话]

[对比/表格 — 帮读者快速做决定]

[CTA — 不强推，给选择]

[FAQ — 解决最后的疑虑]
```

---

## 四、段落写法

- **每段不超过 5 句话。** 超过了就拆。
- **H2 标题不要全是关键词堆砌**，要像真实的章节标题，有话说的感觉。
- **加一些"过渡"**，比如 "Here's the part nobody tells you:" 或 "Before we get into that — "
- **允许有不完美**：可以写 "To be honest, this part is a bit more work than it sounds." 这样的句子。
- **用具体数字**，不要 "many people"，要 "roughly 12% of people"（即使是估算，要说清楚是估算）。

---

## 五、关键词密度

- **主关键词**密度：1.5%–2.5%（全文词数约 1200-1800 词，主关键词出现 20-30 次）
- **变体/长尾词**：自然分布，不要强行堆砌
- **H1 必须含主关键词**
- **前 100 词内出现主关键词至少 1 次**
- **最后一段出现 1 次**

---

## 六、MDX 文件格式

```mdx
---
title: 文章标题（H1，含主关键词）
description: 150字以内的 meta description，含主关键词，有行动意图
image: /images/blog/[slug].png
date: "YYYY-MM-DD"
published: true
categories: [hosting]   # hosting / guides / comparison
author: myclawgo
---

[正文 MDX 内容]
```

### 可用的 MDX 组件
- 标准 Markdown 语法（`**bold**`、`_italic_`、`- list`）
- 代码块 ` ```bash ` 等
- 表格（`| col | col |`）
- 引用块（`> `）

---

## 七、图片规范

- **Featured image**：`/images/blog/[slug].png`，建议尺寸 1200×630（OG 标准）
- **正文内图**：配合关键步骤或对比内容，不要纯装饰
- **alt 文字**：描述图片内容 + 含关键词（比如 `alt="MyClawGo openclaw hosting dashboard"`）

目前可用的博客图片：`/images/blog/post-1.png` 至 `post-8.png`

---

## 八、CTA 写法

**不要**：
> "Sign up for MyClawGo today! Don't miss out!"

**要**：
> "If you want to skip all of the above and just have a working OpenClaw instance by tomorrow, [MyClawGo](https://myclawgo.com/openclaw-hosting) does the setup for you. There's a 7-day trial."

CTA 原则：
- 放在文章 2/3 处一次，文末一次
- 给读者留选择，不要命令式
- 结合上下文，不要突兀插入

---

## 九、避免 AI 味道的检查清单

写完后逐项检查：

- [ ] 开头没有 "In this article..."
- [ ] 没有 "It's worth noting that..." / "It's important to understand..."
- [ ] 没有对称的三件事列举（"First... Second... Third..."）出现超过一次
- [ ] 有至少一处承认某个选项的缺点或不适用场景
- [ ] 段落长度不均匀（有长有短，自然节奏）
- [ ] 至少有一处口语化的过渡句
- [ ] 没有无意义的总结段（"In conclusion, OpenClaw hosting is a great choice..."）

---

## 十、发布前 SEO 检查

- [ ] `<title>` 含主关键词，60 字以内
- [ ] `description` 含主关键词，150 字以内
- [ ] H1 含主关键词
- [ ] 至少 3 个 H2
- [ ] 有至少 1 个内部链接（指向 `/openclaw-hosting` 或 `/pricing`）
- [ ] Featured image 有 alt 文字
- [ ] 文章 > 1000 词
