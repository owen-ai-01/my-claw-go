# Chat Reboot Step 1 - 后台 Chat 入口与两态页面模型

## 目标

将当前复杂的 runtime-ready / tasks / 自定义聊天链路收敛为更简单的产品模型：

1. 登录后后台有一个明确的 `Chat` 按钮
2. Chat 页面只分两种状态：
   - `not_created`
   - `ready`
3. 首次创建和后续聊天彻底分离
4. 后续聊天尽量对齐 OpenClaw 自带 `/chat` 的短链路思路

---

## 结论

新的主路径不再是：
- 进入 bot 页面后再混合处理创建、ready、warmup、task queue

而改为：

### 状态 1：not_created
用户还没有自己的 MyClawGo runtime。

页面展示：
- 标题：Create your MyClawGo
- 描述：Create your private OpenClaw cloud workspace.
- 按钮：Create My MyClawGo

点击后进入单独创建流程。

### 状态 2：ready
用户的 Docker runtime 已存在，且 OpenClaw 可运行。

页面展示：
- 直接进入聊天框
- 后续不再出现首次创建类 loading 页面

---

## 页面结构建议

### 路由
- `/chat`

### 后台导航
在登录后后台导航中新增：
- Chat

建议顺序：
- Dashboard
- Chat
- Payment / Billing
- Settings

---

## Chat 页职责

### 未创建态
- 只做“创建自己的 MyClawGo”
- 不出现聊天输入框
- 不做多层 ready/warmup 判断

### 已创建态
- 直接显示聊天页
- 后续页面聊天尽量参考 OpenClaw `/chat`：
  - 更短的消息链路
  - 更少的本地状态复制
  - 历史尽量依赖 runtime / gateway 真相源

---

## 运行判断原则

### not_created
满足任一条件即可视为未创建：
- 用户容器不存在
- 用户 runtime 目录不存在或缺关键配置
- OpenClaw runtime 尚不可用

### ready
满足全部条件即可直接聊天：
- 用户容器存在
- 容器内 OpenClaw 可运行
- gateway 可用（或能直接进入 OpenClaw chat 模式）

注意：
- 这里不再把“创建”和“聊天”揉在同一条页面链路里
- 创建是单独的前置动作
- 聊天是稳定状态下的常规动作

---

## Step 1 结果

新的聊天产品模型正式改为：

- 后台增加 Chat 入口
- 首次先创建
- 创建完成后直接进入聊天
- 后续聊天尽量贴近 OpenClaw `/chat` 的实现思路

这是后续重构聊天主链路的基础。
