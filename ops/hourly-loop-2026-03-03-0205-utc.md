# MyClawGo 每小时自治闭环记录（UTC 2026-03-03 02:05）

## 审计执行汇总

### 1) 产品审计（jinpin维度）
**P0问题（紧急）：**
1. 产品定位与文案混线（OpenClaw vs 视频生成）- 核心定位不一致
2. 价格与权益数字不一致 - 支付信任风险
3. 注册入口潜在"无密码注册"风险 - 用户体验问题
4. guard未登录重定向路径错误（/login → /auth/login）- 关键路径中断

**P1问题（重要改进）：**
1. 登录后默认页"空心化"，激活路径不直达
2. 付费后状态页反馈弱，失败恢复路径不足
3. 低余额拦截在bot页才出现，阻力前置不足
4. 文案语气偏技术说明，缺少"结果导向"

### 2) 技术审计（jinma维度）
**高风险问题：**
1. 未鉴权创建运行时容器 - 可被滥用刷容器（R1）
2. Replicate webhook未验签 + userId可伪造 - 积分安全漏洞（R2）
3. 积分扣减/发放非原子 - 并发竞态风险（R3）
4. 镜像构建会打包.env - 密钥泄露风险（R4）
5. 容器隔离弱 - 安全与稳定性风险（R5）

**性能瓶颈：**
1. 积分FIFO扣减逐条update，N次往返
2. 月度判断用EXTRACT函数，索引命中差
3. 中间件每请求远程取session + 大量console.log
4. 冷启动重（容器内apt安装）

## 最终决策与实施

**选择执行2项高价值改动：**

### 1. 修复.dockerignore以防止密钥泄露（技术审计R4）
- **问题**：`.dockerignore`未忽略`.env*`等敏感文件，构建时可能打包密钥
- **改动**：在`.dockerignore`中添加`.env*`、`*.pem`、`*.key`、`*.crt`、`*.secret`、`secrets/`
- **价值**：防止生产环境密钥泄露，安全合规

### 2. 修复guard重定向路径错误（产品审计P0-4）
- **问题**：`/api/runtime/[sessionId]/guard`返回`redirectTo: '/login'`，实际登录路由为`/auth/login`
- **改动**：将重定向路径从`'/login'`改为`'/auth/login'`
- **价值**：修复关键用户路径，避免404/错误跳转

**决策原因：**
1. 两项均为安全/用户体验关键问题
2. 改动面小，可快速验证和回滚
3. 不改支付/鉴权密钥，符合约束
4. 不涉及破坏性数据操作
5. 保持"用户命令只在用户容器执行"原则

## 实施详情

### 改动点1: `.dockerignore`
```diff
+.env*
+*.pem
+*.key
+*.crt
+*.secret
+secrets/
```

### 改动点2: `src/app/api/runtime/[sessionId]/guard/route.ts`
```diff
-      redirectTo: '/login',
+      redirectTo: '/auth/login',
```

## 最小验证结果

1. **语法检查**：
   - `npx biome check src/app/api/runtime/[sessionId]/guard/route.ts` ✅ 通过
   - `.dockerignore`格式正确 ✅

2. **构建验证**：
   - 需后续完整构建验证

## 回滚点

1. **.dockerignore**：
   ```bash
   git checkout HEAD -- .dockerignore
   ```

2. **guard路由**：
   ```bash
   git checkout HEAD -- src/app/api/runtime/[sessionId]/guard/route.ts
   ```

## 下一轮观察指标

1. **安全指标**：
   - 镜像构建日志中是否出现.env文件警告
   - 容器创建成功率与异常率

2. **用户体验指标**：
   - guard重定向成功率（登录流程完成率）
   - 用户从未认证到登录的转化率变化

3. **技术债务**：
   - 剩余P0/P1问题数量
   - 高风险安全问题解决进度

## 后续优先级建议

**下一轮应优先处理：**
1. **产品定位文案统一**（P0-1）- 核心品牌一致性
2. **积分扣减事务化**（R3）- 数据一致性关键
3. **Replicate webhook验签**（R2）- 支付安全

**注意**：产品定位问题需要深入分析项目实际功能（MyClawGo vs 视频生成）后再进行系统化修改。

---
*执行时间：UTC 2026-03-03 02:05-02:15*  
*总负责协调代理：MyClawGo自主产品循环*