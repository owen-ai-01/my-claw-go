# MyClawGo AI 办公室 / 多 Agent SaaS 规划方案（基于“AI 版飞书”目标形态）

> 更新时间：2026-03-17  
> 目标：把 MyClawGo 从“每个用户一个可对话 Agent”演进为“每个用户一个 AI 办公室（Agent Office）”的 SaaS 产品。

---

## 一、背景与目标

你给出的文章目标形态，本质上不是一个普通聊天产品，而是一个：

## **AI 原生的组织协作系统**

它和传统 IM 的差别不只是“把 AI 放进聊天框”，而是要从第一性原理重新定义：

- Agent 是一等公民
- 人不是唯一的操作中心
- Agent 可以被创建、配置、分组、协作、督促、观察
- 用户不是在“用一个机器人”，而是在“拥有一个 AI 团队”

对于 MyClawGo 来说，这个目标形态需要落在 SaaS 场景里，也就是：

## **通过网页，为每个用户提供一个独立的 AI 办公室**

每个用户进入系统后，都拥有：
- 自己独立的 OpenClaw runtime
- 自己的 Agent 列表
- 自己的聊天页面
- 自己的渠道配置
- 自己的 Agent 办公室
- 自己的定时任务和后续群组协作能力

---

## 二、MyClawGo 最终产品定义

### 一句话定义
**MyClawGo = 一个面向个人与小团队的 AI 办公室 SaaS。**

### 更完整的定义
MyClawGo 不是一个共享 AI Chat 网站，而是一个为每个用户托管独立 OpenClaw runtime 的 AI Agent 平台。用户可以在网页端创建多个 Agent（员工），配置它们的模型、渠道、agent.md、知识与行为方式，并在一个“办公室视角”里看到每个 Agent 的状态、任务、协作和调度过程。

---

## 三、设计原则（从文章抽象出来）

这部分建议作为产品长期原则，后续所有功能都围绕它展开。

### 原则 1：少碰配置，复杂能力前端化
用户不应该频繁 SSH、改 JSON、改命令行。

应尽量把高频且关键的能力前移到网页端：
- 渠道配置
- 模型切换
- Agent 创建
- agent.md 编辑
- 定时任务管理
- 状态查看

### 原则 2：以 AI 为主，而不是以人类 IM 为主
不是把人类聊天工具简单套给 AI，而是围绕 AI 的本质特性设计：
- 上下文成本高
- 任务可能长时间运行
- 需要汇报机制
- 需要状态可见性
- 需要 Agent 间消息流

### 原则 3：把 Agent 当作员工来设计
每个 Agent 都应具备“员工属性”：
- 名称
- 头像
- 岗位 / 角色
- 模型
- 工作状态
- 渠道能力
- 个性化设定
- 被分配到部门 / 项目组

### 原则 4：必须提供“确定性”
当前和 Agent 协作最大的痛点不是能力不够，而是：
- 不知道它在不在
- 不知道它在做什么
- 不知道它卡在哪里
- 不知道它有没有继续执行

所以系统必须加强：
- 运行状态可视化
- 最近活动可视化
- 长任务可视化
- 错误可视化
- 定时任务可视化

### 原则 5：先做单用户 AI 办公室，再扩展多人/多群协作
当前架构下最合理的路线是：
- 先把单用户单容器的多 Agent 做顺
- 再做办公室和调度
- 最后做群与跨 Agent 协作

---

## 四、当前已具备的基础

截至目前，MyClawGo 已经具备以下基础：

### 1. 每个用户一个独立 runtime
- 一个用户一个容器
- 一个用户一个 OpenClaw
- 用户间隔离

### 2. 网页聊天主链路已打通
当前链路为：
- `/chat`
- 平台 `/api/chat/send`
- 用户容器 bridge
- 容器内 OpenClaw

