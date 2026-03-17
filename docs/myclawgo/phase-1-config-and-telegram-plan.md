# MyClawGo Phase 1 方案收口：AGENTS.md / 模型配置 / 每 Agent 一个 Telegram

> 更新时间：2026-03-17  
> 目标：在进入正式编码前，收口 Phase 1 中最关键的 3 个实现问题：
> 1. 每个 Agent 的核心设定文件如何落地
> 2. 每个 Agent 的模型如何配置
> 3. 每个 Agent 一个 Telegram Bot 如何配置

---

## 一、结论先行

基于当前 OpenClaw 真实结构和你的产品方向，Phase 1 先按以下结论执行：

### 1. 每个 Agent 的核心设定文件，用 **`AGENTS.md`**
不是 `agent.md`，当前产品和实现统一使用：
- `AGENTS.md`

### 2. 每个 Agent 的模型配置，先落到 `agents.list[].model`
也就是：
- Agent 自己有单独 model
- 未设置时回退到 `agents.defaults.model`

### 3. 每个 Agent 的 Telegram，按“一个 Agent 一个 Telegram Bot / account”设计
也就是：
- 每个 Agent 可以绑定独立 Telegram Bot Token
- 在 OpenClaw 配置层体现为独立 `telegram account`
- 再通过 `bindings` 把该 Telegram account 路由到对应 Agent

---

## 二、AGENTS.md 的产品与技术定义

## 1. 产品定义
在 MyClawGo 产品里，AGENTS.md 是：

## **该 Agent 的核心人格 / 协作 / 行为设定文件**

用户在网页上点击某个 Agent 后，看到并编辑的“核心提示词/核心规则”，Phase 1 就对应到这个 Agent workspace 下的：
- `AGENTS.md`

### 为什么这样定
因为当前 OpenClaw 初始化新 Agent workspace 时，天然就会创建：
- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
等文件

而你当前最明确、最稳定、最适合作为“Agent 核心设定”的文件，就是：
- `AGENTS.md`

---

## 2. 技术映射
### 每个 Agent 的 AGENTS.md 路径
统一按 workspace 根目录：

```text
<agent.workspace>/AGENTS.md
```

例如：

```text
/home/openclaw/.openclaw/workspace/AGENTS.md
/home/openclaw/.openclaw/workspace-sales/AGENTS.md
/home/openclaw/.openclaw/workspace-marketing/AGENTS.md
```

### Phase 1 页面上的“编辑 AGENTS.md”
本质上就是：
- 读取 `<workspace>/AGENTS.md`
- 保存 `<workspace>/AGENTS.md`

---

## 3. 为什么暂不把 SOUL.md 暴露成主编辑对象
虽然每个 workspace 也有 `SOUL.md`，但 Phase 1 不建议把它作为主配置入口。

### 原因
- `AGENTS.md` 更适合承载“团队规则 / Agent 说明 / 协作约束”
- `SOUL.md` 更像更深层的风格/人格文件
- 如果 Phase 1 一上来同时开放太多文件，会让用户困惑

### 建议
Phase 1 先对用户主开放：
- `AGENTS.md`

后续若有需要，再增加：
- 高级模式：编辑 `SOUL.md`
- 高级模式：编辑 `IDENTITY.md`

---

## 三、模型配置方案

## 1. 产品目标
每个 Agent 在页面上都应该可以选择自己的模型。

例如：
- 销售 Agent 用 `gpt-4o-mini`
- 研究 Agent 用 `claude-sonnet`
- 编码 Agent 用 `gpt-5.4` / `gpt-5.3-codex`

---

## 2. 技术落点
### 第一优先方案
直接落到：

```json
agents.list[].model
```

例如：

```json
{
  "id": "sales",
  "workspace": "/home/openclaw/.openclaw/workspace-sales",
  "model": "openrouter/openai/gpt-4o-mini"
}
```

### 默认回退
如果某个 Agent 没有显式 `model`，则回退：

```json
agents.defaults.model
```

---

## 3. Phase 1 页面行为
在 Agent 详情页中提供：
- 当前模型展示
- 模型选择器
- 保存按钮

保存后：
- 更新 `openclaw.json` 中对应 Agent 的 `model`

---

## 4. 推荐实现方式
### bridge 层
优先做“配置写入”而不是重新造复杂命令。

即：
- 读取 `openclaw.json`
- 定位 `agents.list[agentId]`
- 更新 `model`
- 写回
- 调用 validate / 必要的 reload 逻辑（视当前 OpenClaw 行为而定）

### 不建议
- 不建议 Phase 1 为模型切换单独发明新的 bridge 状态文件
- 不建议先把模型配置散落到多个文件

---

## 四、每 Agent 一个 Telegram 的方案

## 1. 产品定义
你已经明确了目标：

## **每一个 Agent 有自己的 Telegram**

这意味着产品上不是：
- 整个用户共用一个 Telegram Bot

