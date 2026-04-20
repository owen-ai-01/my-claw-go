# Hetzner CX33 升级到 CPX42 说明 2026-04-21

> 日期：2026-04-21
> 场景：当前生产服务器运行在 Hetzner Cloud `CX33`，这里说明是否可以升级到 `CPX42`、升级后 Docker 数据是否还在、以及服务是否会自动启动。

---

## 1. 核心结论

`CX33 -> CPX42` 是 Hetzner Cloud 支持的升级路径，但它不是严格意义上的零停机升级。

更准确的说法是：

- 可以直接升级
- 会有停机窗口
- 升级过程中服务器会关机
- 磁盘数据通常会保留
- 运行中的进程状态不会保留

所以，这应该被理解为一次“短暂停机升级”，而不是“无感在线迁移”。

---

## 2. 为什么这条升级路径通常可行

当前机型和目标机型分别是：

- `CX33`: `4 vCPU / 8 GB RAM / 80 GB disk`
- `CPX42`: `8 vCPU / 16 GB RAM / 320 GB disk`

这条路径通常成立，原因是：

- 目标机型规格更高
- 目标机型磁盘更大
- 两者都属于 Hetzner Cloud 的 x86 机型

不过，最终能不能当场升级成功，仍然取决于你所在机房位置当时是否有可用容量。

---

## 3. 升级时需要注意的限制

### 3.1 不是热升级

Hetzner Cloud 的 rescale 需要先把服务器停掉。

实际顺序通常是：

1. 停止业务服务
2. VPS 关机
3. 执行 rescale
4. VPS 重新开机
5. 恢复应用服务

所以如果此时已经有真实付费用户在线，就不应该把这件事描述成“无缝升级”。

### 3.2 磁盘变大后，后续降回小盘会受限

Hetzner 文档说明：

- 只能迁移到相同磁盘或更大磁盘的机型
- 磁盘不能缩小

这对你这里很重要，因为：

- `CX33` 是 `80 GB`
- `CPX42` 是 `320 GB`

如果这次连系统盘一起扩到更大，后面再想降回更小盘的机型会更麻烦。  
如果你短期只是想先增加 CPU 和内存，而不是立刻需要更大的系统盘，那么保留当前磁盘大小会更稳。

### 3.3 CPX 仍然是共享资源

`CPX42` 虽然比 `CX33` 更强，但它仍然属于 Hetzner Cloud 的 shared resources 系列，不是 dedicated CPU。

这意味着：

- 性能余量会更大
- 但不是独占核
- 长期高负载下的稳定性预期，不能按 dedicated 机器来理解

如果后面你的业务进入持续高负载阶段，真正该看的会是 `CCX` 这类 dedicated 资源。

### 3.4 目标机型是否可用还受实时容量影响

即使控制台里能看到目标机型，实际是否能成功升级，仍然取决于该 location 当时的资源是否充足。

所以正确理解应该是：

- 规则上支持升级
- 实际执行时还要看当时有没有容量

---

## 4. 升级后 Docker 数据会怎样

这里最重要的一句话是：

`磁盘里的数据通常还在，丢的是运行时状态。`

由于 Hetzner 的 rescale 会复制磁盘内容，所以以下内容通常都会保留：

- Docker 镜像
- Docker 容器定义
- `/var/lib/docker`
- 挂载在本机磁盘上的 bind mount 数据
- 存在本机系统盘上的 named volumes
- 项目代码和部署文件

但下面这些不应该指望保留：

- 内存里的状态
- 正在执行的任务
- 尚未落盘的临时运行状态
- 容器里正在运行的实时进程状态

所以如果你的问题是“之前 VPS 里的 Docker 东西还在不在”，结论是：

- 磁盘层面的 Docker 数据通常还在
- 正在运行的状态不会保留

---

## 5. 升级后服务会不会自动启动

这个问题要分 3 层来看。

### 5.1 VPS 本身

Hetzner 完成 rescale 后，VPS 会重新启动。

也就是说，机器本身会回来。

### 5.2 你的主站服务

从仓库里看，你的主站是用 PM2 管理的，部署脚本里明确执行了：

- `pm2 save`

相关文件：

- `scripts/deploy-online.sh`

但是，这个仓库里没有看到 `pm2 startup` 的配置步骤。

