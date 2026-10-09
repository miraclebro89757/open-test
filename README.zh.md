[English](README.md) | [中文](README.zh.md)

# Open-Test

一个终端测试 Agent，将需求文档转化为测试知识、测试点和可执行用例——然后录制真实浏览器会话并自动化它们。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/opentest-ai.svg)](https://www.npmjs.com/package/opentest-ai)

## 🎯 什么是 Open-Test？

用 `@` 指向需求文档。它会读取文档并在旁边的可见文件夹中生成：

- **需求知识** — 规则、状态和前置条件，存储为图谱
- **测试点** — 每个场景一个行为，供人工确认
- **功能用例** — 编号、优先级、分步骤，无需阅读代码即可执行
- **录制自动化** — 真实的 Playwright 脚本，通过点击沙箱环境捕获

这是一个终端 Agent，不是 Web 仪表板。你待在编辑器和终端；它在关键节点请求确认，从不编造结果。

## 🚀 快速开始

### 终端 Agent（快速）

```bash
# 1. 配置模型（一次性）
npx opentest-ai config

# 2. 配置浏览器环境（一次性）
npx opentest-ai browser setup

# 3. 在任意目录打开 agent
npx opentest-ai run

# 4. 指向需求文档
> @/path/to/your/requirements.md
```

### Web UI（可视化）

更喜欢浏览器界面？启动 Web UI：

```bash
# 启动 Web UI，地址 http://127.0.0.1:30141
npx opentest-ai web

# 或自定义端口和主机名
npx opentest-ai web --port 8080 --hostname 0.0.0.0
```

Web UI 提供：
- 📂 可视化文件浏览器和编辑器
- 🔄 所有项目的会话管理
- ⚙️ 图形化模型配置
- 🎯 实时 agent 交互
- 🌲 Git 集成和差异查看器

查看 [Web UI 指南](./docs/WEB_UI.md) 获取完整文档。

### 浏览器设置

首次运行时，OpenTest 会引导你完成浏览器环境设置，用于录制功能。三个选项：

1. **使用系统浏览器**（推荐）— 使用已安装的 Chrome/Edge/Chromium，无需下载
2. **安装 Playwright Chromium** — 下载专用测试浏览器（约 120MB）
3. **暂时跳过** — 使用其他功能但不录制

查看 [BROWSER_SETUP.md](BROWSER_SETUP.md) 获取详细配置指南。

`config` 是一个向导，无需查阅任何资料即可完成。它一次问一个问题，告诉你每一步该做什么：

1. **选择提供商** — 每个选项说明成本和适用人群
2. **粘贴密钥** — 向导打印要打开的确切页面、要点击的按钮，以及真实密钥的样子（`sk-or-v1-…`、`sk-…`）。Ollama 完全跳过此步骤
3. **名称、地址、模型** — 预填了提供商的默认值，按 Enter 始终是有效答案。只有 `custom` 提供商需要你输入
4. **保存位置** — `~/.opentest/config.json`（你的，从不提交）或 `./opentest.config.json`（项目的，可与团队共享）
5. **Ping** — 可选的实时检查，失败时告诉你该怎么做

粘贴的密钥在存储前会被清理：删除前导 `Bearer `、周围引号和多余空格，明显错误（截断的密钥、JSON blob、文档占位符）在提示时被拒绝并给出解释，而不是在请求时才失败。

无向导配置：

```bash
npx opentest-ai config set --provider deepseek --api-key sk-xxxx --model deepseek-chat
npx opentest-ai config ping      # 验证可以完成请求
npx opentest-ai config list      # 显示配置文件，密钥已脱敏
```

### 提供商

| 提供商 | 默认模型 | 说明 |
|---|---|---|
| `openrouter` | `deepseek/deepseek-r1:free` | 免费层，适合试用 |
| `deepseek` | `deepseek-chat` | 生产用例生成 |
| `cc-switch` | `claude-3-5-sonnet-20241022` | 企业聚合路由 |
| `ollama` | `deepseek-r1:14b` | 离线 / 隔离网，无需 API 密钥 |
| `custom` | — | 任何 OpenAI 兼容端点（需要 `--base-url` 和 `--model`）|

配置文件支持故障转移顺序，受限免费层可以回退到生产端点。查看 [配置](#配置)。

## 🔄 工作流程

九个步骤，每个步骤都有斜杠命令和快捷键。每一步都写入一个共享检查点，因此中断的运行会从停止的地方恢复。

| 命令 | 快捷键 | 产物 |
|---|---|---|
| `/status` | `Ctrl+Shift+0` | 所有任务的进度 |
| `/analyze` | `Ctrl+Shift+1` | `knowledge/`、`graph/` |
| `/points` | `Ctrl+Shift+2` | `test-points/` |
| `/cases` | `Ctrl+Shift+3` | `cases/` |
| `/record` | `Ctrl+Shift+4` | `automation/` |
| `/run` | `Ctrl+Shift+5` | 运行录制的脚本 |
| `/heal` | `Ctrl+Shift+6` | 审查选择器替换 |
| `/defects` | `Ctrl+Shift+7` | `defects/` |
| `/report` | `Ctrl+Shift+8` | `reports/` |

### 关卡

Agent 会故意在两个点停下来等待：

1. **测试点之后。** 在你确认测试点之前，它不会写功能用例。运行 `/points`，阅读它们，确认。
2. **录制之前。** 它不会猜测沙箱 URL。运行 `/record` 并给它要录制的环境的 `http`/`https` 地址。

它明确指示永远不做的两件事：编造通过率或缺陷数据，以及执行发布签字或变更影响分析。

### 录制和自愈

`/record` 询问沙箱 URL，然后打开 Playwright codegen 窗口。你按照用例执行场景；完成后关闭窗口。然后 Agent 将录制的 UI 文本映射回功能用例：匹配的用例翻转为 `- 自动化：是` 并记录脚本路径，未匹配的用例标记为 `- 自动化：否`。

录制有三种模式，在调用 `/record` 时选择：

| 模式 | 产物 |
|---|---|
| `ui+api`（默认）| Playwright 规范 **和** 从 HAR 生成的 pytest API 脚本 |
| `ui-only` | 仅 Playwright 规范 |
| `api-only` | 仅 pytest API 脚本 |

在 `ui+api` 中，HAR 会分析变量、请求依赖和密钥。配置了 LLM 配置文件时，分析由模型驱动；否则规则引擎产生相同结构，结果标记为 `source: "rules"`，因此你总是知道运行了哪个。凭据写入 `.env.example` 并从环境读取——永远不会硬编码到脚本中。

当选择器在 `/run` 期间失效时，Agent 立即调用 `heal_selector` 而不是停下来询问。前后版本都保留，当前文件使用替换版本以便运行完成。**你**用 `/heal` 决定保留哪个版本。

## 📁 文件存放位置

产物放在需求文档旁边的可见文件夹中，以产品命名。拒绝隐藏目录。

```
~/Desktop/projects/MyProduct_V1.1.3_Requirements.md   →   ~/Desktop/projects/MyProduct/
```

```
MyProduct/
├── knowledge/      规则、状态、前置条件、开放问题
├── graph/          需求图谱（index.md + 批次）
├── test-points/    测试点，每个场景一个行为
├── cases/          功能用例
├── automation/     录制的 Playwright 规范
├── defects/        禅道 / Jira
├── reports/        测试简报
└── tasks/          检查点和进度
```

同一文件夹中的同级产品各有自己的目录——ProductB 不会泄漏到 ProductA 中。

使用 `/project` 固定工作目录；之后，步骤写入那里。选择持久化在 `~/.opentest/project.json` 以及你最近的目录中。

选择器首先列出你最近的目录。在 macOS 上，它还提供 **📁 浏览本机文件夹...**，打开原生 Finder 文件夹选择器并从当前项目开始。关闭对话框而不选择会保持项目不变；如果对话框无法打开，它会回退到键入输入。其他平台获得最近条目加键入输入。

## 🧠 切换模型

多次运行 `open-test config`，它会在触碰任何东西之前询问你的意思：

- **添加另一个配置文件** — 保留现有的，因此你可以同时持有免费层和生产端点
- **替换现有配置文件** — 选择哪一个，保持其提供商预选，如果你只想更改模型或地址，则重用磁盘上已有的密钥。密钥轮换只询问新密钥

在 Agent 内部，切换是 Pi 的工作，因此它的行为类似于 Pi 自己的控件并保持对话完整：

| | |
|---|---|
| `/model` | 从列表中选择任何配置的配置文件 |
| `Ctrl+P` / `Shift+Ctrl+P` | 向前 / 向后循环 |
| `/task-model` | 将*任务类型*固定到配置文件（OpenTest 的补充）|

无需重启，也不会丢失上下文——会话使用新模型继续。在 Agent 已经运行时添加配置文件是唯一的例外：启动后写入的配置文件还不在 Pi 的注册表中，因此在重启后切换到它。

### 不同任务使用不同模型

测试阶段有不同的需求：需求分析和缺陷分析需要推理深度，用例生成是批量结构化输出，报告是摘要。分别固定它们：

```
/task-model 需求分析 team-deepseek      # 强大的模型用于分析
/task-model 用例生成 free-openrouter     # 便宜的模型用于批量
```

路由在每个步骤运行前自动应用，`/task-model 需求分析` 不带配置文件清除固定。映射存储在配置文件中的 `task_models` 下，因此它们会在重启后保留。

### 密钥存放位置

密钥直接写入本地文件，从不通过模型传输：

| | |
|---|---|
| 存储在 | `~/.opentest/config.json` 或 `./opentest.config.json`，以模式 `0600` 写入 |
| 作为 | 每个配置文件的环境变量（`OPENTEST_KEY_<PROFILE>`）传递给 Pi，从 `models.json` 引用为 `$OPENTEST_KEY_<PROFILE>` |
| 使用方 | 提供商作为 HTTP `Authorization` 头 |
| 永不 | 放入提示、消息、工具结果、`models.json` 或进程命令行 |
| 向你显示为 | `sk-3d9…0a2d` — `open-test config list` 和每个选择器仅渲染掩码 |

每个配置的配置文件都获得自己的 Pi 提供商（`opentest-<profile>`），因此它可以独立认证——同一主机上的免费层和付费端点保持可单独切换。`open-test config` 直接读写文件；它不要求模型为你存储任何东西。

## 🧠 需求图谱

测试点是针对图谱编写的，而不是针对原始文档。Agent 分批存储图谱（每次调用最多 20 个节点 / 20 个关系），因此长文档保持可处理，并在编写用例前查询它：

- `store_requirement_graph` — 写入批次（第一批使用 `replace`，之后使用 `append`）
- `query_requirement_graph` — 读取特性的前置条件、规则和状态

图谱在 Neo4j 运行时进入 Neo4j，在不运行时保留在 `graph/` 中。如果图谱没有到达 Neo4j，Agent 不会声称它到达了。

```bash
npx opentest-ai services up      # 启动捆绑的 Neo4j（Docker）
npx opentest-ai services logs
npx opentest-ai services stop
```

这会将随机密码写入 `~/.opentest/services.json`（模式 `0600`）并仅绑定到回环——Bolt 在 `127.0.0.1:7687`，浏览器在 `http://127.0.0.1:7474`。如果 Docker Hub 超时，它会自动从镜像重试。

## 🧰 命令

```
opentest-ai run [prompt...]        打开 agent（与 `agent` 相同）
opentest-ai agent [prompt...]      打开 agent
  --print                          运行一轮并退出（用于脚本）
  --skip-browser-setup             跳过浏览器设置检查

opentest-ai web                    启动 Web UI（浏览器界面）
  -p, --port <port>                服务器端口（默认：30141）
  -H, --hostname <hostname>        绑定主机名（默认：127.0.0.1）
  --no-open                        不自动打开浏览器

opentest-ai browser setup          配置浏览器环境
  --force                          强制重新配置
opentest-ai browser status         显示浏览器配置
opentest-ai browser verify         验证浏览器工作
opentest-ai browser detect         检测可用浏览器
opentest-ai browser reset          重置浏览器配置

opentest-ai config                 交互式提供商向导
opentest-ai config set             写入一个提供商配置文件
opentest-ai config use <profile>   切换活动配置文件
opentest-ai config ping            检查活动配置文件是否可以服务请求
opentest-ai config list            显示配置文件，密钥已脱敏

opentest-ai services [up|stop|logs]   捆绑的本地 Neo4j

opentest-ai install                检查并安装主机依赖项
opentest-ai doctor                 依赖项和更新健康检查
opentest-ai update                 检查 npm 获取更新版本
```

### Agent 内部

`@path/to/doc.md` 指向任何文档，绝对路径可以。`/` 列出提示。`Ctrl+C` 退出。

内置分析模板是 `/prd-analysis`，它是**只读的**。自定义模板放在 `~/.opentest/pi-agent/prompts/` 中，可用 `/` 选择。

## ⚙️ 配置

### LLM 配置文件

层按此顺序合并，每个覆盖上一个：覆盖 → 项目 `./opentest.config.json` → 用户 `~/.opentest/config.json` → 环境 → 内置预设。查看 [`opentest.config.example.json`](opentest.config.example.json) 和 [`schemas/llm-config.schema.json`](schemas/llm-config.schema.json) 中的架构。

| 变量 | 用途 |
|---|---|
| `OPENTEST_CONFIG` | 使用 `./opentest.config.json` 以外路径的配置文件 |
| `OPENTEST_PROFILE` | 活动配置文件名称 |
| `OPENTEST_PROVIDER` | `openrouter` \| `deepseek` \| `cc-switch` \| `ollama` \| `custom` |
| `OPENTEST_BASE_URL` | OpenAI 兼容的基础 URL |
| `OPENTEST_MODEL` | 模型 ID |
| `OPENTEST_API_KEY` | API 密钥（由 CLI 从配置/环境读取；agent 进程将其作为每个配置文件的 `OPENTEST_KEY_*` 变量接收）|
| `OPENAI_API_KEY` | 遗留回退——仅在没有预设匹配时才到达；默认为 `api.openai.com` 上的 `gpt-4o-mini` |

配置文件还可以携带 `task_models`，将任务映射到配置文件：

```json
{
  "task_models": {
    "requirementAnalysis": "team-deepseek",
    "bugAnalysis": "team-deepseek",
    "testCaseGeneration": "free-openrouter",
    "reportGeneration": "free-openrouter"
  }
}
```

### 缺陷跟踪器

`/defects` 从你配置的任何一个读取。未设置时，它会说明缺少什么，而不是编造缺陷。

```bash
# 禅道
export ZENTAO_BASE_URL=https://your-zentao.example.com
export ZENTAO_TOKEN=xxxx

# Jira
export JIRA_BASE_URL=https://your-jira.example.com
export JIRA_EMAIL=you@example.com
export JIRA_TOKEN=xxxx
export JIRA_JQL="ORDER BY updated DESC"   # 可选
```

### 其他

| 变量 | 用途 |
|---|---|
| `OPENTEST_CWD` | 覆盖 agent 看到的工作目录 |
| `OPENTEST_HOME` | 覆盖 `~/.opentest` |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | 指向现有的 Neo4j 而不是捆绑的 |

完整列表在 [`.env.example`](.env.example) 中。API 密钥永远不会写入用例文件、自动化脚本或报告，Agent 也不会打印它们。

## 🛠️ 开发

```bash
npm test
```

测试套件在 `node --test` 上针对 glob 运行，因此新的 `*.test.js` 文件会自动被拾取。它涵盖 LLM 配置解析和故障转移、agent 启动、每个注册的工具、需求图谱存储和批处理、检查点恢复、命令门控、录制/标记、HAR 分析和 pytest 渲染，以及本地 Neo4j 启动。共 189 个测试。

Playwright 固定在 `1.63.0`，因此录制使用与安装的 Chromium 匹配的浏览器。不要浮动此版本——codegen 输出必须与重放保持兼容。

### 仓库布局

```
open-test/
├── cli/               agent：命令、工具、图谱、检查点、LLM 配置
├── .pi/skills/        agent 加载的 QA 技能
├── schemas/           llm-config.schema.json
└── opentest.config.example.json
```

早期的微服务架构（Go API、React 前端、Rust 工作池 / 语义引擎 / 事件总线、Python agent 服务）已被移除。`cli/services/compose.yml` 是唯一的 Compose 文件，它只运行捆绑的 Neo4j。

## 📄 许可证

MIT — 查看 [LICENSE](LICENSE)。
