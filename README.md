[English](README.md) | [中文](README.zh.md)

# Open-Test

A test agent that turns a requirement document into test knowledge, test points, and executable cases, then records real browser sessions against those cases.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/opentest-ai.svg)](https://www.npmjs.com/package/opentest-ai)

The same agent runs in the terminal and in the Web UI. The Web UI is the Pi Web shell plus a test workbench. It asks before recording, before a shared-environment run, and before applying a version-evolution baseline. Pass rates and defects come from files it has actually read.

Requires Node.js `>=22.19.0`. Recording and replay use the Playwright `1.63.0` shipped with this repo.

## What it writes

Point it at a requirement with `@`, or give it a DingTalk document link. Artifacts go into one visible product directory:

- **Requirement knowledge** — rules, states, preconditions, and open questions, plus a graph
- **Test points** — one behavior per scenario, each marked for a person to confirm
- **Functional cases** — numbered steps, one assertion each, runnable without reading code
- **UI captures** — Playwright actions saved under `recordings/` after one login, one capture per case. These are not finished scripts.

A DingTalk link is frozen into `knowledge/source-pack/` first. Later analysis reads that pack. A section that contains figures is graphed only after those figures have been read at fresh URLs. Where the figure and the text disagree, both sides stay and the clash is written as an open question.

## Quick start

### Terminal

```bash
npx opentest-ai install         # use local Chrome, or download Playwright Chromium
npx opentest-ai run             # same browser check, then opens the agent

> @/path/to/your/requirements.md
```

`opentest-ai`, `open-test`, and `opentest` are the same program. On a TTY, the bare command opens the agent and skips the browser check. `run` checks it: local Chrome is used when it is installed, and Playwright Chromium is downloaded only when Chrome is missing. `agent` and `run` both accept `--print` for a single turn. Only `run` accepts `--skip-browser-setup`.

### Web UI and the test workbench

From a checkout of this repo:

```bash
npm install
npm run dev
# http://127.0.0.1:30141
```

`npx opentest-ai web` starts the same app (`--port`, `--hostname`, `--no-open`). The default bind is `127.0.0.1:30141`. Without a production build it uses `next dev`.

Open a project directory in the sidebar. That directory is the product workspace: `knowledge/`, `cases/`, and the rest are written directly inside it. The terminal is different: there, artifacts land in a sibling folder named for the product, next to the requirement file.

The right-hand **Test workbench** follows the pipeline: requirements, test points, cases, record, run, defects, report. Beside that it has overview, review queue, lessons, version evolution, the graph, automation scripts, and selector healing.

**Settings → General → Language** is English, 简体中文, or 繁體中文. The choice is stored as `pi-locale` and the workbench chrome follows it. Case files, stored statuses, and the text sent to the model stay Chinese.

Set `OPENTEST_QA=0` to start Web sessions without the QA workflow.

## Models

There is one model configuration. The Web UI **Models** page writes it, and the terminal agent reads it. It lives in Pi's agent directory: `~/.pi/agent/`, or `PI_CODING_AGENT_DIR` when you set that yourself. The launcher does not write `models.json`, does not pass `--model`, and does not set `PI_CODING_AGENT_DIR` for you.

Inside a running agent, switching is Pi's own control and keeps the conversation:

| | |
|---|---|
| `/model` | pick a model Pi knows |
| `Ctrl+P` / `Shift+Ctrl+P` | cycle forward / backward |
| `/login` | sign in to a subscription provider |

Tools that call the model directly (explore, and HAR analysis when that path runs) use this same default. A key stored as a shell command (`!cmd`) stays with Pi; those tools then fall back to rules and record `source: "rules"`. A model answer is `source: "ai"`.

`opentest-ai config` still opens the old profile wizard and writes `~/.opentest/config.json`. It prints a warning and does not change the model the agent uses. There is no `/task-model` command.

## Workflow

Ten step commands. In the terminal each one also has a shortcut. The Web UI does not register these shortcuts; use the workbench or type the command.

| Command | Shortcut | Writes |
|---|---|---|
| `/status` | `Ctrl+Shift+0` | reads `tasks/` |
| `/analyze` | `Ctrl+Shift+1` | `knowledge/`, `graph/` |
| `/points` | `Ctrl+Shift+2` | `test-points/` |
| `/cases` | `Ctrl+Shift+3` | `cases/` |
| `/explore` | `Ctrl+Shift+4` | a script from one free-form browser pass |
| `/record` | `Ctrl+Shift+5` | `recordings/` |
| `/run` | `Ctrl+Shift+6` | runs scripts already in `automation/` |
| `/heal` | `Ctrl+Shift+7` | keep or revert a selector replacement |
| `/defects` | `Ctrl+Shift+8` | `defects/` |
| `/report` | `Ctrl+Shift+9` | `reports/` |

`/project` (shortcut `Ctrl+Alt+P`) exists only in the terminal. It pins the working directory in `~/.opentest/project.json` and remembers the last eight directories. On macOS the menu includes **📁 浏览本机文件夹...**, which opens the Finder chooser at the current project. Cancelling leaves the project unchanged. Other platforms get the recent list plus a typed path. A directory whose name starts with `.` is refused. The Web UI has no `/project`: the opened session directory is the workspace.

### How far it goes on its own

`tasks/policy.json` holds the mode. Missing file means `balanced`.

| Mode | What it does |
|---|---|
| `guided` (逐步引导) | Stops after each section or feature. Does not write cases until the test points are confirmed. |
| `balanced` (智能协作, the default) | Does not ask whether to continue. Writes the graph and open questions, then every test point still marked 待确认, then draft cases for features that are not blocked. |
| `autonomous` (自主执行) | Same writing loop as `balanced`. |

In every mode, recording, a shared-environment run, and applying a version-evolution baseline wait for an explicit yes.

`/cases` itself stays blocked until a checkpoint step named `confirmed` exists. `/points` asks you to confirm, both when you view existing points and after a new batch finishes writing. Accepting that dialog writes the step. Draft cases written under `balanced` do not unlock the slash command by themselves.

High-risk open questions mention 下线, 疑似删除, 互相矛盾, 规则缺失, 没有可执行规则, or 新版未提及. They block cases for that feature only.

Completing a test-points or cases step checks the items still marked 待确认. A test point needs a priority and one behavior. A case needs the inspection template, a priority, 自动化 set to 是 or 否, 录制 set to 需要 or 不需要, a linked test point, a precondition, an expected result, and steps on their own numbered lines. One case asserts one thing: a title must not join two checks with 与, 兼测, or 同时校验, and a success path is not combined with a duplicate, length, format, or required-field failure. If the check fails, the step is not completed. Items already confirmed, and old cases with no 状态 line, are left as they are.

The agent does not invent a pass rate or a defect. A briefing computes a pass rate only from a finished run record, counting passed and failed and leaving skipped and errored scripts out. It does not sign off a release and it does not do change-impact analysis.

### Cases

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

The filename is the module. `录制` is `需要` only for a high-priority core user journey that should be covered by a Playwright regression. Validation, permission, default-value, and message cases use `不需要`. A high priority alone is not enough. Old cases without the field are left as they are. Steps are numbered on separate lines even when there is only one. `sync_case_sheet` pushes the cases to a DingTalk spreadsheet in personal space (MCP server name `dingtalk-excel`) and can pull human edits back. The sheet has these columns, in this order:

`编号` `标题` `模块` `需求版本` `优先级` `对应测试点` `前置条件` `步骤` `期望结果` `状态` `执行结果`

Sheet status is only 正常 or 废弃. 待确认 and 已接受 show up as 正常. 执行结果 comes from the latest run. An existing `knowledge/case-sheet.json` is reused. Edits that come back from the sheet are stored as pending lessons, not enabled on their own. Local `cases/*.md` stays the source of truth.

### Recording and healing

`/record` asks for an `http` or `https` sandbox URL. It does not invent one. The address can also come from `OPENTEST_SANDBOX_URL` or from `opentest.sandbox.json` in the workspace.

Recording and replay use the Google Chrome installed on this machine. If Chrome is not there, OpenTest downloads the Chromium build that matches Playwright 1.63.0. The official download is tried first; if it fails, the same install is tried again from the npmmirror Playwright host. Edge, Brave, and a browser saved in `~/.opentest/browser.json` are not used. `opentest-ai doctor` reports which browser will open. `opentest-ai install` prepares it. Docker is only for the optional Neo4j graph service.

The browser opens once. You log in, then use the control page to record one or more cases, and close the browser only when you are done. A chosen case is the only one listed. Otherwise the list is every case that needs a Playwright recording: a high-priority core user journey. You pick the case; the agent does not guess which clicks belong to which case. Each finished segment is `recordings/<capture_id>/capture.json`: the Playwright actions, the case id, and the saved login. It does not write a spec, a pytest file, or a HAR, and it does not mark the case `- 自动化：是`. API recording is not available yet. An empty segment is not saved.

`/explore` is a different path: you drive the browser once and `explore_and_generate` writes a script from that pass. It is not the case-by-case recorder.

When a selector fails during `/run`, the agent calls `heal_selector` immediately. The file before and after the replacement are both kept, and the current file uses the replacement so the run can finish. After that run, the terminal asks which version to keep. `/heal` and the heal panel ask the same question.

`/run` executes Playwright specs under `automation/`. A `test_*.py` or `*_test.py` file already in that folder is run with pytest when pytest is installed.

## Where files land

Terminal, with the requirement beside the product folder:

```
~/Desktop/projects/MyProduct_V1.1.3_Requirements.md   →   ~/Desktop/projects/MyProduct/
```

Another product in the same parent gets its own directory.

```
MyProduct/
├── knowledge/      需求评审.md, 审核经验.md, source-pack/, evolution/, case-sheet.json
├── graph/          graph.json, index.md, batches; Neo4j only when it is actually reachable
├── test-points/
├── cases/
├── recordings/     UI captures, one folder per segment
├── automation/     runnable specs and pytest files, assembled separately from captures
├── defects/
├── reports/
└── tasks/          checkpoint, status.md, policy.json
```

Enabled lessons are read from `<product>/knowledge/审核经验.md` and from `~/.pi/agent/opentest/审核经验.md` before clarifications, test points, and cases are written. Review decisions are written into those files by the system. A lesson overturned twice is disabled. The agent does not enable a lesson by itself.

When a product has both a baseline and a newer document, `align_requirement_versions` writes a plan under `knowledge/evolution/` and does not change cases, test points, or the graph. A feature the new document never mentions is 新版未提及, which is not a deletion. Nothing is applied until a person confirms it in the evolution panel.

## The requirement graph

Test points are written from the graph, not from a paste of the whole document. A batch is one section. The tool rejects a batch over 40 nodes and relationships combined, or over 6000 characters. The first batch may use `replace` only while `graph.json` has no nodes. Every later batch uses `append`. An analysis section that still has unread figures cannot be completed.

| Tool | Role |
|---|---|
| `ingest_requirement_sources` | freeze a DingTalk tree (root plus direct links; depth 2) into `knowledge/source-pack/` |
| `read_requirement_figures` | refresh the figure URLs for the current section and read them with the nearby text |
| `store_requirement_graph` | write one batch |
| `query_requirement_graph` | read preconditions, rules, and states for a feature |
| `align_requirement_versions` | propose how a new document lines up with the baseline |
| `query_baseline_feature` | look up a baseline feature the new document only names |
| `sync_case_sheet` | push cases to the DingTalk sheet, or pull edits back |

```bash
npx opentest-ai services up      # bundled Neo4j, Docker
npx opentest-ai services logs
npx opentest-ai services stop
```

This writes a random password to `~/.opentest/services.json` (mode `0600`) and binds to loopback: Bolt `127.0.0.1:7687`, browser `http://127.0.0.1:7474`. The graph stays in `graph/` when Neo4j is not running, and the tool says so.

## Commands

```
opentest-ai run [prompt...]        Open the agent after the browser check
  --print                          One turn, then exit
  --skip-browser-setup             Skip that check
opentest-ai agent [prompt...]      Open the agent
  --print                          One turn, then exit

opentest-ai web                    Launch the Web UI from this repo
  -p, --port <port>                Default 30141
  -H, --hostname <hostname>        Default 127.0.0.1
  --no-open                        Do not open a browser

opentest-ai browser setup          Use local Chrome, or download Chromium
opentest-ai browser status|verify|detect|reset

opentest-ai config                 Legacy ~/.opentest profiles. Does not select the agent model.

opentest-ai services [up|stop|logs]
opentest-ai install                Local Chrome, or download Playwright Chromium
opentest-ai doctor                 Node and the recording browser
opentest-ai update                 Check npm for a newer version
```

Inside the agent, `@path/to/doc.md` accepts absolute paths. `/` lists prompts. `Ctrl+C` exits. The built-in analysis template `/prd-analysis` is read-only. Custom templates go in `~/.pi/agent/prompts/` (or under `PI_CODING_AGENT_DIR`) and show up under `/`. A file with the same name does not replace the built-in template.

## Configuration

| Variable | Purpose |
|---|---|
| `PI_CODING_AGENT_DIR` | Pi agent directory. Default `~/.pi/agent` |
| `OPENTEST_CWD` | Working directory the agent sees |
| `OPENTEST_HOME` | Override `~` for `~/.opentest` |
| `OPENTEST_QA` | `0` turns off the QA workflow in Web sessions |
| `OPENTEST_SANDBOX_URL` | Sandbox URL used when `/record` is not given one |
| `OPENTEST_ROOT` | Repo root the Web UI loads the QA skill from |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | An existing Neo4j instead of the bundled one |
| `DINGTALK_DOC_MCP_URL` | DingTalk document MCP, if it is not named in `mcp.json` |
| `DINGTALK_EXCEL_MCP_URL` | DingTalk sheet MCP, if it is not named `dingtalk-excel` |
| `ZENTAO_BASE_URL` / `ZENTAO_TOKEN` | Zentao for `/defects` |
| `JIRA_BASE_URL` / `JIRA_TOKEN` | Jira for `/defects`. `JIRA_EMAIL` and `JIRA_JQL` are optional |

`/defects` says which of those are missing. It does not invent bugs.

`OPENTEST_PROVIDER`, `OPENTEST_API_KEY`, and the rest of the profile block in [`.env.example`](.env.example) belong to the legacy `opentest-ai config` store. The agent does not read them.

Keys are not written into case files, scripts, or reports, and they are not placed in the prompt. A configured key is shown masked, like `sk-…cret`.

## Development

```bash
npm test
```

That runs `cli/**/*.test.js` and then the Web UI tests. Playwright stays on `1.63.0`. Recording launches local Chrome when it is installed, and that pinned Chromium only when Chrome is missing. Replay of a spec uses the same browser.

```
open-test/
├── cli/            agent, tools, graph, checkpoints
├── .pi/skills/     the opentest-qa skill
├── app/            Next.js routes, including /api/qa
├── components/     Pi Web shell and the test workbench
├── lib/            workbench, i18n, session wiring
└── schemas/        legacy llm-config.schema.json
```

`cli/services/compose.yml` runs only the bundled Neo4j.

## License

MIT — see [LICENSE](LICENSE).
