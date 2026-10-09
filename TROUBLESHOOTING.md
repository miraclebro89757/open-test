# 🐛 故障排除指南

## 问题1：Web UI 报错 "developer is not one of ['system', 'assistant', 'user', 'tool', 'function']"

### 错误信息
```
Error: 400: {
  "code": "invalid_parameter_error",
  "message": "developer is not one of ['system', 'assistant', 'user', 'tool', 'function']",
  "param": null,
  "type": "invalid_request_error"
}
```

### 原因
pi-web 发送了一个 `"developer"` 角色的消息，但 OpenRouter/OpenAI API 不支持这个角色。

### 解决方案

#### ✅ 方案1：使用终端 Agent（推荐）

OpenTest 的终端 Agent 是原生支持，不会有兼容性问题：

```bash
# 停止 Web UI（Ctrl+C）

# 启动终端 Agent
opentest-ai run

# 在 Agent 中：
# - 输入 @ 指向需求文档
# - 输入 / 查看命令列表
# - 使用 /analyze、/points、/cases 等命令
```

**优势**：
- ✅ 稳定可靠，没有兼容性问题
- ✅ 完整支持所有功能
- ✅ 更快的响应速度
- ✅ 键盘快捷键支持

#### ✅ 方案2：等待 pi-web 更新

pi-web 是独立项目，可能需要更新以支持某些 LLM 提供商。

**跟踪问题**：
- pi-web Issues: https://github.com/agegr/pi-web/issues
- 搜索 "developer role" 或 "invalid_parameter_error"

#### ✅ 方案3：使用不同的 LLM 提供商

某些提供商可能对消息格式更宽容。尝试：

```bash
# 配置 Ollama（本地，无 API 限制）
brew install ollama
ollama serve
ollama pull deepseek-r1:14b

opentest-ai config
# 选择 Ollama

# 重启 Web UI
opentest-ai web
```

#### 🔍 方案4：检查 pi-web 配置

如果你必须使用 Web UI，可以尝试：

1. **清除 pi-web 缓存**
   ```bash
   rm -rf ~/.pi/agent/sessions/*
   ```

2. **使用兼容模式**
   
   创建 `~/.pi/agent/config.json`：
   ```json
   {
     "messageRoleMapping": {
       "developer": "system"
     }
   }
   ```

3. **重启 Web UI**
   ```bash
   opentest-ai web
   ```

---

## 问题2：Web UI 首次启动很慢

### 原因
首次运行需要下载 `@agegr/pi-web` 包（约 30-50MB）。

### 解决方案
```bash
# 手动预安装
npm install --no-save @agegr/pi-web@latest

# 或使用国内镜像
npm install --no-save @agegr/pi-web@latest --registry=https://registry.npmmirror.com

# 然后启动
opentest-ai web
```

---

## 问题3：端口被占用

### 错误信息
```
Error: listen EADDRINUSE: address already in use :::30141
```

### 解决方案

#### 选项1：使用其他端口
```bash
opentest-ai web --port 8080
```

#### 选项2：杀死占用进程
```bash
# 查找占用进程
lsof -i :30141

# 杀死进程（替换 PID）
kill -9 <PID>

# 重启
opentest-ai web
```

---

## 问题4：LLM 配置测试失败

### 错误信息
```
Error: Request failed with status code 401
```

### 解决方案

#### 1. 检查 API Key
```bash
opentest-ai config list
# 确保 API Key 不是 placeholder
```

#### 2. 验证 API Key
访问提供商网站验证密钥是否有效：
- OpenRouter: https://openrouter.ai/keys
- DeepSeek: https://platform.deepseek.com

#### 3. 重新配置
```bash
opentest-ai config
# 删除旧配置，重新添加
```

#### 4. 测试连接
```bash
opentest-ai config ping
```

---

## 问题5：浏览器录制失败

### 错误信息
```
Error: Browser not configured
```

### 解决方案

```bash
# 1. 配置浏览器
opentest-ai browser setup

# 2. 选择选项：
#    - 使用系统浏览器（推荐）
#    - 安装 Playwright Chromium
#    - 跳过（不录制）

# 3. 验证配置
opentest-ai browser verify

# 4. 查看状态
opentest-ai browser status
```

---

## 问题6：Neo4j 启动失败

### 错误信息
```
Error: Docker daemon is not running
```

### 解决方案

#### 1. 启动 Docker
```bash
# macOS
open /Applications/Docker.app

# 或检查 Docker 状态
docker ps
```

#### 2. 启动 Neo4j
```bash
opentest-ai services up
```

#### 3. 查看日志
```bash
opentest-ai services logs
```

---

## 问题7：命令找不到

### 错误信息
```
zsh: command not found: opentest-ai
```

### 解决方案

#### 如果使用 npm link
```bash
cd /Users/zephyrus/Documents/个人开发/open-test
npm link
```

#### 如果全局安装
```bash
npm install -g opentest-ai
```

#### 使用 npx（无需安装）
```bash
npx opentest-ai@latest run
```

---

## 问题8：测试失败

### 运行测试
```bash
cd /Users/zephyrus/Documents/个人开发/open-test
npm test
```

### 查看详细输出
```bash
npm test 2>&1 | tee test-output.log
```

---

## 🎯 推荐的工作流

### 日常使用（稳定）

```bash
# 1. 使用终端 Agent（推荐）
opentest-ai run

# 2. 在 Agent 中工作
@/path/to/requirements.md
/analyze
/points
/cases
/record
```

### 可视化管理（如果需要）

```bash
# 1. 查看生成的文件
cd ~/Desktop/projects/MyProduct/
ls -la

# 2. 使用任何编辑器打开
code .
# 或
vim cases/TC-001.md
```

### Web UI（实验性）

```bash
# 仅用于浏览和管理会话
opentest-ai web

# 核心工作仍使用终端 Agent
```

---

## 📞 获取帮助

### 1. 检查文档
- [README.md](README.md) - 英文文档
- [README.zh.md](README.zh.md) - 中文文档
- [Web UI Guide](docs/WEB_UI.md) - Web UI 指南
- [Quick Start](docs/QUICK_START.md) - 快速开始

### 2. 运行诊断
```bash
opentest-ai doctor
```

### 3. 查看日志
```bash
# Agent 日志
~/.opentest/logs/

# Web UI 日志
opentest-ai web --no-open 2>&1 | tee web-ui.log
```

### 4. 提交 Issue
https://github.com/miraclebro89757/open-test/issues

包含以下信息：
- 完整错误信息
- 操作系统版本
- Node 版本：`node --version`
- 配置信息：`opentest-ai config list`
- 诊断输出：`opentest-ai doctor`

---

## ✅ 快速诊断检查清单

运行这些命令检查系统状态：

```bash
# 1. 版本
opentest-ai --version

# 2. 系统健康
opentest-ai doctor

# 3. 配置状态
opentest-ai config list

# 4. 浏览器状态
opentest-ai browser status

# 5. 测试连接
opentest-ai config ping

# 6. 运行测试
cd /Users/zephyrus/Documents/个人开发/open-test
npm test
```

所有都通过 = ✅ 系统正常

---

## 🚀 建议

**对于稳定的生产使用**：

1. ✅ **使用终端 Agent** - `opentest-ai run`
2. ✅ **使用稳定的 LLM** - DeepSeek、OpenRouter
3. ✅ **本地浏览器** - 系统 Chrome/Edge
4. ✅ **可选 Neo4j** - 不是必需的

**Web UI 仅用于**：
- 浏览历史会话
- 查看文件树
- 快速浏览测试用例

**核心工作流仍建议使用终端 Agent**。