这意味着：

- 如果你已经在服务器上执行过 `pm2 startup`，那么 PM2 管理的主站服务大概率会在重启后自动起来
- 如果你没有执行过 `pm2 startup`，那只有 `pm2 save` 并不足以保证开机自动启动

实际区别是：

- `pm2 save`：保存当前进程列表
- `pm2 startup`：把 PM2 挂到系统开机启动流程里

### 5.3 你的用户 runtime Docker 容器

你当前每个用户的 runtime 容器，并不是配置成“宿主机一重启就全部自动启动”的模式。

因为当前代码里创建容器时，并没有带：

- `--restart always`
- `--restart unless-stopped`

相关文件：

- `src/lib/myclawgo/docker-manager.ts`

所以 Hetzner 升级并重启后：

- 容器本身还在
- 容器数据还在
- 但这些用户容器不会因为宿主机重启就全部自动拉起

不过你当前代码里有“按需启动”的逻辑：

- 用户回来访问时
- 系统会尝试对已有容器执行 `docker start`
- 然后再恢复 runtime 可用状态

所以准确描述应该是：

`用户 runtime 容器会被保留，但它们是按需启动，不是宿主机开机后全部自动启动。`

---

## 6. 结合你当前项目的实际判断

结合仓库里的实现和 Hetzner 的升级方式，更实际的判断是：

- VPS 升级后会重新启动
- `nginx` 是否自动起来，要看 systemd 是否已配置开机自启
- `docker` 是否自动起来，要看 systemd 是否已配置开机自启
- PM2 管理的主站是否自动起来，要看你是否已经在 VPS 上执行过 `pm2 startup`
- 用户 runtime Docker 容器不会在宿主机重启后全部自动起来
- 用户 runtime 容器会在用户再次访问时被系统按需启动

一句话总结就是：

`升级后机器会回来，主站能不能自动启动取决于 PM2 和系统服务配置，用户 runtime 容器会保留但不会全部自动启动。`

---

## 7. 按场景给你的建议

### 场景 A：还没有在线付费用户

这种情况下，直接原地从 `CX33` 升到 `CPX42` 是可以接受的。

原因是：

- 停机影响比较小
- 操作最简单
- 不需要先维护第二台机器

这是当前最省事的路径。

### 场景 B：已经有在线付费用户

这种情况下，不建议把原地 rescale 当成“无缝升级”。

更稳妥的方式是：

1. 新建一台 `CPX42`
2. 从 snapshot 或 backup 恢复
3. 在新机器上验证服务
4. 切换流量
5. 下线旧机器

这更接近真正意义上的平滑切换。

---

## 8. 你在升级前应该检查什么

至少先确认这几个：

```bash
systemctl is-enabled nginx
systemctl is-enabled docker
pm2 startup
```

另外建议再看一下：

```bash
pm2 save
pm2 list
docker ps -a
```

这些检查可以帮助你确认：

- 哪些服务具备开机自启
- 哪些部分升级后需要你手工拉起
- 升级完成后你要优先检查哪些东西

---

## 9. 短期建议

对你当前这个阶段，更实际的建议是：

- `CX33 -> CPX42` 可以作为短期扩容方案
- 但不要把它理解成零停机
- 如果已经有活跃付费用户，就按“有维护窗口的升级”来准备
- 如果你想让用户感知尽量小，就改成“新机器恢复后切流量”

同时，这应该被看作一个短期扩容动作，而不是最终架构。

更长期真正重要的方向仍然是：

- control plane 和 runtime 分离
- 多台 runtime host
- 用户固定绑定某一台 runtime host

---

## 10. 参考

- Hetzner Cloud FAQ
  - https://docs.hetzner.com/cloud/servers/faq
- Hetzner Cloud Cost-Optimized plans
  - https://www.hetzner.com/cloud/cost-optimized
- Hetzner Cloud Regular Performance plans
  - https://www.hetzner.com/cloud/regular-performance
- Hetzner Cloud changelog
  - https://docs.hetzner.cloud/changelog
- Hetzner Cloud API `change_type` mirror
  - https://github.com/olieidel/hcloud
- 本地实现参考
  - `scripts/deploy-online.sh`
  - `src/lib/myclawgo/docker-manager.ts`

