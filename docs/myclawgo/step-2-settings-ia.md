# Step 2 - Settings 页面与导航接入方案

## 现状

当前项目已有 settings 一级导航，挂载在：
- `src/config/sidebar-config.tsx`

当前 routes：
- `/settings/profile`
- `/settings/billing`
- `/settings/credits`
- `/settings/security`
- `/settings/notifications`

当前页面目录：
- `src/app/[locale]/(protected)/settings/profile`
- `src/app/[locale]/(protected)/settings/billing`
- `src/app/[locale]/(protected)/settings/credits`
- `src/app/[locale]/(protected)/settings/security`
- `src/app/[locale]/(protected)/settings/notifications`

---

## 结论

第一版不直接做 `Settings > Channels`，而是改为：

## 推荐入口：`Settings > Agents`

原因：
1. 未来主语是 Agent，不是 Channel
2. 一个用户会有多个 Agent
3. 每个 Agent 未来可以绑定不同 Telegram Bot / 不同渠道
4. Channel 只是 Agent 的接入方式之一

因此信息架构应该围绕 Agent 展开。

---

## 第一版页面结构

### 1. Agents 列表页
路径建议：
- `/settings/agents`

页面职责：
- 展示当前用户的 Agent 列表
- 每个 Agent 卡片显示：
  - agent 名称
  - 描述
  - 状态
  - 已绑定 Telegram bot 数量
  - 默认/主 Agent 标识
- 提供入口：
  - Manage channels
  - Configure Telegram

### 2. Agent 详情页（第二阶段即可）
路径建议：
- `/settings/agents/[agentId]`

页面职责：
- 管理该 agent 的详细配置
- 管理该 agent 的 Telegram bot 配置
- 查看 chat 绑定状态
- 触发将配置同步到 runtime 容器

### 3. Agent Telegram 配置页（可直接并入详情页）
路径建议：
- `/settings/agents/[agentId]/telegram`

页面职责：
- 填写 bot token
- 显示 bot username / bot id
- 显示 webhook 状态
- 显示是否已同步到 runtime
- 提供 test / disconnect / resync

---

## 第一版最小可用 IA

为了降低开发复杂度，第一版建议先做：

### 一级导航新增
- Agents

### 新增页面
- `/settings/agents`

页面上先展示：
- main agent（默认创建）
- 后续 agent 先保留“coming soon”或先支持数据库可扩展但 UI 只展示 main

然后在 main agent 卡片上提供：
- Configure Telegram Bot
- View runtime sync status

即：
- IA 按 Agent 组织
- 第一版 UI 先只完整打通 main agent
- 底层结构保留多 Agent

---

## 为什么不直接做 Channels

如果直接做 `Settings > Channels`：
- 容易把 Telegram 理解成 user 级配置
- 后续一个用户多个 Agent 时，页面容易混乱
- 后续 Discord / WhatsApp / Email 也会缺少 agent 归属语义

而 `Settings > Agents` 的好处是：
- 明确“这是哪个 agent 的渠道配置”
- 未来一个 agent 多渠道也自然扩展
- 未来一个用户多个 agent 也不会返工 IA

---

## 对现有项目的具体接入点

### Routes 增加
建议新增：
- `Routes.SettingsAgents = '/settings/agents'`

第二阶段可再加：
- `Routes.SettingsAgentDetail = '/settings/agents/[agentId]'`（若项目路由常量支持模板）

### 受保护路由增加
在 `protectedRoutes` 中增加：
- `Routes.SettingsAgents`

### Sidebar 增加
在 `src/config/sidebar-config.tsx` 的 settings items 中新增：
- Agents

建议位置：
- Profile
- Agents
- Billing
- Credits
- Security
- Notifications

原因：
- Agents 是产品核心配置项，优先级高于 billing 之后的边缘设置

---

## 第一版页面信息架构建议

### Settings > Agents 页面模块

#### 模块 1：页面标题
- Title: Agents
- Desc: Manage your assistants and connect messaging channels like Telegram.

#### 模块 2：Agent cards
每张卡片包含：
- Agent name
- Description
- Status badge
- Bound Telegram bots count
- Runtime sync status badge

按钮：
- Configure Telegram
- Manage agent（后续）

#### 模块 3：扩展提示
可选：
- “More agents and channels coming soon”

---

## Step 2 结论

页面与导航第一版按以下方式落地：

- 一级入口：`Settings > Agents`
- 首个页面：`/settings/agents`
- 第一版先打通 `main` agent
- Telegram 作为 Agent 下面的配置项处理
- 后续再扩展每个 agent 多 bot、多渠道

这是最符合“一个用户多 Agent、每个 Agent 可绑定不同 Telegram Bot”的 IA 方案。