### 3. bridge 已经成为官方主聊天路径
bridge 当前已具备基础接口：
- `GET /health`
- `POST /chat/send`
- `GET /chat/history`
- `GET /agents`
- `POST /agent/select`
- `GET /config/get`
- `POST /config/set`
- `GET /logs/recent`

### 4. 发布方式已稳定
当前 bridge 已采用：
- host releases
- `current` 软链接
- 容器挂载读取

### 5. 聊天记录已有持久化方案
聊天记录按 markdown 存在用户挂载目录，后续可继续扩展到：
- `channel / agentId / chatScope`

---

## 五、目标产品形态：五层进化版 MyClawGo

这里直接把文章里的产品思想，映射成 MyClawGo 的 SaaS 版本。

---

# 第一层：AI 团队感（Team Presence）

## 目标
让用户一进系统，不再只是看到一个聊天框，而是感受到“我有一个 AI 团队”。

## 页面体现
- Agent 列表
- 头像
- 昵称 / 名称
- 岗位 / 职责
- 部门 / 分组
- 默认状态

## 最小版本建议
先不做复杂拖拽和高度拟真，只先实现：
- Agent 卡片列表
- 每张卡片展示头像、名字、角色、模型、状态
- 支持分组（如默认组、技术组、内容组）

---

# 第二层：零代码扩张（Add Employee）

## 目标
让用户在网页上“像加员工一样”添加 Agent，而不是自己改底层配置。

## 核心功能
### 新增员工
用户点击：
- 添加员工 / Add Agent

弹出创建表单：
- Agent ID
- 名称
- 岗位 / 角色
- 头像
- 分组
- 模型
- 初始 agent.md
- workspace

### 编辑员工
支持修改：
- 头像
- 名称
- 岗位
- 所属分组
- 模型
- agent.md
- 默认渠道配置

## 底层映射
创建后同步写入用户容器中的：
- Agent 配置
- agent.md
- workspace 目录
- 默认渠道绑定状态

---

# 第三层：夺回配置权与上下文控制权

## 目标
让用户不只是能聊天，而是能真正控制 Agent 的关键工作参数。

## 第一版必须支持的配置
### Agent 核心配置
- 模型
- agent.md
- workspace
- 名称 / 角色
- 是否启用

### 渠道配置
第一期先做：
- Telegram

后续可扩展：
- WhatsApp
- Slack
- Discord
- 飞书 / 企业微信

### 上下文相关能力（建议列为 V1.5 / V2）
文章里非常强调 token 与上下文控制，这部分很关键，但不一定最先做。

建议未来加入：
- 重置当前会话
- 归档当前会话
- 压缩当前会话
- 显示会话规模 / 近似 token 规模
- 快捷命令入口（如 `/help`、`/model`、`/status`）

---

# 第四层：Agent Office（办公室 / 上帝视角）

## 目标
解决“AI 在不在工作、工作到哪了、卡没卡住”这个核心痛点。

## 页面建议
新增：
- `/office`

## 页面结构建议
### 区域 1：对话区
- 当前正在与用户交互的 Agent
- 当前会话摘要

### 区域 2：办公区
- 正在运行任务的 Agent
- 正在处理 cron / 渠道消息 / 长任务的 Agent

### 区域 3：休闲区
- 当前空闲 Agent
- 最近空闲时间

## 每个 Agent 卡片建议展示
- 头像
- 名称
- 岗位
- 当前状态：`idle / chatting / running / waiting / offline / error`
- 当前在做什么（摘要）
- 最近一次活动时间
- 最近一次消息来源（chat / telegram / task）
- 最近一次错误

## 第一版状态来源建议
优先通过已有能力拼起来，而不是一开始上复杂实时总线：
- bridge health
- 最近聊天时间
- 最近 transcript 追加时间
- 最近 cron 触发时间
- 最近日志摘要

---

# 第五层：调度、群组与多 Agent 协作

## 目标
从“多个独立 Agent”升级为“可协作的 AI 团队”。

