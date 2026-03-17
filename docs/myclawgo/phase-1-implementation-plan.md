# MyClawGo Phase 1 实施方案（多 Agent 基础能力）

> 更新时间：2026-03-17  
> 对应目标：先完成 MyClawGo 从“单 Agent 聊天”到“多 Agent 可管理”的第一阶段能力。

---

## 一、Phase 1 目标

Phase 1 不追求一步到位做出完整的 AI 办公室，而是先把最关键的基础能力做扎实：

### Phase 1 完成后，用户应该可以：
1. 在网页上查看自己有哪些 Agent
2. 在网页上新增一个 Agent（添加员工）
3. 在网页上修改 Agent 的核心配置
4. 在网页聊天页切换当前对话 Agent
5. 给某个 Agent 配置 Telegram 渠道

这意味着，产品会从：
- 一个用户 = 一个默认 Agent = 一个聊天页

升级为：
- 一个用户 = 多个 Agent = 可管理、可切换、可配置

---

## 二、Phase 1 范围

## 必做范围（P0）

### 1. Agent 列表页
建议页面：
- `/settings/agents`

能力：
- 查看当前用户全部 Agent
- 展示 Agent 卡片
- 显示基础信息
- 进入 Agent 详情页
- 点击新增 Agent

### 2. 添加员工（新增 Agent）
能力：
- 打开新增 Agent 表单
- 创建 Agent
- 初始化默认配置和目录结构

### 3. Agent 详情配置页
建议页面：
- `/settings/agents/[agentId]`

能力：
- 修改 Agent 名称
- 修改角色/描述
- 修改模型
- 修改 agent.md
- 修改 workspace
- 设置是否启用
- 配置 Telegram

### 4. `/chat` 页面支持切换 Agent
能力：
- 左侧显示 Agent 列表
- 切换当前聊天 Agent
- 点击头像/名字进入 Agent 配置

### 5. Telegram 渠道配置
能力：
- 查看 Telegram 是否已配置
- 配置 bot token
- 查看 webhook / 绑定状态
- 启用 / 禁用 Telegram

---

## 暂不纳入 Phase 1 的内容

以下内容先不进入本阶段，避免发散：
- Office 办公室页面
- 定时任务管理
- 群聊 / 多 Agent 协作
- 自动督促 / 项目经理机制
- 上下文压缩 / 归档 / 重置高级控制
- 多渠道一起做（先只做 Telegram）

---

## 三、用户视角的交互设计

## 1. Agent 列表页

### 页面目标
让用户第一次感受到“我有多个 AI 员工”。

### 页面内容
每张 Agent 卡片显示：
- 头像
- 名称
- 角色 / 岗位
- 模型
- 状态（先简化为 enabled / disabled / unknown）
- Telegram 是否已绑定
- 最近活动时间（可先留占位或后补）

### 页面操作
- `添加员工`
- `编辑`
- `删除`（建议二次确认）
- `设为默认 Agent`（可选，如果当前已经有默认概念）

---

## 2. 添加员工流程

### 建议交互
点击 `添加员工` -> 弹出 Drawer / Modal

### 表单字段（第一版）
- `agentId`
- `name`
- `role`
- `avatar`
- `model`
- `workspace`
- `agentMd`
- `enabled`

### 创建后的行为
- 生成 Agent 元数据
- 生成 `agents/<agentId>/agent.md`
- 创建 workspace 目录（如不存在）
- 更新用户配置
- 返回到 Agent 列表
- 可立即在 `/chat` 里被选中

---

## 3. Agent 配置页

### 页面结构建议
#### A. 基础信息
- 头像
- 名称
- 角色 / 简介
- Agent ID（只读或谨慎编辑）
- 是否启用

#### B. 模型配置
- 当前模型
- 模型选择器

#### C. Prompt / agent.md
- 大文本编辑区
- 支持保存

#### D. Workspace
- workspace 路径
- 简单说明

#### E. Telegram 配置
- bot token
- 启用状态
- webhook / 绑定状态

#### F. 危险操作
- 删除 Agent

---

## 4. Chat 页修改

### 当前问题
当前 `/chat` 更偏“单 Agent 默认对话”。