而是：
- 销售 Agent 一个 Bot
- 内容 Agent 一个 Bot
- 技术 Agent 一个 Bot
- 每个 Agent 都能单独绑定/启停/更换自己的 Telegram Token

这个定义非常重要，Phase 1 必须按这个方向设计。

---

## 2. OpenClaw 底层能力对应
OpenClaw 文档已表明：

### A. Telegram 支持多 accounts
配置位于：

```json
channels.telegram.accounts
```

### B. 多 Agent 路由支持 bindings
配置位于：

```json
bindings
```

所以技术结构天然支持：
- 多 Telegram account
- 每个 account 路由到不同 Agent

---

## 3. 推荐配置结构

### 方案：每个 Agent 对应一个 accountId
建议 accountId 命名直接与 agentId 对齐：

```text
telegram accountId = agentId
```

例如：
- `main`
- `sales`
- `marketing`
- `dev`

### Telegram 配置建议
```json
{
  "channels": {
    "telegram": {
      "accounts": {
        "sales": {
          "botToken": "<secret>",
          "enabled": true
        }
      }
    }
  }
}
```

### 路由绑定建议
通过 `bindings` 把该 Telegram account 路由到对应 Agent：

```json
{
  "bindings": [
    {
      "match": {
        "channel": "telegram",
        "accountId": "sales"
      },
      "agentId": "sales"
    }
  ]
}
```

---

## 4. 命名规范建议
为避免后续混乱，建议统一：

### Telegram accountId
- 与 `agentId` 相同

### 如果未来允许同一个 Agent 多个 Telegram Bot
那时再升级为：
- `<agentId>-<channelName>`
- 例如 `sales-main`、`sales-eu`

### 但 Phase 1 先不要复杂化
Phase 1 就定：

## **一个 Agent 最多一个 Telegram account**

---

## 5. Phase 1 页面字段建议
在 Agent 详情页的 Telegram 区块中，先提供：

- `enabled`
- `botToken`
- `accountId`（默认等于 agentId，只读或隐藏）
- `status`（unconfigured / configured / invalid / active）

### 第一版先做的动作
- 保存 token
- 写入 `channels.telegram.accounts[agentId]`
- 确保存在对应 `bindings` 路由

### 第一版可以暂缓的动作
- 自动 webhook 探测
- 自动 health ping Bot API
- 自动完整 onboarding 向导

---

## 五、Phase 1 页面与接口应该如何调整

## 1. Agent 详情页
建议页面支持以下 Tab / 区块：

### A. 基础信息
- 名称
- 角色
- 头像
- emoji / theme（可选）
- enabled

### B. 模型
- model selector

### C. AGENTS.md
- 文本编辑器

### D. Telegram
- 启用/关闭
- bot token
- 绑定状态

---

## 2. bridge 层建议接口

### AGENTS.md
- `GET /agents/:agentId/agents-md`
- `PUT /agents/:agentId/agents-md`

### 模型/基础信息
- `GET /agents/:agentId`
- `PATCH /agents/:agentId`

### Telegram
- `GET /agents/:agentId/channels/telegram`
- `PUT /agents/:agentId/channels/telegram`

---

## 六、bridge 实现原则

## 1. Agent 生命周期仍走 OpenClaw CLI
- 新增：`openclaw agents add`
- 删除：`openclaw agents delete`
- identity：`openclaw agents set-identity`

## 2. AGENTS.md 走文件读写
因为它属于 workspace 内容。

## 3. model / telegram / bindings 走配置读写
因为它们更适合通过 `openclaw.json` 统一管理。

---

## 七、推荐的 Phase 1 最终收口方案

基于当前信息，Phase 1 现在可以明确按以下方式实施：

### Agent 核心设定
- 使用该 Agent workspace 下的 `AGENTS.md`

### Agent 模型
- 使用 `agents.list[].model`

### Agent Telegram
- 使用 `channels.telegram.accounts[agentId]`
- 使用 `bindings[]` 将该 Telegram account 路由到该 Agent

### Agent 生命周期
- 使用 OpenClaw 官方 CLI

---

## 八、仍需注意的风险点

### 1. Telegram token 属于敏感信息
Phase 1 页面中要注意：
- 默认遮挡
- 更新时避免明文回显
- 日志中绝不打印

### 2. bindings 写入要去重
多次保存 Telegram 配置时，不能重复插入同一条 binding。

### 3. 删除 Agent 时要联动清理 Telegram account 和 binding
否则可能遗留脏配置。

### 4. AGENTS.md 编辑应避免覆盖用户已有内容
如果文件不存在可以初始化；如果存在，应按原文件编辑保存，不做粗暴模板重写。

---

## 九、一句话结论

Phase 1 现在已经可以按下面这套规则正式进入编码：

## **每个 Agent 有自己的 workspace、自己的 AGENTS.md、自己的 model、自己的 Telegram Bot；Agent 的创建/删除走 OpenClaw CLI，AGENTS.md 走文件读写，model 与 Telegram 走 `openclaw.json` 配置读写。**
