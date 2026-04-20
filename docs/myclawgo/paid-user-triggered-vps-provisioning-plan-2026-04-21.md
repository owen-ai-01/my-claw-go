# 付费用户触发自动购机并创建 Runtime Docker 方案 2026-04-21

> 日期：2026-04-21
> 场景：当新的付费用户到来时，如果现有 runtime host 没有足够容量承接该用户的 Docker 容器，则自动调用 Hetzner API 购买新的 VPS，初始化完成后在新主机上创建该用户的 runtime 容器。

---

## 1. 结论

这个需求可以做，但第一版不要做成：

`Stripe webhook 同步买机 -> 同步初始化 -> 同步 docker run -> 同步返回成功`

应该做成：

`付费成功 -> 写入 provisioning job -> 调度现有 host 或新购 host -> 容器 ready -> 用户进入可用状态`

原因很直接：

- Hetzner 新开 VPS、开机、cloud-init、Docker 启动、host agent 注册都需要时间。
- 你当前代码仍然是“控制面和 Docker 都在同一台机器”的单机假设。
- 如果把“购机 + 初始化 + 创建容器”塞进支付 webhook，失败面太大，超时风险也高。

如果你现在就要落地，第一版最稳的方案是：

1. 支付成功后只更新业务数据，并投递一个异步 `runtime_provision_job`。
2. worker 先检查现有 host 是否还有可分配容量。
3. 有容量就直接在现有 host 上创建该用户容器。
4. 没容量就自动创建一台新的 Hetzner runtime host。
5. 新 host 初始化并注册成功后，再在这台 host 上创建用户容器。
6. 用户前台看到的是“Workspace 正在准备中”，不是直接报错。

---

## 2. 当前代码为什么还不能直接这样做

你现在付费后的 runtime 链路是：

- `src/payment/provider/stripe.ts:828`
- `src/lib/myclawgo/runtime-warmup.ts:6`
- `src/lib/myclawgo/runtime-warmup.ts:17`
- `src/lib/myclawgo/docker-manager.ts:331`

当前含义是：

- Stripe 收到 `invoice.paid` 之后，会直接 `warmupRuntimeForUser(...)`
- `warmupRuntimeForUser(...)` 会直接 `ensureSessionById(...)`
- 然后调用 `ensureUserContainer(...)`
- `ensureUserContainer(...)` 内部会在当前这台机器上直接执行 `docker start` / `docker run`

另外还有 3 个关键的单机假设还没拆：

- `src/lib/myclawgo/session-store.ts:20`
  runtime session 仍然写在本地 `sessions.json`
- `src/lib/myclawgo/bridge-target.ts:15`
  bridge target 仍然通过本机 `docker inspect` 获取容器 IP
- `src/db/schema.ts`
  目前还没有 `runtime_host`、`runtime_allocation`、`runtime_provision_job` 这类多机调度所需的数据表

所以现在缺的不是“再调一次 Hetzner API”，而是“整条 runtime 调度链路还没有多机化”。

---

## 3. 目标架构

### 3.1 Control Plane

负责：

- 支付与订阅
- 用户与套餐
- provisioning job
- host 调度
- runtime host 注册
- 用户到 host 的绑定关系

### 3.2 Runtime Host

每台 runtime host 负责：

- 运行多个用户 Docker 容器
- 上报 CPU / 内存 / 磁盘 / 容器数量
- 接收 create / start / stop / inspect 指令

### 3.3 Host Agent

每台 runtime host 上都部署一个轻量 agent，对 control plane 提供：

- `/health`
- `/metrics`
- `/containers/create`
- `/containers/start`
- `/containers/stop`
- `/containers/inspect`

### 3.4 Provisioner Worker

负责：

- 调用 Hetzner API 创建新 VPS
- 等待开机
- 通过 `cloud-init` 完成初始化
- 等待 host agent 注册成功
- 把新主机写入 `runtime_host` 表

---

## 4. 推荐的第一版流程

### Step 1：支付成功后只入队，不直接本机建容器

`src/payment/provider/stripe.ts` 里现在的 `warmupRuntimeForUser(...)` 不要继续直接做本机 Docker 操作。

应该改成：

- 记录 `payment` / `credits`
- 创建一条 `runtime_provision_job`
- 返回支付成功
- 由后台 worker 异步处理

这样 webhook 不会因为买机和初始化太慢而超时。

### Step 2：worker 先尝试调度到现有 host

worker 执行：

1. 读取用户套餐。
2. 换算出该用户需要的资源上限。
3. 查询 `runtime_host` 池里是否有可承接的 host。
4. 如果有，就直接分配该 host 并调用 host agent 创建容器。

### Step 3：没有容量时触发新购机

如果没有可承接 host：

1. 把 job 状态更新为 `provisioning_host`
2. 调用 Hetzner API 创建新 VPS
3. 传入 `server_type`、`image` 或 `snapshot`、`network`、`firewall`、`labels`、`ssh_keys`
4. 通过 `cloud-init` 安装 Docker、拉起 host agent、加入私网
5. 等待 host agent 回调 control plane 完成注册