### Phase 1 后目标
让 `/chat` 成为“多 Agent 对话入口”。

### 建议改动
- 左侧增加 Agent 列表 / 下拉选择器
- 当前聊天上下文绑定到选中的 `agentId`
- 切换 Agent 时重新拉对应历史
- 点击 Agent 头像 / 名称进入配置页

### 历史记录规则
继续复用当前历史路径方案：
- `chats/<channel>/<agentId>/<chatScope>.md`

例如 direct chat：
- `chats/direct/main/default.md`
- `chats/direct/sales/default.md`

---

## 四、数据结构建议

## 1. Agent 元数据
建议为每个用户在挂载目录中维护 Agent 元数据，例如：

```json
{
  "id": "sales",
  "name": "销售助理",
  "role": "负责销售咨询与转化",
  "avatar": "avatar-12",
  "model": "openrouter/openai/gpt-4o-mini",
  "workspace": "/home/openclaw/.openclaw/workspace/agents/sales",
  "enabled": true,
  "channels": {
    "telegram": {
      "enabled": false,
      "botToken": "",
      "status": "unconfigured"
    }
  }
}
```

### 建议存储位置
可考虑：
- `agents/<agentId>/meta.json`

或者统一聚合在：
- `bridge-state.json`
- `openclaw.json`
- `agents-index.json`

### 推荐
建议：
- Agent 详细信息分散存每个 Agent 目录
- 如有需要再维护一个聚合索引，方便列表读取

---

## 2. agent.md
建议路径：
- `/home/openclaw/.openclaw/agents/<agentId>/agent.md`

如果 OpenClaw 当前已有固定目录约束，则要对齐现有格式，不自造冲突目录。

---

## 3. workspace
建议统一规范：
- `/home/openclaw/.openclaw/workspace/agents/<agentId>`

好处：
- 便于隔离不同 Agent 的工作目录
- 便于后续 Office / Task 管理扩展

---

## 五、后端与 bridge 接口规划

## 1. bridge 建议新增接口

### Agent 列表与详情
- `GET /agents`
- `GET /agents/:agentId`

### Agent 管理
- `POST /agents`
- `PATCH /agents/:agentId`
- `DELETE /agents/:agentId`

### Agent 文件内容
- `GET /agents/:agentId/agent-md`
- `PUT /agents/:agentId/agent-md`

### Telegram 配置
- `GET /agents/:agentId/channels/telegram`
- `PUT /agents/:agentId/channels/telegram`
- `POST /agents/:agentId/channels/telegram/test`（可选，后补）

### Agent 状态（第一版简单）
- `GET /agents/:agentId/status`

---

## 2. 平台 API 层建议新增接口

平台继续负责：
- session / auth
- runtime 查找
- 转发到用户 bridge
- 统一错误包装

### 建议接口
- `GET /api/agents`
- `POST /api/agents`
- `GET /api/agents/:agentId`
- `PATCH /api/agents/:agentId`
- `DELETE /api/agents/:agentId`
- `GET /api/agents/:agentId/agent-md`
- `PUT /api/agents/:agentId/agent-md`
- `GET /api/agents/:agentId/channels/telegram`
- `PUT /api/agents/:agentId/channels/telegram`

### 复用逻辑
这部分可以复用已有 bridge target / token / request forwarding 机制：
- `resolveUserBridgeTarget`
- bridge auth via `BRIDGE_TOKEN`

---

## 六、前端页面与组件拆解

## 1. Agent 列表页
建议新增页面：
- `src/app/[locale]/settings/agents/page.tsx`

建议组件：
- `agent-list.tsx`
- `agent-card.tsx`
- `create-agent-dialog.tsx`

---

## 2. Agent 详情页
建议新增：
- `src/app/[locale]/settings/agents/[agentId]/page.tsx`

建议组件：
- `agent-profile-form.tsx`
- `agent-model-form.tsx`
- `agent-md-editor.tsx`
- `agent-telegram-settings.tsx`
- `agent-danger-zone.tsx`

---

## 3. Chat 页增强
修改：
- `src/components/dashboard/chat/chat-shell.tsx`

建议补充组件：
- `chat-agent-switcher.tsx`
- `chat-agent-badge.tsx`

