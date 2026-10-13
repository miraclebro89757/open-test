[English](README.md) | [中文](README.zh.md)

# Open-Test

A terminal test agent that turns a requirement document into test knowledge, test points, and executable cases — then records real browser sessions to automate them.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/opentest-ai.svg)](https://www.npmjs.com/package/opentest-ai)

## 🎯 What is Open-Test?

You point it at a requirement document with `@`. It reads that document and produces, in a visible folder next to it:

- **Requirement knowledge** — the rules, states, and preconditions, stored as a graph
- **Test points** — one behavior per scenario, written for a human to confirm
- **Functional cases** — numbered, prioritized, step-by-step, runnable without reading code
- **Recorded automation** — real Playwright scripts captured while you click through a sandbox

It is a terminal agent, not a web dashboard. You stay in your editor and your terminal; it asks for confirmation at the gates that matter and never invents results.

## 🚀 Quick Start

### Terminal Agent (Quick)

```bash
# 1. Configure a model once, in the Web UI's model page (the terminal shares it)
npx opentest-ai web

# 2. Configure browser environment (one-time)
npx opentest-ai browser setup

# 3. Open the agent anywhere
npx opentest-ai run

# 4. Point it at a requirement document
> @/path/to/your/requirements.md
```

### Web UI (Visual)

Prefer a browser interface? Launch the Web UI:

```bash
# Launch Web UI on http://127.0.0.1:30141
npx opentest-ai web

# Or customize port and hostname
npx opentest-ai web --port 8080 --hostname 0.0.0.0
```

The Web UI provides:
- 📂 Visual file browser and editor
- 🔄 Session management across all projects
- ⚙️ Graphical model configuration
- 🎯 Real-time agent interaction
- 🌲 Git integration and diff viewer

See [Web UI Guide](./docs/WEB_UI.md) for full documentation.

### Browser Setup

On first run, OpenTest will guide you through browser environment setup for recording functionality. You have three options:

1. **Use system browser** (recommended) — Use your installed Chrome/Edge/Chromium, no download required
2. **Install Playwright Chromium** — Download a dedicated test browser (~120MB)
3. **Skip for now** — Use other features without recording

See [BROWSER_SETUP.md](BROWSER_SETUP.md) for detailed configuration guide.

`config` is a wizard built so you can finish it without looking anything up. It asks one question at a time and tells you what to do at each step:

1. **Pick a provider** — each option says what it costs and who it suits.
2. **Paste the key** — the wizard prints the exact page to open, the button to click, and what a real key looks like (`sk-or-v1-…`, `sk-…`). Ollama skips this entirely.
3. **Name, address, model** — pre-filled with the provider's defaults, so pressing Enter is always a valid answer. Only the `custom` provider requires you to type them.
4. **Where to save** — `~/.opentest/config.json` (yours, never committed) or `./opentest.config.json` (your project, shareable with the team).
5. **Ping** — an optional live check that tells you what to do if it fails.

Pasted keys are cleaned before they are stored: a leading `Bearer `, surrounding quotes, and stray whitespace are removed, and obvious mistakes (a truncated key, a JSON blob, a documentation placeholder) are rejected at the prompt with an explanation instead of failing later at request time.

To configure without the wizard:

```bash
npx opentest-ai config set --provider deepseek --api-key sk-xxxx --model deepseek-chat
npx opentest-ai config ping      # verify it can complete a request
npx opentest-ai config list      # profiles, keys masked
```

### Models

There is one model configuration, and it lives in Pi's agent directory (`~/.pi/agent/`, or `PI_CODING_AGENT_DIR` if you set it). The Web UI's **Models** page edits it, and the Terminal Agent reads the same files, so a model you add or switch to in the browser is the one the terminal starts on. Any provider Pi supports works, including OpenAI-compatible endpoints such as DeepSeek, SiliconFlow, ModelScope, OpenRouter or a local Ollama.

## 🔄 The Workflow

Nine steps, each with a slash command and a shortcut. Every step writes to one shared checkpoint, so an interrupted run resumes where it stopped.

| Command | Shortcut | Produces |
|---|---|---|
| `/status` | `Ctrl+Shift+0` | Progress across all tasks |
| `/analyze` | `Ctrl+Shift+1` | `knowledge/`, `graph/` |
| `/points` | `Ctrl+Shift+2` | `test-points/` |
| `/cases` | `Ctrl+Shift+3` | `cases/` |
| `/record` | `Ctrl+Shift+4` | `automation/` |
| `/run` | `Ctrl+Shift+5` | Runs the recorded scripts |
| `/heal` | `Ctrl+Shift+6` | Review selector replacements |
| `/defects` | `Ctrl+Shift+7` | `defects/` |
| `/report` | `Ctrl+Shift+8` | `reports/` |

### The gates

The agent stops and waits at two points, on purpose:

1. **After test points.** It will not write functional cases until you confirm the points. Run `/points`, read them, confirm.
2. **Before recording.** It will not guess a sandbox URL. Run `/record` and give it the `http`/`https` address of the environment you want recorded.

Two things it is explicitly instructed never to do: fabricate pass rates or defect data, and perform release sign-off or change-impact analysis.

### Recording and self-healing

`/record` asks for the sandbox URL, then opens a Playwright codegen window. You perform the scenario per your case; close the window when done. The agent then maps the recorded UI text back onto your functional cases: matched cases flip to `- 自动化：是` and record the script path, and unmatched cases get tagged `- 自动化：否`.

Recording has three modes, chosen when you call `/record`:

| Mode | Produces |
|---|---|
| `ui+api` (default) | Playwright spec **and** a pytest API script generated from the HAR |
| `ui-only` | Playwright spec only |
| `api-only` | pytest API script only |

In `ui+api` the HAR is analyzed for variables, request dependencies, and secrets. When an LLM profile is configured the analysis is model-driven; otherwise a rule engine produces the same structure and the result is labelled `source: "rules"` so you always know which ran. Credentials are written to a `.env.example` and read from the environment — never hardcoded into the script.

When a selector breaks during `/run`, the agent calls `heal_selector` immediately rather than stopping to ask. Both the before and after versions are kept, and the current file uses the replacement so the run can finish. **You** decide which version survives, with `/heal`.

## 📁 Where Files Land

Artifacts go to a visible folder next to your requirement document, named for the product. Hidden directories are refused.

```
~/Desktop/projects/MyProduct_V1.1.3_Requirements.md   →   ~/Desktop/projects/MyProduct/
```

```
MyProduct/
├── knowledge/      Rules, states, preconditions, open questions
├── graph/          Requirement graph (index.md + batches)
├── test-points/    Test points, one behavior per scenario
├── cases/          Functional cases
├── automation/     Playwright specs from recording
├── defects/        Zentao / Jira
├── reports/        Test briefings
└── tasks/          Checkpoint and progress
```

Sibling products in the same folder each get their own directory — ProductB does not leak into ProductA.

Use `/project` to pin a working directory; after that, steps write there. The selection persists in `~/.opentest/project.json` along with your recent directories.

The picker lists your recent directories first. On macOS it also offers **📁 浏览本机文件夹...**, which opens the native Finder folder chooser and starts at your current project. Closing the dialog without choosing leaves the project unchanged; if the dialog cannot open, it falls back to typed input. Other platforms get recent entries plus typed input.

## 🧠 Models

Set the model once in the Web UI (**Models** at the bottom left of the sidebar): add a provider and key, then choose a default model. The Terminal Agent starts on that default and prints it, with the key masked, when it opens.

Inside the agent, switching is Pi's own job and keeps the conversation intact:

| | |
|---|---|
| `/model` | pick any model Pi knows about |
| `Ctrl+P` / `Shift+Ctrl+P` | cycle forward / backward |
| `/login` | sign in to a subscription provider |

OpenTest does not keep a second copy of any of this. The launcher never writes `models.json`, never passes `--model`, and never sets `PI_CODING_AGENT_DIR` for you.

### Where your key lives

| | |
|---|---|
| Stored in | `~/.pi/agent/models.json` (or `auth.json`), written by Pi Web's model page |
| Read by | Pi itself, and by OpenTest tools that call the model directly (HAR analysis, explore). The direct tools use the same default model; a key given as a shell command (`!cmd`) is left to Pi, and those tools fall back to rule-based analysis |
| Never | placed in the prompt, a message, a tool result, or the process command line |
| Shown to you as | `sk-…cret`, a mask |

## 🧠 The Requirement Graph

Test points are written against a graph, not against the raw document. The agent stores the graph in batches (max 20 nodes / 20 relationships per call) so long documents stay tractable, and queries it before writing cases:

- `ingest_requirement_sources` — freeze a DingTalk tree (root plus direct links) into `knowledge/source-pack/`; analysis reads the pack, not live DingTalk
- `sync_case_sheet` — push local cases to a DingTalk spreadsheet in personal space (`dingtalk-excel`) or pull human edits back; table-derived lessons stay pending
- `store_requirement_graph` — write a batch (`replace` for the first batch, `append` after)
- `query_requirement_graph` — read preconditions, rules, and states for a feature

Graphs go to Neo4j when it is running, and stay in `graph/` when it is not. The agent will not claim a graph reached Neo4j if it did not.

```bash
npx opentest-ai services up      # start the bundled Neo4j (Docker)
npx opentest-ai services logs
npx opentest-ai services stop
```

This writes a random password to `~/.opentest/services.json` (mode `0600`) and binds to loopback only — Bolt on `127.0.0.1:7687`, browser on `http://127.0.0.1:7474`. If Docker Hub times out, it retries from a mirror automatically.

## 🧰 Commands

```
opentest-ai run [prompt...]        Open the agent (same as `agent`)
opentest-ai agent [prompt...]      Open the agent
  --print                          Run one turn and exit (for scripting)
  --skip-browser-setup             Skip browser setup check

opentest-ai web                    Launch Web UI (browser interface)
  -p, --port <port>                Server port (default: 30141)
  -H, --hostname <hostname>        Bind hostname (default: 127.0.0.1)
  --no-open                        Don't open browser automatically

opentest-ai browser setup          Configure browser environment
  --force                          Force reconfiguration
opentest-ai browser status         Show browser configuration
opentest-ai browser verify         Verify browser works
opentest-ai browser detect         Detect available browsers
opentest-ai browser reset          Reset browser configuration

opentest-ai config                 Legacy ~/.opentest profiles (no longer used by the agent;
                                   configure models in the Web UI instead)

opentest-ai services [up|stop|logs]   Bundled local Neo4j

opentest-ai install                Check and install host dependencies
opentest-ai doctor                 Dependency and update health check
opentest-ai update                 Check npm for a newer version
```

### Inside the agent

`@path/to/doc.md` points at any document, absolute paths fine. `/` lists prompts. `Ctrl+C` exits.

The built-in analysis template is `/prd-analysis`, and it is **read-only**. Custom templates go in `~/.pi/agent/prompts/` (Pi's own prompt folder) and are selectable with `/`.

## ⚙️ Configuration

### Models

Configured in the Web UI and stored in Pi's agent directory; see [Models](#-models). The older `~/.opentest/config.json` profile store and `open-test config` are legacy and are not read by the agent.

### Defect trackers

`/defects` reads from whichever you configure. Unset, it says what is missing instead of inventing bugs.

```bash
# Zentao
export ZENTAO_BASE_URL=https://your-zentao.example.com
export ZENTAO_TOKEN=xxxx

# Jira
export JIRA_BASE_URL=https://your-jira.example.com
export JIRA_EMAIL=you@example.com
export JIRA_TOKEN=xxxx
export JIRA_JQL="ORDER BY updated DESC"   # optional
```

### Other

| Variable | Purpose |
|---|---|
| `OPENTEST_CWD` | Override the working directory the agent sees |
| `OPENTEST_HOME` | Override `~/.opentest` |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | Point at an existing Neo4j instead of the bundled one |

A full list lives in [`.env.example`](.env.example). API keys are never written into case files, automation scripts, or reports, and the agent will not print them.

## 🛠️ Development

```bash
npm test
```

The suite runs on `node --test` against a glob, so a new `*.test.js` file is picked up automatically. It covers LLM config resolution and failover, agent launch, every registered tool, requirement-graph storage and batching, checkpoint resume, command gating, recording/tagging, HAR analysis and pytest rendering, and local Neo4j startup. 91 tests.

Playwright is pinned to `1.63.0` so recording uses a browser matching the installed Chromium. Do not float this version — codegen output must stay compatible with replay.

### Repository layout

```
open-test/
├── cli/               the agent: commands, tools, graph, checkpoints, LLM config
├── .pi/skills/        the QA skill the agent loads
├── schemas/           llm-config.schema.json
└── opentest.config.example.json
```

The earlier microservice architecture (Go API, React frontend, Rust worker pool / semantic engine / event bus, Python agent service) has been removed. `cli/services/compose.yml` is the only Compose file, and it runs just the bundled Neo4j.

## 📄 License

MIT — see [LICENSE](LICENSE).