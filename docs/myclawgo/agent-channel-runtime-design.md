# MyClawGo 多 Agent / Telegram Bot / Runtime 配置同步设计（Step 1）

## 目标

让普通用户在网页后台为自己的多个 Agent 配置多个 Telegram Bot，并在保存配置后将对应渠道配置同步到该用户 Docker 容器中的 OpenClaw runtime，使 Telegram 消息可以路由到指定 Agent。

---

## 核心对象

### 1. User
平台账户主体。

### 2. UserAgent
用户拥有的 Agent 实例。不是平台预设模板本身，而是“这个用户的一个 agent”。

示例：
- main
- sales
- support
- content

### 3. UserAgentTelegramBot
某个用户 Agent 对应的 Telegram Bot 配置。

一个 UserAgent 在未来可以绑定：
- 0..n 个 Telegram bot
- 0..n 个其他 channel

但第一版可以限制为：
- 1 个 Agent 先绑定 1 个 Telegram Bot

### 4. UserChannelBinding
具体聊天对象绑定关系。也就是 Telegram 某个 chat/user 已经和某个 agent bot 建立了可收发关系。

### 5. RuntimeConfigProjection
数据库配置到容器内 OpenClaw 配置文件的投影结果，不一定单独建表，但逻辑上必须独立出来。

---

## 数据关系

```text
user
  └── user_agent (1:N)
        └── user_agent_telegram_bot (1:N)
              └── user_channel_binding (1:N)
```

即：
- 一个用户可以有多个 Agent
- 一个 Agent 可以有多个 Telegram Bot
- 一个 Bot 可以服务多个 Telegram chat / user 绑定

---

## 表设计建议

## user_agent
用于表示“这个用户拥有的 agent 实例”。

字段建议：
- id
- user_id
- agent_key            // main / sales / support / content / custom
- name                 // 页面展示名
- slug                 // URL / 稳定标识
- description
- status               // active / disabled
- is_default
- runtime_agent_id     // 容器里实际 agent id，默认先等于 agent_key
- sort_order
- created_at
- updated_at

说明：
- `runtime_agent_id` 用于将来支持网页显示名称与容器内实际 agent id 解耦。

---

## user_agent_telegram_bot
用于表示“某个 agent 的 Telegram bot 配置”。

字段建议：
- id
- user_id
- user_agent_id
- status                    // pending / active / disabled / failed
- bot_token_encrypted
- bot_username
- bot_telegram_id
- webhook_path
- webhook_secret
- last_verified_at
- last_error
- created_at
- updated_at

说明：
- bot token 必须加密存储
- `webhook_path` / `webhook_secret` 用于区分不同 bot 的 webhook 路由
- 未来可支持一个 agent 多个 bot

---

## user_channel_binding
用于表示“某个 Telegram chat 已绑定到哪个 agent bot”。

字段建议：
- id
- user_id
- user_agent_id
- telegram_bot_id                // FK -> user_agent_telegram_bot.id
- channel                        // telegram
- status                         // pending / connected / disconnected / blocked
- external_chat_id
- external_user_id
- external_username
- external_display_name
- bind_code
- bind_code_expires_at
- connected_at
- last_active_at
- metadata_json
- created_at
- updated_at

说明：
- 第一版 bind code 主要用于建立 chat 与 bot 的可信绑定
- 后续支持群组、频道时可以复用 `metadata_json`

---

## runtime_config_sync_job（可选）
如果后续同步链路复杂，建议加配置同步任务表。

字段建议：
- id
- user_id
- user_agent_id
- sync_type              // telegram_bot / full_runtime
- status                 // queued / running / done / failed
- payload_json
- error
- created_at
- updated_at
- finished_at

第一版也可以不建表，先用同步函数直接执行。

---

## 容器内配置投影原则

网页配置不是只写数据库，还必须同步到用户容器内 OpenClaw 配置。

目标写入位置：
- `/home/openclaw/.openclaw/openclaw.json`
- `/home/openclaw/.openclaw/agents/<agent>/agent/...`
- 如有必要的 auth/channel 配置文件

建议抽象成统一能力：

### applyAgentChannelConfigToRuntime(userId, userAgentId)
职责：
1. 读取数据库中的 Agent + Telegram bot 配置
2. 生成该 agent 的 OpenClaw 渠道配置片段
3. 写入用户容器对应配置文件
4. 校验配置格式
5. reload gateway / agent runtime
6. 返回同步结果

---

## Telegram 路由模型

### 入站消息
Telegram webhook -> 定位 bot -> 定位 user_agent -> 定位 user runtime -> 路由到 agent

路由键：
1. webhook_path / webhook_secret 定位 bot
2. bot -> user_agent_id
3. user_agent_id -> user_id + runtime_agent_id
4. 调用容器内对应 agent

### 出站消息
Agent reply -> 根据当前 telegram_bot_id / chat_id -> 回发 Telegram

---

## 多 Agent 可扩展原则

为避免后续返工，必须遵守：

1. 不把 Telegram chat id 直接塞进 user 表
2. 不把 Telegram 配置只挂在 user 级别
3. 所有渠道绑定必须挂在 `user_agent` 上
4. runtime 配置同步必须按 agent 粒度处理
5. bot 与 chat 绑定关系必须分开建模

---

## 第一版实现约束（为了快速落地）

虽然结构按多 Agent / 多 Bot 设计，但第一版可加以下限制：

1. 每个 user 默认先自动创建一个 `main` agent
2. 每个 agent 第一版最多绑定 1 个 Telegram bot
3. 仅支持 Telegram 私聊 chat
4. webhook 成功绑定后，消息默认全部路由到该 agent

这样可以：
- 产品先跑通
- 数据结构不返工
- 以后逐步放开限制

---

## Step 1 结论

推荐主语从“用户绑定 Telegram”升级为：

**用户的某个 Agent 绑定某个 Telegram Bot，并将配置同步进该用户 Docker runtime 中对应 Agent 的 OpenClaw 配置。**

这是后续支持：
- 多 Agent
- 多 Telegram Bot
- 多渠道
- 容器内配置热更新

最稳的基础模型。
