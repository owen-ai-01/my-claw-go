# Hetzner 自动扩容 Runtime Host 方案 2026-04-21

> 日期：2026-04-21
> 场景：当前业务已经部署在 VPS 上，后续如果用户变多，是否可以自动购买 Hetzner 服务器并在新服务器上创建新的 Docker 容器。

---

## 1. 结论

这个方向技术上可行，但不建议做成：

`每来一个付费用户，就自动买一台新 VPS。`

更合理的方式是：

`自动扩容 runtime host 池，而不是按用户逐台买机。`

也就是说：

- 可以用 API 自动创建 Hetzner Cloud 服务器
- 但应该把新增服务器当成新的 runtime host 节点
- 每台 host 上继续跑多个用户 Docker 容器
- 用户按规则分配到某台 host，而不是一人一台 VPS

---

## 2. 为什么这个方向可行

Hetzner Cloud 本身提供了自动化管理能力：

- 可以通过 API 创建服务器
- 可以用 Snapshot 创建新服务器副本
- 创建时可以附带 SSH key、Labels、Firewall、Private Network、Cloud-init
- 可以用 API token 做自动化操作

这意味着从基础设施角度看，你完全可以做：

1. 检测资源阈值
2. 触发 Hetzner API 创建新服务器
3. 用 cloud-init 或 Snapshot 初始化环境
4. 把新服务器注册进你的 runtime host 池
5. 把后续新用户调度到新 host

所以“自动扩容新服务器”这件事本身没问题。

---

## 3. 为什么不建议做成“一用户一台 VPS”

### 3.1 创建服务器不是瞬时完成

即使 Hetzner API 支持自动创建服务器，完整可用仍然需要时间：

- 创建 VPS
- 开机
- 初始化系统
- 安装依赖
- 启动 Docker
- 启动你的 host 管理服务
- 通过健康检查

所以如果用户刚付款就临时买一台机，这段等待时间会直接变成用户体验问题。

### 3.2 容量和机型可用性不是 100% 保证

Hetzner 的 server type availability 是动态的。

这意味着：

- 规则上可以创建
- 但不保证你触发自动扩容那一刻一定有货

如果你的设计是“必须立刻买到新机器，不然新用户没法用”，那风险会非常高。

### 3.3 默认项目配额很低

Hetzner Cloud 文档说明，项目默认 server limit 比较低。

如果你按用户自动买机，很快就会先撞到：

- server 数量上限
- IP、快照、网络、负载均衡等配额限制

### 3.4 成本和碎片化会很快失控

你当前本来就是“每个用户一个 Docker 容器”的模型。  
如果再叠一层“每个用户一台 VPS”，资源浪费会非常明显：

- 大量低利用率机器
- 成本抬高
- 运维对象暴增
- 调试和监控都更复杂

### 3.5 故障面会更大

如果整个链路全自动，会多出很多失败点：

- API 创建失败
- 初始化脚本失败
- 没有加入 private network
- firewall 没套上
- host agent 没启动
- 没注册到调度器

这些问题一旦发生，就会直接影响刚付费的新用户。

---

## 4. 更推荐的目标架构

推荐做成三层结构：

### 4.1 Control Plane

专门负责：

- 主站
- 登录
- 支付
- 数据库访问
- 用户与 host 的绑定关系
- 调度决策

### 4.2 Runtime Host Pool

每台 runtime host 负责：

- 运行多个用户 Docker 容器
- 对外提供 host agent / 管理接口
- 承接被分配到本机的用户 runtime

### 4.3 Host Scheduler

由 control plane 里的调度逻辑决定：

- 新用户该分配到哪台 host
- 哪台 host 已经接近满载
- 是否需要触发新增 host

---

## 5. 推荐的扩容方式

正确方向不是：

- 用户付款
- 立刻买一台新 VPS
- 只给这个用户用

而应该是：

- 系统持续监控 host 池容量
- 当容量接近阈值时，自动新增一台 host
- 新 host 准备好之后，后续新用户再分配过去

也就是：

`按容量扩主机池，而不是按用户逐台买机器。`

---

## 6. 什么时候触发自动新增 Host

建议使用“容量阈值”而不是“新用户事件”触发。

例如可以在满足以下任一条件时，创建新 host：

- 某个 host CPU 平均使用率持续高于 `70%`
- 某个 host 内存使用率持续高于 `75%`
- 运行中容器数达到设定上限
- 剩余可分配资源不足以再容纳 1 个新的 Premium 用户
- Host 池里没有空闲节点