### Step 4：新 host ready 后再创建用户容器

当 host ready：

1. 写入 `runtime_host`
2. 为用户创建 `runtime_allocation`
3. 调用新 host 的 agent 创建容器
4. 容器健康检查通过后，将状态标记为 `ready`

### Step 5：用户前台展示“准备中”

前台不要假设“支付成功就一定立刻可用”。

建议 runtime 状态至少有：

- `pending`
- `provisioning_host`
- `creating_container`
- `ready`
- `failed`

用户进入 `/chat` 或 runtime 页面时，如果还没 ready，就展示：

- 已支付成功
- 正在准备专属工作区
- 预计需要几十秒到几分钟
- 失败时可重试或联系支持

---

## 5. 容量判断不能只看 `free -m`

第一版容量判断建议按“已分配上限”而不是“实时使用量”。

原因：

- 你卖的是套餐资源承诺，不是临时抢内存。
- 仅看 `free -m` 很容易把缓存、突发峰值和宿主机保留算错。
- 新用户一开始跑任务时，实时资源占用会快速抬升。

建议每台 host 维护两组值：

- `total_cpu / total_memory_mb / total_disk_gb`
- `allocatable_cpu / allocatable_memory_mb / allocatable_disk_gb`

再维护已分配值：

- `reserved_cpu`
- `reserved_memory_mb`
- `reserved_disk_gb`
- `container_count`

调度条件建议：

- `allocatable - reserved >= 新用户套餐资源`
- 并且保留 `10% ~ 20%` 的宿主机余量
- 并且容器数不超过单机阈值

更稳的规则是：

- 不等到“`docker run` 已经失败”才买机
- 而是在“剩余可分配资源已不足以承接新用户套餐”时就先触发新购机

---

## 6. 推荐的数据表

### 6.1 `runtime_host`

建议字段：

- `id`
- `provider`：`hetzner`
- `providerServerId`
- `name`
- `region`
- `privateIp`
- `publicIp`
- `serverType`
- `status`：`provisioning | ready | draining | unhealthy | failed`
- `totalCpu`
- `totalMemoryMb`
- `totalDiskGb`
- `allocatableCpu`
- `allocatableMemoryMb`
- `allocatableDiskGb`
- `reservedCpu`
- `reservedMemoryMb`
- `reservedDiskGb`
- `containerCount`
- `agentVersion`
- `lastHeartbeatAt`
- `createdAt`
- `updatedAt`

### 6.2 `runtime_allocation`

作用：

- 记录用户被分配到了哪台 host
- 记录该用户的容器信息
- 作为后续 bridge 路由依据

建议字段：

- `id`
- `userId`
- `hostId`
- `plan`
- `containerName`
- `containerStatus`
- `bridgeBaseUrl`
- `userDataDir`
- `assignedAt`
- `lastStartedAt`
- `createdAt`
- `updatedAt`

### 6.3 `runtime_provision_job`

作用：

- 记录“这次是因为哪个用户触发了新购机”
- 让 provisioning 过程可重试、可观测、可人工接管

建议字段：

- `id`
- `userId`
- `hostId` nullable
- `triggerType`：`payment_capacity_shortage`
- `plan`
- `requiredCpu`
- `requiredMemoryMb`
- `requiredDiskGb`
- `status`：`pending | selecting_host | provisioning_host | waiting_host_register | creating_container | ready | failed`
- `attemptCount`
- `lastError`
- `createdAt`
- `updatedAt`

---

## 7. Hetzner 自动购机的实现建议

### 7.1 优先用 Snapshot 或固定 image + cloud-init

第一版更稳的选择：

- 用一台已经配置好的 runtime 模板机做 `snapshot`
- 新机直接从 snapshot 创建
- `cloud-init` 只负责少量启动参数和注册 token

这样可以减少：

- Docker 安装失败
- 依赖版本不一致
- 初始化时间过长

### 7.2 新购机应该是 Runtime 专用节点

不要继续把新机做成“主站 + Docker 混跑”。

建议角色拆分：

- 当前老机可以继续兼任 control plane
- 新买的机只跑 runtime 容器和 host agent

### 7.3 需要的 Hetzner 创建参数

至少配置：

- `server_type`
- `image` 或 `snapshot`
- `location`
- `network`
- `firewall`
- `labels`
- `ssh_keys`
- `user_data`（cloud-init）

### 7.4 Host 注册方式

推荐在 cloud-init 最后一步调用 control plane 的注册接口：

- 携带一次性 registration token
- 上报码机型、IP、agent 版本
- 注册成功后才能进入 `ready`

---

## 8. 代码改造点

### 8.1 `src/payment/provider/stripe.ts`

当前：

- 支付成功后直接 `warmupRuntimeForUser(...)`

建议改成：

- 支付成功后 `enqueueRuntimeProvisionJob(userId, reason)`
- 不在 webhook 内直接做本机 Docker 操作

