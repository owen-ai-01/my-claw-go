# 生产环境健康检查报告

**日期：** 2026-04-12  
**检查范围：** myclawgo.com 全站上线前评估  

---

## 一、整体结论

**推广无阻碍。** 核心功能（聊天、Agent、Group、支付、Telegram 绑定）运行正常，生产服务在线，无影响用户的关键 bug。

---

## 二、已修复问题

### 2.1 聊天框头像与列表头像不一致
- **问题：** 聊天消息气泡、顶部 Header、Typing indicator 只显示 emoji，不显示真实头像图片
- **根因：** `chat-shell.tsx` 消息渲染处只调用了 `agentEmoji()`，未读取 `identity.avatar`
- **修复：** 三处均改为优先显示图片，无图片时回退 emoji
- **Commit：** `6d6f84f`

### 2.2 新用户容器使用旧版 openclaw 镜像
- **问题：** `docker-manager.ts` 硬编码默认镜像为 `myclawgo-openclaw:2026.3.13`
- **根因：** 之前的本地修改未提交，被 deploy 时的 `git reset --hard` 还原
- **修复：** 正确提交为 `2026.4.11`，后续新建容器自动使用新版
- **Commit：** `125aea5`

### 2.3 现有容器 openclaw 版本升级
- **测试容器** `myclawgo-test-*`：已从 2026.3.13 升级到 2026.4.11
- **生产容器** `myclawgo-chmL*`：已从 2026.3.13 升级到 2026.4.11
- **Docker 镜像** `myclawgo-openclaw:2026.4.11`：已构建完成

### 2.4 服务器无 Swap 导致 OOM
- **问题：** 机器无 swap，build 时 TypeScript 检查阶段内存峰值被 OOM killer 杀死
- **修复：** 已添加 4GB swap 文件并写入 `/etc/fstab` 持久化
- **当前状态：** Swap 4.0Gi / Used 0B / Free 4.0Gi

---

## 三、存量问题评估

### 3.1 一个老用户 Stripe priceId 对不上（低优先级）
- **现象：** 日志出现 `subscription plan NOT found for priceId: price_1T7FVSBb5VJkJBiBfvE9jdPB`
- **影响：** 仅影响该一个账号的套餐显示，不影响新用户
- **建议：** 确认该账号是否真实用户，如是则在 Stripe 后台将其迁移到当前价格计划

### 3.2 chat-proxy 偶发重启（低优先级）
- **现象：** `my-claw-go-chat-proxy` 8 天内重启 10 次（约每天 1 次）
- **根因：** 遇到已删除的旧容器时 WebSocket 连接异常退出
- **影响：** 重启耗时约 2 秒，用户感知不明显，当前运行正常
- **建议：** 后续在 `chat-gateway-proxy.ts` 增加异常捕获，避免单个连接失败导致进程退出

---

## 四、误报项（非真实问题）

| 现象 | 实际原因 | 结论 |
|------|----------|------|
| Server Action "w" / "4" 找不到 | 浏览器缓存了旧 JS，用户刷新后自动消失 | 不处理 |
| WebSocket ECONNREFUSED | 指向已删除的旧容器 IP，正常生命周期 | 不处理 |
| 若干 489B 的旧 SVG 文件 | 旧占位文件，新头像预设配置不引用，不展示 | 不处理 |
| `/api/health` 返回 404 | 项目无此接口，监控用 postverify 脚本代替 | 不处理 |

---

## 五、当前服务状态

```
PM2 进程
  my-claw-go-online       online  port 3021
  my-claw-go-chat-proxy   online  port 3020 (ws)
  my-claw-go-test         online  port 3010

Docker 容器
  myclawgo-chmL*          Up 3 weeks  (生产用户容器)
  myclawgo-test-*         Up 2 weeks  (测试容器)

Nginx upstream           127.0.0.1:3021
TLS / 公网               https://myclawgo.com → HTTP 200

内存                     7.6Gi RAM + 4.0Gi Swap
```

---

## 六、上线自动化

已建立一键部署 skill `/deploy-prod`，流程：

1. **Precheck** — nginx、PM2、upstream 健康检查
2. **Commit & Push** — 展示变更、确认 commit message、推送 GitHub
3. **蓝绿部署** — 新实例起来 → 健康检查 → 切换 nginx → 删旧实例
4. **Post-verify** — 本地 upstream + 公网 + PM2 状态 + 日志扫描
5. **自动回滚** — 任何步骤失败触发 ERR trap，还原 nginx upstream

部署日志保存至 `logs/deploy-<timestamp>.log`。
