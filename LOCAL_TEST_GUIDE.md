# 本地测试指南

## ✅ npm link 已完成

你的 `opentest-ai` 已经通过 `npm link` 安装到本地，现在可以像全局安装的包一样使用！

## 🧪 测试命令

### 1. 基础命令测试

```bash
# 查看版本
opentest-ai --version
# ✅ 输出: 1.0.0

# 查看帮助
opentest-ai --help

# 系统健康检查
opentest-ai doctor
# ✅ 已验证：所有依赖正常
```

### 2. 配置命令测试

```bash
# LLM 配置向导
opentest-ai config

# 查看现有配置
opentest-ai config list

# 测试配置连接
opentest-ai config ping
```

### 3. 浏览器配置测试

```bash
# 查看浏览器状态
opentest-ai browser status

# 配置浏览器
opentest-ai browser setup

# 验证浏览器
opentest-ai browser verify

# 检测可用浏览器
opentest-ai browser detect
```

### 4. Web UI 测试 🌐

```bash
# 启动 Web UI（默认端口 30141）
opentest-ai web

# 自定义端口
opentest-ai web --port 8080

# 不自动打开浏览器
opentest-ai web --no-open

# 绑定到所有网卡（谨慎！）
opentest-ai web --hostname 0.0.0.0
```

**期望结果**：
- ✅ 自动安装 `@agegr/pi-web`（首次需要1-2分钟）
- ✅ 启动 Web UI 服务器
- ✅ 自动打开浏览器到 http://127.0.0.1:30141

### 5. Agent 运行测试

```bash
# 启动 Agent（交互模式）
opentest-ai run

# 在 Agent 中测试：
# - 输入 @ 查看自动补全
# - 输入 / 查看命令列表
# - Ctrl+C 退出

# 指定需求文档启动
opentest-ai run @/path/to/requirements.md
```

### 6. Neo4j 服务测试

```bash
# 启动 Neo4j
opentest-ai services up

# 查看日志
opentest-ai services logs

# 停止 Neo4j
opentest-ai services stop
```

## 📝 完整测试流程

### 场景1：配置并启动 Agent

```bash
# 1. 配置 LLM（一次性）
opentest-ai config
# 选择 openrouter，使用免费 deepseek/deepseek-r1:free

# 2. 配置浏览器（一次性）
opentest-ai browser setup
# 选择"使用系统浏览器"

# 3. 启动 Agent
opentest-ai run

# 4. 在 Agent 中测试
# @/path/to/requirements.md
```

### 场景2：启动 Web UI

```bash
# 1. 确保配置完成（如未配置会提示）
opentest-ai config list

# 2. 启动 Web UI
opentest-ai web

# 3. 在浏览器中
# - 打开工作区
# - 创建新会话
# - 配置模型
# - 浏览文件
```

### 场景3：录制测试

```bash
# 1. 启动 Agent
opentest-ai run

# 2. 指向需求文档
@/path/to/requirements.md

# 3. 执行工作流
/analyze    # 分析需求
/points     # 生成测试点
/cases      # 生成用例
/record     # 录制自动化（会打开浏览器）
```

## 🔧 测试三个命令别名

OpenTest 支持三个命令名：

```bash
# 方式1：主命令
opentest-ai --version

# 方式2：短命令
opentest --version

# 方式3：兼容命令
open-test --version

# 所有三个命令完全等价！
```

## 🐛 故障排除

### 问题1：命令找不到

```bash
# 检查 npm link 状态
npm list -g opentest-ai

# 重新 link
cd /Users/zephyrus/Documents/个人开发/open-test
npm link
```

### 问题2：Web UI 启动失败

```bash
# 检查端口占用
lsof -i :30141

# 使用其他端口
opentest-ai web --port 8080

# 检查错误日志
opentest-ai web --no-open 2>&1 | tee web-ui.log
```

### 问题3：Agent 启动失败

```bash
# 检查 LLM 配置
opentest-ai config list

# 重新配置
opentest-ai config

# 测试连接
opentest-ai config ping
```

### 问题4：pi-web 安装失败

```bash
# 手动安装
cd /Users/zephyrus/Documents/个人开发/open-test
npm install --no-save @agegr/pi-web@latest

# 或使用镜像
npm install --no-save @agegr/pi-web@latest --registry=https://registry.npmmirror.com
```

## 📊 测试检查清单

在发布到 npm 前，确保所有这些都能正常工作：

### 基础功能
- [ ] `opentest-ai --version` 显示 1.0.0
- [ ] `opentest-ai --help` 显示完整帮助
- [ ] `opentest-ai doctor` 通过健康检查
- [ ] 三个命令别名都能工作

### 配置功能
- [ ] `opentest-ai config` 向导正常
- [ ] `opentest-ai config list` 显示配置
- [ ] `opentest-ai config ping` 测试连接
- [ ] `opentest-ai browser setup` 配置浏览器

### 核心功能
- [ ] `opentest-ai run` 启动 Agent
- [ ] Agent 中 `@` 自动补全工作
- [ ] Agent 中 `/` 命令列表工作
- [ ] `opentest-ai web` 启动 Web UI
- [ ] Web UI 可以打开工作区
- [ ] Web UI 可以创建会话

### 服务功能
- [ ] `opentest-ai services up` 启动 Neo4j
- [ ] Neo4j 浏览器可以访问 http://127.0.0.1:7474
- [ ] `opentest-ai services stop` 停止服务

### 文档功能
- [ ] README.md 英文版正确
- [ ] README.zh.md 中文版正确
- [ ] 语言切换链接工作
- [ ] 所有内部链接有效

## 🧹 清理测试环境

测试完成后，如果需要清理：

```bash
# 取消 npm link
npm unlink -g opentest-ai

# 或者保留，等发布后再清理
# （本地开发时保持 link 很方便）
```

## 📦 准备发布

当所有测试通过后：

1. **提交最终代码**
   ```bash
   git add -A
   git commit -m "chore: ready for v1.0.0 release"
   git push origin main
   ```

2. **打标签**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. **发布到 npm**
   ```bash
   npm login
   npm publish
   ```

4. **验证发布**
   ```bash
   npm view opentest-ai
   npx opentest-ai@latest --version
   ```

## 🎉 本地测试完成！

如果上面的测试都通过了，说明包已经准备好发布到 npm 了！

---

**当前状态**：✅ npm link 已完成，可以开始测试！

```bash
# 现在就可以运行：
opentest-ai doctor
opentest-ai web
opentest-ai run
```
