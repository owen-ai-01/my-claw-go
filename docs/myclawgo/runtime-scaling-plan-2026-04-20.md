# MyClawGo Runtime 扩容方案 2026-04-20

> 日期：2026-04-20  
> 适用范围：当前以 1 台 `4核 8G` 服务器启动，后续随着用户增长扩容  
> 目标：从单机验证阶段，平滑演进到多台 runtime host 的可扩展架构

---

## 一、当前结论

当前这台 `4核 8G` 机器，适合早期验证，不适合长期承载当前公开套餐的完整资源承诺。

原因不是单纯“机器太小”，而是当前运行时整体仍然是**单机架构假设**：

- 用户 runtime 资源上限直接写在 `src/lib/myclawgo/docker-manager.ts`
  - Pro: `1 vCPU / 2 GB / 20 GB`
  - Premium: `2 vCPU / 4 GB / 40 GB`
  - Ultra: `4 vCPU / 8 GB / 80 GB`
- runtime session 仍写本地 JSON 文件：`src/lib/myclawgo/session-store.ts`
- bridge target 仍通过本机 `docker inspect` 获取容器 IP：`src/lib/myclawgo/bridge-target.ts`
- bridge 侧的 group/task/chat 仍有本地文件持久化
- 当前代码里没有看到“空闲自动停容器”的完整机制

这意味着：

- 只要有 1 个真正跑满的 `Ultra` 用户，这台 `4核 8G` 基本就满了
- 即使 CPU 和内存勉强够，后面也会先撞上单机状态存储和单机路由的问题

---

## 二、当前主要瓶颈

### 1. 计算资源瓶颈

`4核 8G` 扣掉系统、Next.js、PM2、Docker 开销后，真正能稳定留给 runtime 的预算并不大。

保守看，这台机器更适合：

- 少量活跃用户同时在线
- 较多“注册了但当前不活跃”的用户
- 验证产品链路是否成立

它不适合：

- 长时间承载多个高负载容器并发运行
- 稳定承诺 `Ultra` 和多个 `Premium` 同时活跃

### 2. 单机状态存储瓶颈

当前 `session-store.ts` 仍把 session 写到本地 `sessions.json`。这在单机上还能工作，但一旦变成多台 runtime host，会出现：

- session 数据不共享
- 主机切换后状态找不到
- 故障恢复复杂

### 3. 单机寻址瓶颈

`bridge-target.ts` 当前逻辑是：

- 先从本地 session 里拿 `containerName`
- 再在当前机器上执行 `docker inspect`
- 直接取容器 IP 去请求 bridge

这说明当前默认前提是：

- 用户容器就在当前这台机器上
- Web 应用和 runtime Docker 环境能直接互相访问

只要 runtime 被拆到第二台服务器，这条路径就不成立了。

### 4. Bridge 本地状态瓶颈

现有文档里也已经提到：

- `bridge/src/services/task.ts`
- `bridge/src/services/group.ts`
- `bridge/src/services/chat-store.ts`

都还有本地文件持久化逻辑。单机时还能接受，但多实例时会带来：

- 数据不一致
- 状态丢失
- 无法水平扩容

### 5. 空闲资源回收不足

当前代码有 `lastActiveAt`，但没有形成完整的“空闲自动停容器”机制。后续用户一多，最容易出现的是：

- 很多用户容器长期存在
- 实际没人用，但内存和磁盘一直被占着
- 单机容量被“静态占用”提前吃满

---

## 三、建议的扩容阶段

## 阶段 0：单机验证阶段

适用范围：

- 付费用户还很少
- 同时活跃用户很少
- 重点是验证转化、留存、模型成本和产品链路

建议做法：

- 继续使用当前 `4核 8G` 机器
- 不要把它当长期生产架构
- `Ultra` 先不要大规模卖，或者改成人工开通 / 单独审批

这一阶段必须优先补的能力：

1. 空闲自动停容器
2. 运行中容器数量上限
3. CPU / 内存 / 磁盘 / 容器数 / 启动耗时监控
4. 低资源告警

这一阶段的目标不是“撑很多人”，而是尽快避免资源被常驻容器吃光。

---

## 阶段 1：控制面与运行面拆分

适用范围：

- 用户开始稳定增长
- 单机经常接近资源上限
- 需要把 Web 服务和 runtime 容器分开

建议拓扑：

- 1 台 control plane
  - Next.js
  - Auth
  - Stripe
  - DB 访问
  - 管理 API
- 1 到 2 台 runtime host
  - Docker 容器
  - OpenClaw runtime
  - per-user bridge

这一阶段的核心原则：

- 用户一旦被分配到某台 runtime host，就**固定落在这台机器**
- 不做“每次请求动态漂移”
- 先做稳定的 host 绑定，再谈自动调度

需要新增的核心概念：

- `runtime_host`
  - host id
  - host name
  - 内网地址 / agent 地址
  - 状态
  - 可用 CPU / 内存
  - 当前运行容器数
- `user_runtime_assignment`
  - userId
  - runtimeHostId
  - containerName
  - assignedAt

这一阶段落地后，Web 不再假设“容器就在本机”。

---

## 阶段 2：多台 runtime host 池化

适用范围：

- 有持续新增付费用户
- runtime host 不止 1 台
- 需要按容量做新用户分配

建议做法：

- 建 runtime host 池
- 新用户注册 / 支付成功 / 首次启动 runtime 时，分配一台 host
- 后续用户所有 runtime 请求都走该 host

可以先用非常简单的调度策略：

- 优先分配当前运行容器数最少的 host
- 或按剩余内存最多分配
- 不必一开始就做复杂调度器

