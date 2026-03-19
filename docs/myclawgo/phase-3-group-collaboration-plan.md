# Phase 3: 群组协作功能规划

## 目标
让多个 Agent 能够在同一个协作空间内工作，实现真正的"AI 团队"协作。

## 核心概念

### 群组 (Group)
- 一个协作空间，包含多个 Agent
- 有自己的名称、描述、目标
- 有主负责人 Agent（群主）
- 有共享的上下文和历史记录

### 群组类型
1. **项目组** - 围绕具体项目/任务
2. **部门组** - 按职能划分（技术、运营、内容等）
3. **临时组** - 临时协作后可解散

## 数据模型

### Group 配置存储
```typescript
type Group = {
  id: string;              // 群组 ID
  name: string;            // 群组名称
  description?: string;    // 群组描述
  type: 'project' | 'department' | 'temporary';
  leaderId: string;        // 主负责人 Agent ID
  members: string[];       // 成员 Agent ID 列表
  channels: {              // 可选：群组专属渠道
    telegram?: {
      groupId?: string;
      enabled: boolean;
    };
  };
  createdAt: string;
  updatedAt: string;
};
```

### 存储位置
建议存在用户配置中：
```json
{
  "groups": {
    "list": [
      {
        "id": "tech-team",
        "name": "技术团队",
        "type": "department",
        "leaderId": "main",
        "members": ["main", "dev", "qa"]
      }
    ]
  }
}
```

## 功能设计

### 1. 群组管理

#### 创建群组
**API:**
```
POST /groups
{
  "id": "tech-team",
  "name": "技术团队",
  "type": "department",
  "leaderId": "main",
  "members": ["main", "dev"]
}
```

#### 编辑群组
```
PATCH /groups/:groupId
{
  "name": "...",
  "members": [...],
  "leaderId": "..."
}
```

#### 删除群组
```
DELETE /groups/:groupId
```

### 2. 群组聊天

#### 群组消息流转
当用户在群组中发消息时：
1. 消息发给主负责人 Agent（群主）
2. 群主决定：
   - 自己回答
   - @其他成员 Agent 协助
   - 分派任务给成员

#### 群内协作模式
- **串行模式**：任务依次传递（A → B → C）
- **并行模式**：多个 Agent 同时处理
- **讨论模式**：多个 Agent 轮流发言

### 3. 页面设计

#### `/groups` - 群组列表页
显示：
- 所有群组卡片
- 群组名称、成员数、主负责人
- 最近活动时间
- 快捷操作：进入群聊、编辑、删除

#### `/groups/:groupId` - 群组详情页
包含：
- 群组信息（名称、描述、类型）
- 成员列表（可添加/移除）
- 主负责人设置
- 群组聊天界面
- 活动历史

#### `/chat` 集成
在现有聊天页左侧列表中：
- Agent 列表
- **群组列表**（新增）
- 可切换个人 Agent 或群组聊天

## 实现计划

### Phase 3.1 - 群组基础管理
- [ ] 群组数据模型
- [ ] Bridge API：CRUD 群组
- [ ] Platform API：转发群组 API
- [ ] `/groups` 列表页
- [ ] 创建/编辑/删除群组 UI

### Phase 3.2 - 群组聊天
- [ ] 群组聊天历史存储
- [ ] 群主消息路由逻辑
- [ ] `/chat` 集成群组切换
- [ ] 群组聊天 UI

### Phase 3.3 - Agent 协作机制
- [ ] @mention 语法支持
- [ ] Agent 间消息传递
- [ ] 任务分派机制
- [ ] 协作模式配置

### Phase 3.4 - 高级功能
- [ ] 群组 Telegram 绑定
- [ ] 群组定时任务
- [ ] 群组性能统计
- [ ] 协作日志

## 技术方案

### 消息路由
```
用户消息 → 群主 Agent → 
  - 直接回复
  - @其他 Agent (通过 OpenClaw session 间消息)
  - 返回综合结果
```

### 群组上下文管理
每个群组有独立的：
- 聊天历史文件：`chats/group/{groupId}/history.md`
- 群组状态：当前讨论主题、待办任务
- 成员活动记录

### OpenClaw 集成
利用 OpenClaw 的：
- `sessions_send` - Agent 间消息
- `sessions_list` - 查看成员状态
- `subagents` - 任务调度（如果需要）

## 第一版最小可行方案

### 最简群组（建议先做）
1. **创建群组** - 选择成员、设置群主
2. **群组聊天** - 消息发给群主，群主回复
3. **成员展示** - 显示群组有哪些 Agent
4. **切换聊天** - 在 `/chat` 可以切换到群组

### 暂不做（后续扩展）
- Agent 自主 @其他人
- 复杂的协作流程
- 群组权限控制
- 跨群组协作

## 风险与注意

### 1. 上下文爆炸
群组聊天的上下文会快速增长，需要：
- 定期压缩/归档
- 清晰的会话边界
- 成员只看必要上下文

### 2. 响应延迟
多 Agent 协作会增加响应时间：
- 第一版先做同步模式（等所有 Agent 完成）
- 后续可以改异步（先返回，后续更新）

### 3. 责任归属
需要明确：
- 谁负责最终回复
- 如何处理冲突意见
- 错误由谁负责

### 4. 成本控制
多 Agent 协作意味着多次 API 调用：
- 第一版只在必要时才调用其他 Agent
- 避免"所有人都发言"的模式
- 群主应该智能决策是否需要协助

## 验收标准

Phase 3 完成时，用户应该能：
1. 创建一个包含 3 个 Agent 的技术团队群组
2. 在 `/chat` 切换到这个群组
3. 发送消息，由群主 Agent 回复
4. 看到群组成员列表
5. 编辑群组成员和主负责人

## 后续演进方向

### Phase 4 - 主动协作
- Agent 可以主动 @其他人
- 设置协作触发条件
- 自动任务分派规则

### Phase 5 - 项目管理
- 群组目标跟踪
- 任务看板
- 进度汇报
- 定期同步会议

### Phase 6 - 跨群协作
- 群组间消息
- 共享 Agent
- 组织架构树
