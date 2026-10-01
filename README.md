# Open-Test

A terminal test agent that turns a requirement document into test knowledge, test points, and executable cases — then records real browser sessions to automate them.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/open-test.svg)](https://www.npmjs.com/package/open-test)

## 🎯 What is Open-Test?

You point it at a requirement document with `@`. It reads that document and produces, in a visible folder next to it:

- **Requirement knowledge** — the rules, states, and preconditions, stored as a graph
- **Test points** — one behavior per scenario, written for a human to confirm
- **Functional cases** — numbered, prioritized, step-by-step, runnable without reading code
- **Recorded automation** — real Playwright scripts captured while you click through a sandbox

It is a terminal agent, not a web dashboard. You stay in your editor and your terminal; it asks for confirmation at the gates that matter and never invents results.

## 🚀 Quick Start

```bash
# 1. Configure a model (one-time)
npx open-test config

# 2. Open the agent anywhere
npx open-test run

# 3. Point it at a requirement document
> @/path/to/your/requirements.md
```

`config` is a wizard. It writes to `./opentest.config.json` (shared with your team) or `~/.opentest/config.json` (yours). To configure without the wizard:

```bash
npx open-test config set --provider deepseek --api-key sk-xxxx --model deepseek-chat
npx open-test config ping      # verify it can complete a request
npx open-test config list      # profiles, keys masked
```

### Providers

| Provider | Default model | Notes |
|---|---|---|
| `openrouter` | `deepseek/deepseek-r1:free` | Free tier, good for trying things out |
| `deepseek` | `deepseek-chat` | Production case generation |
| `cc-switch` | `claude-3-5-sonnet-20241022` | Enterprise aggregator routing |
| `ollama` | `deepseek-r1:14b` | Offline / air-gapped, no API key |
| `custom` | — | Any OpenAI-compatible endpoint (needs `--base-url` and `--model`) |

Profiles support failover ordering, so a rate-limited free tier can fall through to a production endpoint. See [Configuration](#configuration).

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

When a selector breaks during `/run`, the agent calls `heal_selector` immediately rather than stopping to ask. Both the before and after versions are kept, and the current file uses the replacement so the run can finish. **You** decide which version survives, with `/heal`.

## 📁 Where Files Land

Artifacts go to a visible folder next to your requirement document, named for the product. Hidden directories are refused.

```
~/Desktop/易训/筑安通V1.1.3需求文档.md   →   ~/Desktop/易训/筑安通/
```

```
筑安通/
├── knowledge/      Rules, states, preconditions, open questions
├── graph/          Requirement graph (index.md + batches)
├── test-points/    Test points, one behavior per scenario
├── cases/          Functional cases
├── automation/     Playwright specs from recording
├── defects/        Zentao / Jira
├── reports/        Test briefings
└── tasks/          Checkpoint and progress
```

Sibling products in the same folder each get their own directory — 绩效管理 does not leak into 筑安通.

Use `/project` to pin a working directory; after that, steps write there. The selection persists in `~/.opentest/project.json` along with your recent directories.

## 🧠 The Requirement Graph

Test points are written against a graph, not against the raw document. The agent stores the graph in batches (max 20 nodes / 20 relationships per call) so long documents stay tractable, and queries it before writing cases:

- `store_requirement_graph` — write a batch (`replace` for the first batch, `append` after)
- `query_requirement_graph` — read preconditions, rules, and states for a feature

Graphs go to Neo4j when it is running, and stay in `graph/` when it is not. The agent will not claim a graph reached Neo4j if it did not.

```bash
npx open-test services up      # start the bundled Neo4j (Docker)
npx open-test services logs
npx open-test services stop
```

This writes a random password to `~/.opentest/services.json` (mode `0600`) and binds to loopback only — Bolt on `127.0.0.1:7687`, browser on `http://127.0.0.1:7474`. If Docker Hub times out, it retries from a mirror automatically.

## 🧰 Commands

```
open-test run [prompt...]        Open the agent (same as `agent`)
open-test agent [prompt...]      Open the agent
  --print                        Run one turn and exit (for scripting)

open-test config                 Interactive provider wizard
open-test config set             Write one provider profile
open-test config use <profile>   Switch the active profile
open-test config ping            Check the active profile can serve a request
open-test config list            Show profiles with keys masked

open-test services [up|stop|logs]   Bundled local Neo4j

open-test doctor                 Dependency and update health check
open-test status                 Legacy service status (Docker Compose)
open-test init [name]            Legacy project scaffold
open-test start|stop|logs        Legacy Docker Compose service control
open-test test [suite]           Legacy Rust integration tests
open-test update|upgrade         Version checks
```

### Inside the agent

`@path/to/doc.md` points at any document, absolute paths fine. `/` lists prompts. `Ctrl+C` exits.

The built-in analysis template is `/prd-analysis`, and it is **read-only**. Custom templates go in `~/.opentest/pi-agent/prompts/` and are selectable with `/`.

## ⚙️ Configuration

### LLM profiles

Layers merge in this order, each overriding the last: overrides → project `./opentest.config.json` → user `~/.opentest/config.json` → environment → built-in preset. See [`opentest.config.example.json`](opentest.config.example.json) and the schema in [`schemas/llm-config.schema.json`](schemas/llm-config.schema.json).

| Variable | Purpose |
|---|---|
| `OPENTEST_CONFIG` | Use a config file at a path other than `./opentest.config.json` |
| `OPENTEST_PROFILE` | Active profile name |
| `OPENTEST_PROVIDER` | `openrouter` \| `deepseek` \| `cc-switch` \| `ollama` \| `custom` |
| `OPENTEST_BASE_URL` | OpenAI-compatible base URL |
| `OPENTEST_MODEL` | Model id |
| `OPENTEST_API_KEY` | API key (injected into the agent process) |
| `OPENAI_API_KEY` | Legacy fallback — only reached when no preset matches; defaults to `gpt-4o-mini` on `api.openai.com` |

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

API keys are never written into case files, automation scripts, or reports, and the agent will not print them.

## 🛠️ Development

```bash
npm test           # Node + Python unit tests
npm run test:llm   # Same suite, explicit
```

The suite covers LLM config resolution and failover, agent launch, all registered tools, graph storage and batching, checkpoint resume, command gating, and local Neo4j startup. 57 Node tests, 9 Python tests.

Playwright is pinned to `1.63.0` so recording uses a browser matching the installed Chromium. Do not float this version — codegen output must stay compatible with replay.

### Repository layout

Only `cli/` is the product. Everything else is legacy from an earlier microservice architecture, kept for reference:

```
open-test/
├── cli/               ← the agent: commands, tools, graph, checkpoints
├── agent/llm/         LLM config resolution (Python side)
├── .pi/skills/        The QA skill the agent loads
├── schemas/           JSON schemas
├── knowledge-graph/   Legacy — superseded by cli/agent/graph/
├── api/ executor/ frontend/       Legacy microservices
├── semantic-engine/ event-bus/ worker-pool/     Legacy Rust
└── tests/             Legacy Rust integration tests
```

## 📄 License

MIT — see [LICENSE](LICENSE).