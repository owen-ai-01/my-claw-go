# My Claw Go 项目诊断报告（2026-04-19）

## 1. 诊断范围
本次为仓库级健康检查，包含：
- 代码质量检查（Biome）
- 类型检查（TypeScript）
- 生产构建（Next.js build）
- 冗余与依赖清理检查（Knip）

## 2. 运行环境
- Node.js: `v22.22.0`
- pnpm: `10.30.3`
- 分支: `main`

## 3. 执行结果摘要

### 3.1 TypeScript
- 命令：`pnpm exec tsc --noEmit`
- 结果：通过

### 3.2 Production Build
- 命令：`pnpm build`
- 结果：通过
- 备注：构建可成功产出，核心编译链路可用。

### 3.3 Biome（全仓库）
- 命令：`pnpm exec biome check .`
- 结果：失败（217 errors）
- 关键原因：
  - 扫描到 `.runtime-data/**` 中权限受限文件，出现 `Permission denied` 内部错误
  - 同时混入运行态 JSON 文件的格式化提示，噪音较高
- 结论：`lint` 脚本当前范围过大，影响真实问题定位。

### 3.4 Biome（源码范围）
- 命令：`pnpm exec biome check src scripts`
- 结果：失败（181 errors）
- 主要类型：
  - format / organizeImports
  - a11y（如 button 缺少 `type`，video 缺少字幕 track）
  - style / complexity 建议项

### 3.5 Knip
- 命令：`pnpm knip`
- 结果：失败（大量冗余项）
- 关键统计：
  - Unused files: 245
  - Unused dependencies: 30
  - Unused devDependencies: 3
  - Unlisted dependencies: 2
  - Unlisted binaries: 2
  - Unused exports / types: 大量
- 结论：项目历史包袱较重，建议分阶段治理，避免一次性误删。

## 4. 高优先级问题（诊断结论）

1. 部署脚本依赖缺失
- `package.json` 定义了 `opennextjs-cloudflare` 与 `wrangler` 相关脚本。
- 实测 `pnpm exec wrangler --version`、`pnpm exec opennextjs-cloudflare --version` 均不可用（command not found）。
- 风险：Cloudflare 相关发布流程不可执行。

2. Lint 范围配置导致噪音失败
- `lint` 脚本为 `biome check --write .`，会扫描运行态目录。
- `.runtime-data/**` 未被 Biome 忽略，触发权限错误与无关格式提示。
- 风险：真实代码问题被噪音淹没，CI/本地质量门槛不稳定。

3. 可访问性问题存在确定性风险
- 多处按钮缺少 `type`（在 form 上下文可能误触发 submit）。
- `<video>` 缺少字幕轨道，a11y 不达标。

## 5. 已执行的后续动作（同一轮改造）
根据需求“该仓库不再保留 url-to-video 相关能力”，已完成整链路移除：
- 删除 `url-to-video / web-zu-video` 页面
- 删除相关 API（`/api/agent/url-to-video`、`/api/generate/url`、`/api/video/*`）
- 删除相关组件与 agent/cache/services 实现
- 清理路由常量中对应条目

## 6. 移除后验证
- `pnpm exec tsc --noEmit`: 通过
- `pnpm build`: 通过
- 说明：删除后项目仍可正常编译与构建。

## 7. 建议的下一步
1. 调整 Biome 作用范围（至少排除 `.runtime-data/**`）并将 `lint` 脚本限定到源码目录。
2. 补齐/修正部署工具链依赖（wrangler / opennextjs-cloudflare）或删除无效脚本。
3. 按模块分批处理 Knip 报告（先依赖，再未使用导出，最后未使用文件），每批都跑构建验证。