---

## 七、实现顺序（开发步骤）

## Step 1：梳理当前 OpenClaw 用户容器内的 Agent 结构
### 要确认
- 现有 `main` Agent 是如何定义的
- agent.md 当前目录格式是什么
- 新增 Agent 最小需要哪些文件 / 配置

### 产出
- 明确兼容 OpenClaw 的 Agent 存储结构

---

## Step 2：先补 bridge 的只读 Agent 接口
### 先做
- `GET /agents`
- `GET /agents/:agentId`
- `GET /agents/:agentId/agent-md`

### 目的
先让前端能读出来，确认现有数据结构没有问题。

---

## Step 3：做 Agent 列表页
### 先做静态读
- 从平台 API 拉 Agent 列表
- 显示卡片
- 能跳转详情页

---

## Step 4：做 Agent 详情页只读版
### 先确认信息可读
- 基础信息
- 模型
- agent.md
- Telegram 配置占位

---

## Step 5：补 bridge 写接口
### 增加
- `POST /agents`
- `PATCH /agents/:agentId`
- `PUT /agents/:agentId/agent-md`
- `PUT /agents/:agentId/channels/telegram`

---

## Step 6：完成新增 Agent 流程
### 验证闭环
- 创建后列表页出现
- `/chat` 可切换
- 历史路径按 agentId 区分

---

## Step 7：完成 Agent 配置保存
### 验证闭环
- 修改模型成功
- 修改 agent.md 成功
- 修改 workspace 成功
- 修改 Telegram 配置成功

---

## Step 8：增强 `/chat`
### 完成
- Agent 切换
- 切换历史
- 点击头像进入配置

---

## 八、验收标准

当下面这些都打通时，Phase 1 即可认为完成：

### 功能验收
1. 用户能在 `/settings/agents` 看到 Agent 列表
2. 用户能新增一个 Agent
3. 用户能编辑 Agent 的名称、角色、模型、agent.md、workspace
4. 用户能在 `/chat` 切换不同 Agent
5. 不同 Agent 的 direct chat 历史彼此独立
6. 用户能给 Agent 配置 Telegram

### 技术验收
1. Agent 数据持久化在用户挂载目录中
2. 容器重启后 Agent 配置仍保留
3. bridge 只做薄管理层，不重写 OpenClaw 核心逻辑
4. 不回退到旧 websocket 主链路

---

## 九、风险点

### 1. OpenClaw 多 Agent 文件结构需要先摸清
这是最先要确认的，不然容易前端先设计了，后面底层不匹配。

### 2. Telegram 配置可能涉及真实 webhook / bot 生命周期
第一版建议先实现“配置存储 + 状态展示”，不要一开始把所有绑定自动化都做满。

### 3. 删除 Agent 要谨慎
删除 Agent 可能影响：
- 该 Agent 历史记录
- 渠道绑定
- 定时任务

建议第一版删除做得保守，甚至可以先只做禁用，不做真删除。

### 4. `/chat` 切 Agent 后历史边界要清楚
一定要基于 `agentId` 拆历史，不要不同 Agent 混到同一个 direct transcript。

---

## 十、建议的本周执行顺序

如果马上开工，建议顺序如下：

### Day 1
- 摸清 OpenClaw Agent 存储结构
- 确定 meta / agent.md / workspace 路径规范

### Day 2
- bridge 读接口
- 平台读接口
- Agent 列表页只读

### Day 3
- Agent 详情页只读
- `/chat` 接入 Agent 列表与切换

### Day 4
- bridge 写接口
- 新增 Agent

### Day 5
- Agent 配置保存
- Telegram 配置保存

### Day 6
- 历史隔离验证
- 容器重启持久化验证

### Day 7
- 收尾 UI / 错误提示 / 文档

---

## 十一、结论

Phase 1 的核心不是“功能堆多”，而是完成一个关键跃迁：

## **从单 Agent 聊天产品，升级为多 Agent 可管理产品。**

只要把下面五件事做成，MyClawGo 就真正开始往“AI 办公室 SaaS”迈出第一步：

1. Agent 列表
2. 添加员工
3. Agent 配置
4. Telegram 配置
5. `/chat` 切换 Agent