## 这层包含三个子能力

### A. 定时任务管理
每个 Agent 可以有自己的：
- cron 任务
- 任务启停
- 任务执行记录
- 失败记录

### B. 项目组 / 群组
用户可以创建一个项目组，把多个 Agent 拉进来。

项目组需要：
- 名称
- 描述
- 成员 Agent
- 主负责人 Agent（主 R / 群主）

### C. 协作规则
后续再做：
- 谁能主动 @ 其他 Agent
- 谁是默认主协调 Agent
- 协作链路如何转交
- 是否启用自动督促

## 结论
这一层很重要，但不建议现在立刻开做。它应该排在：
- 渠道配置
- Agent 配置
- 添加员工
- 办公室状态可视化
之后。

---

## 六、推荐功能路线图

# Phase 0：已完成基础
- 每用户独立 runtime
- `/chat` 对话可用
- bridge 主链路打通
- 基础 transcript 持久化

# Phase 1：Agent 基础管理（优先立即做）
## 目标
让“一个用户一个 Agent”升级成“一个用户多个 Agent，可管理”。

## 范围
### 1. Agent 列表页
- 查看全部 Agent
- 显示头像 / 名称 / 角色 / 模型 / 状态

### 2. 添加员工
- 创建 Agent
- 初始化 agent.md / workspace / 模型

### 3. Agent 详情配置页
- 模型
- agent.md
- workspace
- 名称 / 角色 / 头像
- 启用状态

### 4. `/chat` 支持切换 Agent
- 左侧列表切换 Agent
- 点击头像进入配置

### 5. Telegram 配置（首个外部渠道）
- Bot token
- webhook / 绑定状态
- 启用/关闭

## 为什么先做这 5 个
因为这是从当前产品状态迈向“AI 办公室”的最短路径。

---

# Phase 2：Office（强状态感）
## 目标
解决“不知道 Agent 在干什么”的问题。

## 范围
- `/office`
- Agent 状态卡片
- 最近活动
- 当前任务摘要
- 渠道状态
- 错误提示

## 成功标准
用户打开办公室页面时，能快速知道：
- 哪些 Agent 在线
- 哪些 Agent 在忙
- 哪些 Agent 卡住了
- 哪些 Agent 最近刚完成工作

---

# Phase 3：定时任务管理
## 目标
让 Agent 具备长期自动工作能力。

## 范围
- Agent cron 列表
- 创建任务
- 启停任务
- 最近执行记录

## 实现建议
优先复用 OpenClaw cron 能力，通过 bridge / 平台做 UI 管理入口。

---

# Phase 4：项目组 / 群协作
## 目标
让多个 Agent 进入同一协作空间。

## 范围
- 创建项目组
- 拉多个 Agent 进组
- 设置主负责人 Agent
- 群消息流转

---

# Phase 5：自主调度 / 督促机制
## 目标
让系统逐步具备“项目经理代理”能力。

## 未来能力
- 主负责人 Agent 定时汇报
- 督促其他 Agent 跟进
- 卡住时提醒用户
- 长任务状态连续汇总

这一层属于中后期能力，不建议和前面的基础建设并行硬上。

---

## 七、信息架构建议

## 1. 导航结构
建议后续导航逐步扩成：
- Chat
- Agents
- Office
- Tasks
- Channels（也可先合并进 Agent 详情页）

## 2. 页面建议
### `/chat`
- 主聊天页面
- 左侧 Agent 列表
- 点击头像/名字进入 Agent 配置
- 可切默认 Agent

### `/settings/agents`
- Agent 列表页
- 添加员工
- 编辑 / 删除 / 启停

### `/settings/agents/:agentId`
- Agent 详情页
- 基础信息
- 模型
- agent.md
- workspace
- Telegram 配置
- 最近状态摘要

### `/office`
- 办公室页面
- 看所有 Agent 当前状态和最近活动

### `/tasks`（后续）
- 全局任务入口
- 看所有 Agent 的定时任务

