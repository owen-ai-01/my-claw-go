# MyClawGo Phase 1 技术摸底：OpenClaw Agent 结构结论

> 更新时间：2026-03-17  
> 目标：确认当前 OpenClaw 在用户容器中的多 Agent 真实结构，作为 Phase 1 实施依据。

---

## 一、结论摘要

这次摸底的核心结论是：

## **新增 Agent 不应该由平台手写目录和配置，而应该优先调用 OpenClaw 官方 CLI：**

- `openclaw agents add`
- `openclaw agents delete`
- `openclaw agents set-identity`
- `openclaw agents list`

也就是说，Phase 1 的“添加员工 / 删除员工 / 配置身份”主链路，优先应建立在 OpenClaw 原生能力上，而不是桥接层自行拼装底层文件。

---

## 二、当前真实结构（基于测试容器）

测试容器：
- `myclawgo-test-7eXj00L1h6lQV5HzH6IkNRULIUFqruSR`

用户 OpenClaw 根目录：
- `/home/openclaw/.openclaw`

### 当前主 Agent（main）
在 `openclaw.json` 中，当前 `main` Agent 的核心定义是：

```json
{
  "agents": {
    "defaults": {
      "workspace": "/home/openclaw/.openclaw/workspace"
    },
    "list": [
      {
        "id": "main",
        "workspace": "/home/openclaw/.openclaw/workspace"
      }
    ]
  }
}
```

### 重要观察
1. `main` Agent 的定义主要来自：
   - `openclaw.json -> agents.list[]`
2. `main` 当前没有显式 `identity` 字段
3. 当前也没有看到一个现成的：
   - `/home/openclaw/.openclaw/agents/main/agent.md`
4. 当前主 workspace 是：
   - `/home/openclaw/.openclaw/workspace`
5. 当前主 Agent 状态目录存在于：
   - `/home/openclaw/.openclaw/agents/main/agent`
   - `/home/openclaw/.openclaw/agents/main/sessions`

---

## 三、OpenClaw 官方 CLI 能力

本次确认到 OpenClaw 已内置多 Agent 管理命令：

### 1. 列出 Agent
```bash
openclaw agents list --json
```

### 2. 新增 Agent
```bash
openclaw agents add <name> --workspace <dir> --agent-dir <dir> --model <id> --non-interactive --json
```

### 3. 删除 Agent
```bash
openclaw agents delete <id> --force --json
```

### 4. 设置身份
```bash
openclaw agents set-identity --agent <id> --name <name> --emoji <emoji> --avatar <path> --theme <theme> --json
```

---

## 四、实测新增 Agent 的行为

本次在测试容器里临时创建了一个 Agent：
- `demoagent`

使用命令：

```bash
openclaw agents add demoagent \
  --workspace /home/openclaw/.openclaw/workspace-demoagent \
  --agent-dir /home/openclaw/.openclaw/agents/demoagent \
  --model openrouter/openai/gpt-4o-mini \
  --non-interactive \
  --json
```

### 实测结果
OpenClaw 自动完成了以下事情：

#### 1. 修改 `openclaw.json`
将新 Agent 写入 `agents.list[]`。

#### 2. 创建新的 workspace
创建了：
- `/home/openclaw/.openclaw/workspace-demoagent`

其中自动初始化了：
- `.git`
- `.openclaw/workspace-state.json`
- `AGENTS.md`
- `BOOTSTRAP.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `SOUL.md`
- `TOOLS.md`
- `USER.md`

#### 3. 创建新的 agentDir
创建了：
- `/home/openclaw/.openclaw/agents/demoagent`
- `/home/openclaw/.openclaw/agents/demoagent/sessions`

### 关键结论
这说明新增 Agent 时：

## **workspace 初始化逻辑和 agent 状态目录初始化逻辑，都应该交给 OpenClaw 官方 CLI。**

平台不应该自己复制模板文件来模拟。

---

## 五、实测设置身份的行为

使用命令：

```bash
openclaw agents set-identity \
  --agent demoagent \
  --name "销售助理" \
  --emoji "💼" \
  --avatar "avatars/sales.png" \
  --theme "sales closer" \
  --json
```

### 实测结论
`set-identity` 会把身份字段写入：
- `openclaw.json -> agents.list[].identity`

而不是写入某个单独的 Agent metadata 文件。

### 关键结论
这意味着 Agent 的“头像 / 名称 / emoji / theme”等身份信息，优先应该通过：
- `openclaw agents set-identity`
或直接配置 `agents.list[].identity`
来管理。

---

## 六、关于 agent.md 的结论

当前摸底中没有看到主 Agent 存在一个显式的：
- `/home/openclaw/.openclaw/agents/main/agent.md`

这意味着：
1. 现版本 OpenClaw 的 Agent 设定不一定是通过单独 `agent.md` 文件直存的
2. 也可能更多依赖：
   - workspace 内文件（如 `AGENTS.md` / `SOUL.md` / `IDENTITY.md` / `USER.md`）
   - `openclaw.json` 的 `agents.list[]` 配置
3. 因此 Phase 1 中“agent.md 编辑”这个需求，不能直接假定 OpenClaw 现有就有对应文件路径

### 当前建议
在真正开始“agent.md 编辑”前，需要再做一个小确认：
- OpenClaw 当前是否支持独立 agent.md 作为 per-agent prompt 文件
- 如果没有，Phase 1 应先把这块落为：
  - `identity + workspace + model + role metadata`
  - 后续再设计“per-agent custom prompt”落点

---

## 七、对 Phase 1 的直接影响

基于本次摸底，Phase 1 应调整为：

### 1. 添加员工
优先调用：
- `openclaw agents add`

### 2. 删除员工
优先调用：
- `openclaw agents delete`

### 3. 设置头像 / 名称 / 主题 / emoji
优先调用：
- `openclaw agents set-identity`

### 4. Agent 列表页
优先基于：
- `openclaw agents list --json`
或
- 读取 `openclaw.json -> agents.list[]`
来展示

### 5. 模型配置
很可能通过修改：
- `agents.list[].model`
来实现

### 6. Telegram 配置
更可能属于：
- `bindings`
- channel routing
- channel config
这一层，而不是 Agent metadata 文件本身

---

## 八、推荐的下一步

在进入正式编码前，接下来最值得继续确认的两个点是：

### A. 每个 Agent 的模型修改，应该走哪条最稳的路径？
候选：
- 改 `openclaw.json -> agents.list[].model`
- 或调用某个现有 CLI / config set

### B. Telegram per-agent 配置应该落在哪？
需要对照 OpenClaw Telegram / multi-agent / bindings 文档进一步确认：
- bot token 是全局还是可 per-agent
- agent 和 Telegram routing 的绑定关系怎么建
- 是否需要 `bindings`

---

## 九、一句话结论

Phase 1 的技术实现主原则应明确为：

## **让 bridge / 平台调用 OpenClaw 官方多 Agent CLI 完成 Agent 生命周期管理，而不是自己手写底层 Agent 文件结构。**