更稳的方式是：

- 池里始终保留 `1 台 warm spare`

也就是不要等到机器已经满了、用户已经付款了，才临时去买机。

---

## 7. 推荐的落地步骤

### 第 1 步：先支持“手动加 host，系统自动分配用户”

这是第一阶段最现实的做法。

目标：

- 先把架构改成支持多 host
- 但新增 host 先人工触发

这样风险最低。

### 第 2 步：再支持“达到阈值自动创建 host”

等多 host 调度已经稳定后，再做：

- 自动调用 Hetzner API
- 自动创建服务器
- 自动初始化
- 自动注册入池

### 第 3 步：最后再做自动缩容

缩容比扩容更危险，后做更合理。

后面可以再考虑：

- 长期空闲 host 自动回收
- 非高峰时缩小池子

---

## 8. 你当前代码离这个方案还有多远

你现在的代码明显还是单机假设。

### 8.1 Runtime session 还在本地 JSON

当前：

- `src/lib/myclawgo/session-store.ts`

问题：

- 只能天然适配单机
- 换 host 后 session 不能共享

### 8.2 Bridge target 还是查本机 Docker

当前：

- `src/lib/myclawgo/bridge-target.ts`

逻辑是：

- 查本地 session
- 用本机 `docker inspect` 取容器 IP
- 再请求 bridge

这意味着现在默认假设是：

- 用户容器就在当前机器上

一旦容器可能在第二台机器上，这条路径就不成立了。

### 8.3 Runtime 容器直接在本机 docker run

当前：

- `src/lib/myclawgo/docker-manager.ts`

这部分还是本机直接操作 Docker，不是“远程某台 host 执行容器管理”。

所以现在还不具备“自动买机后把用户容器放到新主机”的结构基础。

---

## 9. 为这个方案必须补的能力

至少需要新增这些基础能力：

### 9.1 `runtime_host` 表

记录：

- host id
- host name
- region / location
- private IP
- public IP
- status
- allocatable CPU / memory
- current container count

### 9.2 `runtime_session` 或用户到 host 的绑定关系

至少要知道：

- 用户属于哪台 host
- containerName 是什么
- 用户数据目录在哪里

### 9.3 Host Agent

每台 runtime host 上建议有一个轻量 agent，对外暴露：

- create container
- start container
- stop container
- inspect container
- health check
- metrics report

这样 control plane 就不需要 SSH 上去硬执行命令。

### 9.4 Scheduler

负责决定：

- 新用户放哪台 host
- 哪台 host 接近满载
- 哪台 host 可以下线

### 9.5 Host Provisioner

负责：

- 调 Hetzner API 创建服务器
- 等机器 ready
- 跑初始化脚本
- 接入 private network / firewall / labels
- 安装 Docker 和 host agent
- 注册到系统

---

## 10. 最推荐的路径

对你当前项目，最现实的路线是：

### 短期

- 保持 1 台 control plane
- 支持多台 runtime host
- 先手动新增 host
- 系统自动分配用户

### 中期

- 监控 host 池容量
- 容量接近阈值时自动创建新 host
- 预留 1 台 warm spare

### 长期

- Pro / Premium / Ultra 分池
- `Ultra` 独立池，甚至独立机器

---

## 11. 最终结论

这个方案值得做，但正确做法不是：

`每来一个付费用户，就自动买一台 VPS。`

而应该是：

`当 runtime host 池接近容量阈值时，自动创建新 host，然后把后续新用户分配过去。`

这才是更稳、更省钱、也更适合你当前架构演进方向的方案。

---

## 12. 参考

- Hetzner API overview
  - https://docs.hetzner.cloud/
- Hetzner API token docs
  - https://docs.hetzner.com/cloud/api/getting-started/generating-api-token
- Hetzner API usage docs
  - https://docs.hetzner.com/cloud/api/getting-started/using-api
- Hetzner server creation docs
  - https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server
- Hetzner server overview and limits
  - https://docs.hetzner.com/cloud/servers/overview
- Hetzner networks overview
  - https://docs.hetzner.com/cloud/networks/overview
- Hetzner load balancer creation docs
  - https://docs.hetzner.com/networking/load-balancers/getting-started/creating-a-load-balancer/
- Hetzner snapshots overview
  - https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/
- 本地实现参考
  - `src/lib/myclawgo/session-store.ts`
  - `src/lib/myclawgo/bridge-target.ts`
  - `src/lib/myclawgo/docker-manager.ts`

