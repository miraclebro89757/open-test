# OpenTest Web UI

OpenTest 集成了 [pi-web](https://github.com/agegr/pi-web) 作为浏览器界面，提供完整的可视化测试管理体验。

## ✨ 主要功能

### 会话管理
- **浏览会话**：查看所有测试会话，按项目分组
- **恢复对话**：继续之前的测试任务
- **创建分支**：从任意消息点创建新会话
- **实时流式**：实时查看 Agent 输出

### 文件浏览
- **项目文件树**：Material Icon 主题，支持搜索
- **文件预览**：支持源码、Markdown、图片、音频、PDF、DOCX
- **在线编辑**：直接在浏览器中编辑文本文件
- **文件上传**：拖拽上传测试资源

### Git 集成
- **状态查看**：工作区状态、文件装饰
- **提交历史**：查看完整提交记录
- **差异对比**：查看单个提交详情
- **工作树切换**：支持 Git worktree

### 模型配置
- **可视化配置**：无需命令行配置 LLM
- **API Key 管理**：安全存储密钥
- **OAuth 登录**：支持 Claude/Codex/Copilot
- **模型测试**：测试模型连接

### 其他特性
- **命令执行**：在选定工作区运行 Shell 命令
- **语音支持**：朗读响应、Whisper 语音转文字
- **通知集成**：Discord/Telegram 完成通知
- **多语言界面**：中文、英文、日语等

## 🚀 快速开始

### 启动 Web UI

```bash
# 方式1：使用默认配置（推荐）
npx opentest-ai web

# 方式2：自定义端口和主机
npx opentest-ai web --port 8080 --hostname 0.0.0.0

# 方式3：不自动打开浏览器
npx opentest-ai web --no-open
```

启动后访问：`http://127.0.0.1:30141`

### 首次使用

1. **配置模型**（如果未配置）
   - Web UI 启动后会提示
   - 点击 **Models** 面板
   - 添加 API Key 或使用 OAuth 登录

2. **选择工作区**
   - 点击 **Open Workspace**
   - 选择包含需求文档的目录

3. **开始测试**
   - 在聊天框输入 `@requirements.md`
   - Agent 会分析需求并生成测试用例

## ⚙️ 配置选项

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-p, --port <port>` | 服务器端口 | `30141` |
| `-H, --hostname <host>` | 绑定主机名 | `127.0.0.1` |
| `--no-open` | 不自动打开浏览器 | 自动打开 |

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口（被 `--port` 覆盖） | `30141` |
| `PI_WEB_HOSTNAME` | 绑定主机名（被 `--hostname` 覆盖） | `127.0.0.1` |
| `PI_WEB_NO_OPEN` | 设为 `1` 禁止自动打开浏览器 | 未设置 |
| `PI_WEB_PASSWORD` | 启用密码保护（远程访问必需） | 未设置 |
| `PI_WEB_SKIP_VERSION_CHECK` | 设为 `1` 禁用版本检查 | 未设置 |
| `PI_WEB_IDLE_TIMEOUT_MS` | 会话空闲超时（毫秒） | `600000` (10分钟) |
| `PI_CODING_AGENT_DIR` | pi agent 数据目录 | `~/.pi/agent` |
| `OPENTEST_HOME` | OpenTest 配置目录 | `~/.opentest` |

### 示例配置

```bash
# 自定义端口和主机
npx opentest-ai web --port 8080 --hostname 0.0.0.0

# 使用环境变量
PORT=8080 PI_WEB_HOSTNAME=0.0.0.0 npx opentest-ai web

# 禁止自动打开浏览器
npx opentest-ai web --no-open

# 密码保护（远程访问）
PI_WEB_PASSWORD='your-secure-password' npx opentest-ai web --hostname 0.0.0.0
```

## 🌐 远程访问

### 局域网访问

在受信任的局域网中，需要设置密码保护：

```bash
PI_WEB_PASSWORD='a-long-random-password' npx opentest-ai web --hostname 0.0.0.0
```

访问地址：`http://<你的IP>:30141`

### 安全建议

⚠️ **重要**：密码认证不加密连接

- **不要**通过普通 HTTP 暴露到互联网
- **使用** HTTPS 反向代理（Nginx、Caddy）
- **或者使用** VPN 隧道（WireGuard、Tailscale）

### 反向代理示例（Nginx）

```nginx
server {
    listen 443 ssl;
    server_name opentest.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:30141;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket 支持
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

## 🔄 与终端 Agent 对比

| 特性 | 终端 Agent | Web UI |
|------|-----------|--------|
| **启动命令** | `npx opentest-ai run` | `npx opentest-ai web` |
| **界面** | 终端文本 | 浏览器图形界面 |
| **文件浏览** | 命令行 | 可视化文件树 |
| **会话管理** | 当前会话 | 所有会话可视化 |
| **配置管理** | 命令行向导 | 图形化面板 |
| **多会话** | 不支持 | 支持多标签 |
| **适用场景** | 快速测试、CI/CD | 日常开发、团队协作 |

## 📊 使用场景

### 场景1：需求分析和测试设计

```bash
# 启动 Web UI
npx opentest-ai web

# 在浏览器中：
# 1. 打开包含需求文档的工作区
# 2. 输入: @requirements.md
# 3. 在文件浏览器中实时查看生成的测试用例
# 4. 使用文件编辑器调整测试点
```

### 场景2：多项目管理

```bash
# Web UI 支持快速切换工作区
# 在浏览器中：
# 1. 侧边栏显示所有项目
# 2. 点击切换不同项目
# 3. 每个项目的会话独立管理
```

### 场景3：团队协作

```bash
# 在服务器上运行 Web UI
PI_WEB_PASSWORD='team-password' npx opentest-ai web --hostname 0.0.0.0

# 团队成员通过浏览器访问
# - 查看测试用例生成进度
# - 审查 AI 生成的测试脚本
# - 共享配置和会话
```

### 场景4：录制和调试

```bash
# 使用 Web UI 的命令执行功能
# 1. 在浏览器中打开测试项目
# 2. 使用内置终端执行: /record
# 3. 在文件浏览器中查看生成的 Playwright 脚本
# 4. 直接编辑和调试脚本
```

## 🛠️ 技术实现

### 架构

```
┌─────────────────────────────────────────┐
│         OpenTest CLI (Node.js)          │
│  ┌────────────────────────────────────┐ │
│  │    open-test web 命令               │ │
│  │  - 安装 @agegr/pi-web              │ │
│  │  - 配置环境变量                     │ │
│  │  - 启动 pi-web 进程                │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│        pi-web (Next.js + Node.js)       │
│  ┌────────────────────────────────────┐ │
│  │  前端 (React + Next.js)            │ │
│  │  - 会话 UI                         │ │
│  │  - 文件浏览器                       │ │
│  │  - 编辑器                          │ │
│  │  - Git 视图                        │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │  后端 (Next.js API Routes)        │ │
│  │  - 会话管理                        │ │
│  │  - 文件操作                        │ │
│  │  - Git 集成                        │ │
│  │  - Agent 通信                      │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│    Pi Coding Agent (@earendil-works)    │
│  - LLM 调用                             │
│  - 工具执行                             │
│  - 会话持久化                           │
└─────────────────────────────────────────┘
```

### 集成点

1. **配置共享**
   - Web UI 读取 `~/.opentest/config.json`
   - OpenTest 和 pi-web 使用相同的 LLM 配置

2. **会话共享**
   - 会话文件存储在 `~/.pi/agent/sessions/`
   - 终端和 Web UI 可以互相访问会话

3. **环境变量**
   - OpenTest 设置 `PI_CODING_AGENT_DIR` 指向自己的配置
   - Neo4j 连接信息通过环境变量传递

## 🐛 故障排除

### Web UI 无法启动

```bash
# 检查端口是否被占用
lsof -i :30141

# 使用其他端口
npx opentest-ai web --port 8080
```

### 无法连接到 Agent

```bash
# 检查 LLM 配置
npx opentest-ai config list

# 重新配置
npx opentest-ai config
```

### 文件浏览器显示空白

```bash
# 确保工作区路径正确
# 在 Web UI 中重新选择工作区
```

### 会话加载失败

```bash
# 检查会话文件权限
ls -la ~/.pi/agent/sessions/

# 确保文件可读
chmod -R 755 ~/.pi/agent/sessions/
```

## 📚 参考资源

- [pi-web 官方文档](https://github.com/agegr/pi-web)
- [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent)
- [OpenTest 配置指南](./LLM_CONFIGURATION.md)
- [快速开始](./QUICK_START.md)

## 🔄 更新 pi-web

pi-web 作为依赖按需安装，更新方法：

```bash
# 首次运行自动安装最新版
npx opentest-ai web

# 如果需要强制重装
rm -rf node_modules/@agegr/pi-web
npx opentest-ai web

# 或使用 npm 全局安装
npm install -g @agegr/pi-web@latest
pi-web
```

## 💡 最佳实践

1. **开发阶段**：使用 Web UI 进行需求分析和测试设计
2. **调试阶段**：使用 Web UI 的文件编辑器快速修改测试脚本
3. **CI/CD**：使用终端 Agent（`npx opentest-ai run`）集成到自动化流程
4. **团队协作**：在服务器上运行 Web UI，团队共享访问
5. **安全访问**：远程访问务必使用 HTTPS 反向代理或 VPN

## 🎯 下一步

- [了解 Explore 模式](./EXPLORE_AND_GENERATE.md)
- [配置录制模式](../RECORDING_MODES.md)
- [查看完整工作流](./QUICK_START.md)