这一阶段重点不是“智能”，而是“稳定可维护”。

---

## 阶段 3：按套餐分池

适用范围：

- 用户规模进一步增长
- 不同套餐之间开始相互抢资源

建议做法：

- Pro 进入共享轻量池
- Premium 进入高配共享池
- Ultra 进入独立池，甚至独立机器

原因很直接：

- `Ultra` 的资源承诺太高
- 如果和 Pro、Premium 混跑，会把普通用户拖慢
- 共享池更适合突发低负载，不适合高规格长期占用

所以 `Ultra` 最终更适合：

- 独立 VM
- 独立 runtime host
- 或者单独的高规格 host 池

---

## 四、代码层面的必改项

### 1. 把 runtime session 从本地文件迁到 DB

当前文件：

- `src/lib/myclawgo/session-store.ts`

问题：

- 只能天然适配单机
- 多机后 session 无法共享

建议：

- 新建 `runtime_session` 表
- 字段包含：
  - `user_id`
  - `container_name`
  - `runtime_host_id`
  - `user_data_dir`
  - `created_at`
  - `last_active_at`

### 2. 把 bridge target 从“本机 inspect 容器”改成“按 host 路由”

当前文件：

- `src/lib/myclawgo/bridge-target.ts`

当前问题：

- 用 `docker inspect` 取本机容器 IP
- 默认 Web 与容器同机

建议：

- 改成先查 `runtime_session` / `runtime_host`
- 取该用户所在 host 的 bridge 访问地址
- 再转发请求

### 3. 把 bridge 本地状态迁到 DB / Redis

优先级：

- Group / Task 元数据先迁 Postgres
- 运行中瞬时状态再考虑 Redis

原因：

- 本地文件只适合单实例
- 多 runtime host 后状态会分裂

### 4. 增加 runtime host agent

建议给每台 runtime host 增加一个轻量 agent 或管理服务，对外暴露：

- create container
- start container
- stop container
- inspect container
- get metrics

这样 control plane 不需要远程 SSH 执行 Docker 命令，后续也更容易统一调度。

### 5. 增加空闲回收器

建议新增周期任务：

- 超过 `20-30` 分钟无活动的 runtime 自动停机
- 超过更长时间的无用容器做归档 / 清理

注意：

- “停机”优先于“删容器”
- 先做可恢复，再做更激进的清理

---

## 五、运营层面的容量规则

在当前阶段，建议不要按“注册用户数”估容量，要按“并发活跃用户”估容量。

### 当前 `4核 8G` 机器的建议使用方式

更像是：

- 一个早期验证节点
- 一个 control plane + 少量 runtime 的混合节点

不应该当成：

- 可长期承接大规模付费用户的 runtime 主节点

### 当前阶段的运营建议

- Pro 可以卖，但要尽快补空闲回收
- Premium 可以卖，但要控制并发预期
- Ultra 不建议在当前这台机器上作为标准共享套餐大推

如果要卖 `Ultra`，建议至少满足其中一个条件：

1. 给 `Ultra` 单独机器
2. 给 `Ultra` 单独 host 池
3. 暂时改成人工审批开通

---

## 六、建议的执行顺序

## 第 1 步：先补单机保命能力

本周优先做：

1. 空闲自动停容器
2. 运行容器数上限
3. 主机监控与告警
4. 统计 runtime 启动耗时、bridge 请求耗时、失败率

这一步的目标是让当前单机不要因为常驻容器而提前失控。

## 第 2 步：为多机做数据结构准备

建议尽快做：

1. `runtime_host` 表
2. `runtime_session` 表
3. 用户与 host 的绑定关系
4. bridge-target 改为按 host 解析

这一步完成后，代码才真正具备“接第二台 runtime host”的基础。

## 第 3 步：接入第二台 runtime host

建议方式：

- 保持当前机器继续承载 control plane
- 新增一台专门的 runtime host
- 新用户优先分配到新 host
- 老用户暂不迁移，先保持稳定

这样改造风险最低。

## 第 4 步：再做状态迁移和池化

后续再逐步完成：

1. bridge 本地文件状态迁 DB
2. relay / session 瞬时状态迁 Redis
3. host 池化调度
4. 套餐分池

---

## 七、推荐方案

如果按当前项目状态，我推荐的最现实路径是：

### 短期

- 当前 `4核 8G` 继续用
- 但只把它当验证节点
- 先补空闲停机、上限控制、监控告警

### 中期

- 拆成 `control plane + runtime host`
- 增加 `runtime_host` 和 `runtime_session` 数据模型
- 用户固定分配到单台 host

### 长期

- runtime 多主机池化
- bridge 状态迁 DB / Redis
- `Ultra` 独立池或独立机器

---

## 八、最终判断

当前最重要的不是把这台 `4核 8G` 继续往上硬撑，而是尽快把系统从“单机默认假设”改成“用户绑定某一台 runtime host”的结构。

只要这一步完成，后面加机器就是可重复的扩容动作：

- 加一台 host
- 把新用户分过去
- 监控容量
- 继续扩

如果这一步不做，后面无论升级到 `8核 16G`、`16核 32G`，本质都还是在放大单点风险。

---

## 九、参考代码与文档

- `src/lib/myclawgo/docker-manager.ts`
- `src/lib/myclawgo/session-store.ts`
- `src/lib/myclawgo/bridge-target.ts`
- `src/lib/myclawgo/bridge-fetch.ts`
- `src/lib/myclawgo/runtime-warmup.ts`
- `docs/production-health-check-2026-04-12.md`
- `docs/optimization-roadmap.md`

