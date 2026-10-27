[English](README.md) | [中文](README.zh.md)

# Open-Test

一个测试 Agent：把需求文档写成测试知识、测试点和可执行用例，再按这些用例录制真实的浏览器会话。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/opentest-ai.svg)](https://www.npmjs.com/package/opentest-ai)

同一个 Agent 跑在终端里，也跑在 Web UI 里。Web UI 是 Pi Web 的界面加上测试工作台。录制、在共享环境执行、以及应用版本演进基线，都会先等你明确同意。通过率和缺陷只来自它真正读到的文件。

需要 Node.js `>=22.19.0`。录制和回放使用仓库里固定的 Playwright `1.63.0`。

## 它写什么

用 `@` 指向需求文档，或给一个钉钉文档链接。产物进一个看得见的产品目录：

- **需求知识** — 规则、状态、前置条件、待澄清，以及一张图谱
- **测试点** — 一个场景里的一个行为，每条都留给人确认
- **功能用例** — 换行编号的步骤，一条只验证一件事，不看代码也能执行
- **UI 采集** — 登录一次后按用例把 Playwright 操作写到 `recordings/`。这不是可执行脚本。

钉钉链接会先冻结成 `knowledge/source-pack/`，之后的分析只读这份源包。某一节有图时，要先用当时有效的图地址把图读完，才写这一节的图谱。图和正文不一致时，两边都留下，并写成待澄清。

## 快速开始

### 终端

```bash
npx opentest-ai install         # 有本机 Chrome 就用它，没有再下载 Playwright Chromium
npx opentest-ai run             # 做同样的检查，再打开 Agent

> @/path/to/your/requirements.md
```

`opentest-ai`、`open-test`、`opentest` 是同一个程序。在终端里直接运行会打开 Agent，并且不检查浏览器。`run` 会检查：本机装了 Chrome 就用它，没有才下载 Playwright Chromium。`agent` 和 `run` 都接受 `--print`，跑一轮就退出。只有 `run` 接受 `--skip-browser-setup`。

### Web UI 和测试工作台

在本仓库的检出目录里：

```bash
npm install
npm run dev
# http://127.0.0.1:30141
```

`npx opentest-ai web` 启动同一个应用（`--port`、`--hostname`、`--no-open`）。默认绑定 `127.0.0.1:30141`。没有生产构建时走 `next dev`。

在左侧打开一个项目目录。这个目录就是产品工作目录，`knowledge/`、`cases/` 等都直接写在里面。终端不一样：产物写在需求文档旁边、以产品名命名的文件夹里。

右侧的 **测试工作台** 跟着流水线走：需求、测试点、用例、录制、执行、缺陷、报告。旁边还有总览、待审核、审核经验、版本演进、图谱、自动化脚本和选择器自愈。

**设置 → 常规 → 语言** 是 English、简体中文或繁體中文。选择存在 `pi-locale` 里，工作台界面跟着变。用例文件、写进文件的状态，以及发给模型的文字，保持中文。

设置 `OPENTEST_QA=0` 可以让 Web 会话不加载这套测试流程。

## 模型

模型只有一份配置。Web 的 **模型** 页写入，终端 Agent 读取。位置是 Pi 的 Agent 目录：`~/.pi/agent/`，或者你自己设置的 `PI_CODING_AGENT_DIR`。启动器不会写 `models.json`，不会传 `--model`，也不会替你设置 `PI_CODING_AGENT_DIR`。

Agent 已经打开时，切换用的是 Pi 自己的控件，对话还在：

| | |
|---|---|
| `/model` | 选择 Pi 认识的模型 |
| `Ctrl+P` / `Shift+Ctrl+P` | 向前 / 向后切换 |
| `/login` | 登录订阅制提供商 |

直接调用模型的工具（智能探索，以及真正跑到 HAR 分析的那条路径）用的是同一个默认模型。密钥如果写成 shell 命令（`!cmd`），就留给 Pi；这些工具会改用规则，并写成 `source: "rules"`。模型给出的结果是 `source: "ai"`。

`opentest-ai config` 仍会打开旧的配置向导，写入 `~/.opentest/config.json`。它会先打印警告，而且不会改变 Agent 使用的模型。没有 `/task-model` 命令。

## 工作流程

十个步骤命令。终端里每个命令还有快捷键。Web UI 不注册这些快捷键，用工作台或直接输入命令。

| 命令 | 快捷键 | 写入 |
|---|---|---|
| `/status` | `Ctrl+Shift+0` | 读取 `tasks/` |
| `/analyze` | `Ctrl+Shift+1` | `knowledge/`、`graph/` |
| `/points` | `Ctrl+Shift+2` | `test-points/` |
| `/cases` | `Ctrl+Shift+3` | `cases/` |
| `/explore` | `Ctrl+Shift+4` | 自由操作一遍浏览器后生成的脚本 |
| `/record` | `Ctrl+Shift+5` | `recordings/` |
| `/run` | `Ctrl+Shift+6` | 运行 `automation/` 里已有的脚本 |
| `/heal` | `Ctrl+Shift+7` | 保留或恢复选择器替换 |
| `/defects` | `Ctrl+Shift+8` | `defects/` |
| `/report` | `Ctrl+Shift+9` | `reports/` |

`/project`（快捷键 `Ctrl+Alt+P`）只在终端里有。它把工作目录记在 `~/.opentest/project.json`，并保留最近八个目录。macOS 的菜单里有 **📁 浏览本机文件夹...**，会用 Finder 从当前项目打开选择器。取消则项目不变。其他系统是最近目录加上手动输入路径。名字以 `.` 开头的目录会被拒绝。Web UI 没有 `/project`：打开的会话目录就是工作目录。

### 它自己会走到哪一步

模式写在 `tasks/policy.json`。没有这个文件就是 `balanced`。

| 模式 | 行为 |
|---|---|
| `guided`（逐步引导） | 写完一节或一个功能就停。测试点确认之前不写用例。 |
| `balanced`（智能协作，默认） | 不问要不要继续。写完图谱和待澄清，再把测试点全部写上，状态仍是待确认，然后给没有被挡住的功能写用例草稿。 |
| `autonomous`（自主执行） | 和 `balanced` 同一套写法。 |

无论哪种模式，录制、共享环境执行、应用版本演进基线，都要你明确同意。

`/cases` 这个命令本身要等检查点里有名为 `confirmed` 的步骤。`/points` 会请你确认：查看已有测试点时会问，新写完一批之后也会问。接受确认框才写下这一步。`balanced` 下写出的用例草稿不会因此解开这条斜杠命令。

高风险待澄清是指待处理条目里出现下线、疑似删除、互相矛盾、规则缺失、没有可执行规则或新版未提及。它们只挡住该功能的用例。

测试点或用例的某一步 `complete` 时，会检查状态仍为待确认的条目。测试点要有优先级，并且只写一个行为。用例要符合巡检模版，有优先级，自动化写成是或否，录制写成需要或不需要，写上对应测试点、前置条件、期望结果，步骤各自占一行编号。一条用例只验证一件事：标题不要用「与」「兼测」「同时校验」把两件事连起来，创建成功也不要和重名、长度、格式或必填失败写在同一条里。检查没过，这一步不会完成。已经确认的条目，以及没有状态行的旧用例，保持原样。

Agent 不编造通过率，也不编造缺陷。简报里的通过率只从一次已经结束的执行记录计算，分母是通过和失败，跳过和无法执行的脚本不进去。它不做发版签字，也不做变更影响分析。

### 用例

```
# 功能用例-<模块名>

### TC001 标题
- 优先级：高
- 自动化：否
- 录制：需要
- 状态：待确认
- 对应测试点：TP001
- 前置条件：……
- 步骤：
  1. ……
  2. ……
- 期望结果：……
```

文件名就是模块。`录制` 只有在优先级为高、并且是核心用户旅程时才写 `需要`，用来做 Playwright 回归。校验、权限、默认值和提示类写 `不需要`。优先级高不够。已经写好、没有这个字段的旧用例保持原样。哪怕只有一步，步骤也要换行编号。`sync_case_sheet` 把用例推到钉钉个人空间表格（MCP 名称 `dingtalk-excel`），也可以把人在表格上的修改收回来。表头固定为这一行、这个顺序：

`编号` `标题` `模块` `需求版本` `优先级` `对应测试点` `前置条件` `步骤` `期望结果` `状态` `执行结果`

表格状态只有正常和废弃。待确认和已接受在表里显示为正常。执行结果来自最近一次运行。已经有 `knowledge/case-sheet.json` 就继续用这一张。从表格收回的改动写成待确认的经验，不会自己启用。本地 `cases/*.md` 仍是准。

### 录制和自愈

`/record` 要一个 `http` 或 `https` 沙箱地址，不会自己猜。地址也可以来自 `OPENTEST_SANDBOX_URL`，或工作目录里的 `opentest.sandbox.json`。

录制和回放使用本机安装的 Google Chrome。没有 Chrome 时，才下载与 Playwright 1.63.0 配套的 Chromium。先从官方地址下载，失败后再用 npmmirror 的 Playwright 镜像试一次。Edge、Brave，以及以前写在 `~/.opentest/browser.json` 里的选择，都不会用。`opentest-ai doctor` 会说明将要打开哪一个。`opentest-ai install` 负责准备好它。Docker 只给可选的 Neo4j 图谱服务用。

浏览器只打开一次。先登录，再在控制页录一条或多条，全部录完才关闭。指定了用例就只列这一条。没指定时，列表是需要 Playwright 录制的用例，也就是高优先级的核心用户旅程。用例由你在控制页点选，Agent 不根据点击内容猜测对应哪一条。录完的一段写成 `recordings/<capture_id>/capture.json`，里面是 Playwright 操作、用例编号和登录态。不写 spec，不写 pytest，不写 HAR，也不把用例标成 `- 自动化：是`。API 录制还没有做。空的一段不会保存。

`/explore` 是另一条路：你自由操作一遍浏览器，`explore_and_generate` 据此生成脚本。它不是按用例逐条录制。

`/run` 时选择器失效，Agent 会立刻调用 `heal_selector`。替换前和替换后都留着，当前文件先用替换后的版本把这一轮跑完。这一轮结束后，终端会问留哪一版。`/heal` 和自愈面板问的是同一件事。

`/run` 按你勾选的顺序回放 UI 采集，目录里已有的 pytest 文件在本机有 pytest 时也会跑。

## 文件放在哪

终端里，需求文档和产品目录并排：

```
~/Desktop/projects/MyProduct_V1.1.3_Requirements.md   →   ~/Desktop/projects/MyProduct/
```

同一个上级目录里的另一个产品单独建目录。

```
MyProduct/
├── knowledge/      需求评审.md、审核经验.md、source-pack/、evolution/、case-sheet.json
├── graph/          graph.json、index.md、批次；只有 Neo4j 真的连上才写入 Neo4j
├── test-points/
├── cases/
├── recordings/     UI 采集，一段一个目录
├── automation/     可执行的 spec 和 pytest，和采集分开组装
├── defects/
├── reports/
└── tasks/          检查点、status.md、policy.json
```

写待澄清、测试点和用例之前，会读取 `<产品目录>/knowledge/审核经验.md` 和 `~/.pi/agent/opentest/审核经验.md` 里状态为已启用的经验。待审核里的决定由系统写入这两份文件。一条经验被推翻两次会停用。Agent 不会自己把经验设成已启用。

同一产品同时有基线和更新的文档时，`align_requirement_versions` 把方案写到 `knowledge/evolution/`，不改用例、测试点和图谱。新版没写到的功能是「新版未提及」，不能当成删除。人在版本演进里确认之前，什么都不会应用。

## 需求图谱

测试点对着图谱写，不是把整份文档贴进去写。一批是一节。工具会拒绝超过 40 个节点加关系、或超过 6000 个字符的一批。只有 `graph.json` 里还没有节点时，第一批可以用 `replace`。之后都用 `append`。某一节的图还没读完，这一节不能标完成。

| 工具 | 作用 |
|---|---|
| `ingest_requirement_sources` | 把钉钉文档树（根文档加直接关联，深度 2）写成 `knowledge/source-pack/` |
| `read_requirement_figures` | 刷新当前这一节的图地址，连同旁边的正文一起读 |
| `store_requirement_graph` | 写入一批 |
| `query_requirement_graph` | 读取某个功能的前置条件、规则和状态 |
| `align_requirement_versions` | 提出新文档和基线怎么对齐 |
| `query_baseline_feature` | 查新文档只点了名字的基线功能 |
| `sync_case_sheet` | 把用例推到钉钉表格，或把修改收回 |

```bash
npx opentest-ai services up      # 随仓库附带的 Neo4j，需要 Docker
npx opentest-ai services logs
npx opentest-ai services stop
```

它把随机密码写到 `~/.opentest/services.json`（权限 `0600`），并且只绑回环：Bolt `127.0.0.1:7687`，浏览器 `http://127.0.0.1:7474`。Neo4j 没启动时图谱留在 `graph/`，工具会说明这一点。

## 命令

```
opentest-ai run [prompt...]        检查录制浏览器后打开 Agent
  --print                          跑一轮后退出
  --skip-browser-setup             跳过这次检查
opentest-ai agent [prompt...]      打开 Agent
  --print                          跑一轮后退出

opentest-ai web                    在本仓库里启动 Web UI
  -p, --port <port>                默认 30141
  -H, --hostname <hostname>        默认 127.0.0.1
  --no-open                        不自动打开浏览器

opentest-ai browser setup          使用本机 Chrome，没有则下载 Chromium
opentest-ai browser status|verify|detect|reset

opentest-ai config                 旧的 ~/.opentest 配置。不决定 Agent 的模型。

opentest-ai services [up|stop|logs]
opentest-ai install                使用本机 Chrome，没有则下载 Playwright Chromium
opentest-ai doctor                 检查 Node 和录制浏览器
opentest-ai update                 向 npm 检查新版本
```

Agent 里 `@path/to/doc.md` 可以用绝对路径。`/` 列出提示词。`Ctrl+C` 退出。内置分析模板 `/prd-analysis` 只读。自定义模板放在 `~/.pi/agent/prompts/`（或 `PI_CODING_AGENT_DIR` 下面），用 `/` 选择。同名文件不会替换内置模板。

## 配置

| 变量 | 作用 |
|---|---|
| `PI_CODING_AGENT_DIR` | Pi 的 Agent 目录。默认 `~/.pi/agent` |
| `OPENTEST_CWD` | Agent 看到的工作目录 |
| `OPENTEST_HOME` | 替换 `~/.opentest` 用的家目录 |
| `OPENTEST_QA` | `0` 时 Web 会话不加载测试流程 |
| `OPENTEST_SANDBOX_URL` | `/record` 没有收到地址时使用的沙箱 URL |
| `OPENTEST_ROOT` | Web UI 加载 QA 技能时用的仓库根目录 |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | 使用已有的 Neo4j，而不是随仓库启动的那个 |
| `DINGTALK_DOC_MCP_URL` | 钉钉文档 MCP；`mcp.json` 里已按名称配好时可以不设 |
| `DINGTALK_EXCEL_MCP_URL` | 钉钉表格 MCP；没有名为 `dingtalk-excel` 的服务时使用 |
| `ZENTAO_BASE_URL` / `ZENTAO_TOKEN` | `/defects` 读取禅道 |
| `JIRA_BASE_URL` / `JIRA_TOKEN` | `/defects` 读取 Jira。`JIRA_EMAIL` 和 `JIRA_JQL` 可选 |

`/defects` 会说明缺哪几项，不会编造缺陷。

[`.env.example`](.env.example) 里的 `OPENTEST_PROVIDER`、`OPENTEST_API_KEY` 以及其余配置档变量，属于旧的 `opentest-ai config`。Agent 不读它们。

密钥不会写进用例、脚本或报告，也不会放进提示词。配置好的密钥展示时是打码的，例如 `sk-…cret`。

## 开发

```bash
npm test
```

先跑 `cli/**/*.test.js`，再跑 Web UI 的测试。Playwright 固定在 `1.63.0`。本机有 Chrome 时录制打开它，没有才用这份配套的 Chromium。回放同一个脚本时用的也是这个浏览器。

```
open-test/
├── cli/            Agent、工具、图谱、检查点
├── .pi/skills/     opentest-qa 技能
├── app/            Next.js 路由，包括 /api/qa
├── components/     Pi Web 界面和测试工作台
├── lib/            工作台、语言包、会话接入
└── schemas/        旧的 llm-config.schema.json
```

`cli/services/compose.yml` 只运行随仓库附带的 Neo4j。

## 许可证

MIT — 见 [LICENSE](LICENSE)。