### 8.2 `src/lib/myclawgo/runtime-warmup.ts`

当前：

- 直接 `ensureSessionById + ensureUserContainer`

建议改成：

- 变成 orchestration 入口
- 只负责投递或触发 provisioning job
- 真正建容器放到 worker + host agent

### 8.3 `src/lib/myclawgo/session-store.ts`

当前：

- 本地 `sessions.json`

建议改成：

- DB 存储 `runtime_allocation`
- 本地文件只保留临时缓存，不再作为事实源

### 8.4 `src/lib/myclawgo/bridge-target.ts`

当前：

- 本机 `docker inspect` 取 IP

建议改成：

- 先查 `runtime_allocation.hostId`
- 再查 `runtime_host`
- 由 host 记录或 allocation 记录解析 bridge 地址

### 8.5 `src/lib/myclawgo/docker-manager.ts`

当前：

- 默认假设 Docker 就在 control plane 本机

建议拆成两层：

- control plane 侧：调度和 API client
- runtime host 侧：本地 Docker executor

也就是把现在这份 `docker-manager` 里的大部分“本机 exec docker”逻辑，迁到 host agent 那边。

### 8.6 `src/db/schema.ts`

建议新增：

- `runtimeHost`
- `runtimeAllocation`
- `runtimeProvisionJob`

---

## 9. 第一版最小可行状态机

### 用户 runtime 状态

- `not_requested`
- `pending`
- `provisioning_host`
- `creating_container`
- `ready`
- `failed`

### host 状态

- `provisioning`
- `registering`
- `ready`
- `draining`
- `unhealthy`
- `failed`

### job 状态

- `pending`
- `selecting_host`
- `provisioning_host`
- `waiting_host_register`
- `creating_container`
- `ready`
- `failed`

这个状态机很重要，因为你后面做重试、排错、告警和前台展示，都要围绕这些状态来设计。

---

## 10. 异常与失败处理

至少要处理这 6 类失败：

1. Hetzner API 创建失败
2. 项目配额不足
3. 目标机型在当前 location 没有容量
4. cloud-init 或 host agent 启动失败
5. host 注册成功但 Docker 创建容器失败
6. 用户已付款，但 provisioning 超时

建议处理策略：

- job 进入 `failed`
- 记录 `lastError`
- 支持后台重试
- 发送站内通知或管理员告警
- 用户前台显示“工作区准备失败，正在重试”或人工介入提示

---

## 11. 最现实的实施顺序

### Phase 1：先做多 host 调度，不自动买机

目标：

- 先把单机假设拆掉
- 手动准备第二台 runtime host
- 系统已经能把新用户分配到不同 host

这是最关键的一步。
如果这一步没完成，后面自动买机也没有地方接住。

### Phase 2：再做“容量不足时自动购机”

目标：

- worker 能判断没有可用 host
- 自动调用 Hetzner API 创建新 host
- 新 host 注册成功后承接新用户容器

### Phase 3：再做预热和更好体验

目标：

- 保留 1 台 warm spare
- 或在剩余容量低于阈值时预先购机
- 缩短新付费用户等待时间

### Phase 4：最后做自动缩容

目标：

- 长时间空闲 host 自动回收
- 降低成本

---

## 12. 我对你这个需求的直接建议

如果你现在就想做，最稳的第一版不是：

`新付费用户 -> 发现不够 -> 当场买机 -> 当场让用户马上能聊`

而是：

`新付费用户 -> 进入 provisioning 状态 -> 异步买机和建容器 -> ready 后再开放`

并且最好再加一条运营规则：

- 当 host 池里只剩不到 `1 个 Pro` 或 `1 个 Premium` 的可分配容量时，就提前购机

这样你就不会把“买机时间”完全暴露给刚付款的用户。

---

## 13. 最终结论

这个方案可以做，而且非常适合你后面从单机走向多机。
但要先接受一个事实：

`你要实现的，不是“支付后调用一下 Hetzner API”这么简单，而是一套多 host runtime 调度系统。`

如果按最稳的路径做，第一版应该是：

1. 支付成功后异步创建 provisioning job
2. 先查现有 host 是否有容量
3. 没容量就自动创建新的 Hetzner runtime host
4. host 注册成功后在新机上创建用户容器
5. 前台按状态显示“准备中 / 已就绪 / 失败重试”

这样才是真正可上线的版本。

---

## 14. 相关代码入口

- `src/payment/provider/stripe.ts:828`
- `src/payment/provider/stripe.ts:896`
- `src/payment/provider/stripe.ts:900`
- `src/lib/myclawgo/runtime-warmup.ts:6`
- `src/lib/myclawgo/runtime-warmup.ts:17`
- `src/lib/myclawgo/docker-manager.ts:331`
- `src/lib/myclawgo/docker-manager.ts:406`
- `src/lib/myclawgo/session-store.ts:20`
- `src/lib/myclawgo/bridge-target.ts:15`
- `src/db/schema.ts`
