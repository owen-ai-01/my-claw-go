# Bridge 发布与发布后同步流程

日期：2026-03-15

## 目标
将 bridge 做成宿主机统一版本管理，通过 `releases/current` 软链接挂载到用户 runtime 容器中，避免每次 bridge 更新都重建整张 runtime 镜像。

## 宿主机目录

```text
/home/openclaw/myclawgo-bridge/
  releases/
    <timestamp>/
      package.json
      pnpm-lock.yaml
      dist/
      node_modules/
  current -> /home/openclaw/myclawgo-bridge/releases/<timestamp>
```

## 容器侧挂载与启动
- runtime 容器挂载：
  - `/home/openclaw/myclawgo-bridge:/opt/myclawgo-bridge:ro`
- entrypoint 从以下路径启动 bridge：
  - `/opt/myclawgo-bridge/current/dist/server.js`

## 发布脚本
仓库位置：
- `scripts/publish-bridge-release.sh`
- `scripts/restart-runtime-containers.sh`
- `scripts/publish-and-rollout-bridge.sh`

### 发布新 bridge release
```bash
bash scripts/publish-bridge-release.sh
```

### 发布并重启所有 runtime 容器
```bash
bash scripts/publish-and-rollout-bridge.sh
```

### 只重启 runtime 容器
```bash
bash scripts/restart-runtime-containers.sh
```

## 说明
- bridge 更新后，已运行容器不会自动热切换，需要重启容器（或至少重启 bridge 进程）。
- runtime 基础镜像仍保留 OpenClaw、Node、常用命令和 entrypoint；bridge 版本通过宿主机 releases/current 统一分发。
- 后续生产上线时，测试环境验证通过后，可直接用上述脚本在生产发布 bridge。