---

## 八、技术方案建议（基于当前架构）

## 1. 继续坚持一个用户一个容器
不建议变成“一个 Agent 一个容器”。

### 原因
- 用户视角更自然
- 配置集中
- 数据集中
- 成本更低
- 更适合当前 SaaS 形态

## 2. 一个用户多个 Agent 在同一 OpenClaw 内管理
这是最符合当前阶段的方案。

### 意味着
后续新增 Agent，不是新增容器，而是：
- 修改用户配置
- 创建 Agent 文件结构
- 刷新/同步到容器内 OpenClaw

## 3. 配置存储建议
建议统一存放在用户挂载目录中，便于持久化和容器重建恢复：
- `openclaw.json`
- `agents/<agentId>/agent.md`
- `agents/<agentId>/meta.json`
- `channels/<agentId>/...`
- `chats/<channel>/<agentId>/<chatScope>.md`

## 4. bridge 后续职责扩展
bridge 应继续保持“薄”，但可以增加面向产品 UI 的管理接口：
- `GET /agents/:id`
- `POST /agents`
- `PATCH /agents/:id`
- `DELETE /agents/:id`
- `GET /agents/:id/status`
- `GET /agents/:id/tasks`
- `POST /agents/:id/tasks`
- `GET /channels/telegram/status`
- `POST /channels/telegram/bind`

bridge 只做：
- 认证
- 参数校验
- 配置读写
- OpenClaw 调用
- 错误包装

不要把复杂产品逻辑全部塞进 bridge。

---

## 九、近期最优先的开发顺序

## P0（现在立刻开始）
1. Agent 列表页
2. 添加员工
3. Agent 配置页
4. Telegram 渠道配置
5. `/chat` 切换 Agent + 点击头像进入配置

## P1
6. `/office` 办公室页
7. Agent 状态聚合
8. 最近活动展示

## P2
9. 定时任务管理
10. 任务执行记录

## P3
11. 项目组 / 群组
12. 主负责人 Agent
13. 多 Agent 协作
14. 督促机制

---

## 十、第一阶段验收标准（建议）

当下面 5 项都完成时，说明 MyClawGo 已经从“单 Agent 对话产品”进入“AI 办公室雏形”：

### 验收项
1. 用户可以在网页上新增 Agent
2. 用户可以编辑 Agent 的模型、agent.md、workspace、角色信息
3. 用户可以为 Agent 配置 Telegram
4. 用户可以在 `/chat` 页面切换不同 Agent 对话
5. 用户可以在页面中看到至少一个简化版 Agent 状态视图

---

## 十一、风险与注意点

### 1. 不要一开始就做复杂实时协作
办公室页面第一版先做“近实时状态聚合”，不要一上来做很重的实时总线。

### 2. 不要先做群协作
群协作是高级能力，得建立在：
- 多 Agent 管理稳定
- 状态视图稳定
- 渠道配置稳定
- cron 稳定
之上。

### 3. 不要让配置入口分散
模型、agent.md、渠道、状态，最好都围绕 Agent 详情页聚合。

### 4. 不要破坏当前单用户稳定链路
所有新功能都应建立在现有 bridge 主链路之上，避免回退到旧 websocket / pairing 路线。

---

## 十二、结论

MyClawGo 的下一阶段，不应该继续只做“聊天可用”，而应该明确升级为：

## **一个面向个人与小团队的 AI 办公室 SaaS**

它的第一步不是直接做最科幻的多 Agent 群协作，而是先把以下 4 件事做扎实：

1. 添加员工（多 Agent）
2. 配置员工（模型 / agent.md / workspace / Telegram）
3. 在聊天页自然切换和管理 Agent
4. 建立办公室视图，看见每个 Agent 的状态

当这四件事完成后，MyClawGo 才真正具备向“AI 版飞书 / AI 原生组织系统”继续演进的产品基础。
