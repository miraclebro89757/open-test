# OpenTest 开发进度跟踪

**项目**：OpenTest — 终端测试 Agent
**最后更新**：2026-10-02

---

## ⚠️ 文档修正说明

上一版本文档记录的是「Go API + React 前端 + Python Agent + Rust 引擎 + Docker Compose」七服务微服务架构，并把该架构标为 100% 完成。**该架构已于 2026-09-30 被终端 Agent 取代**，仓库中相关代码自 MVP 提交（2026-09-29）后未再改动，属于遗留代码。

本文件现按真实形态重写：区分「当前产品」与「遗留代码」，并标注每部分的最后提交时间。

---

## 📊 总体进度

| 阶段 | 状态 | 说明 |
|------|------|------|
| 终端 Agent 主体 | ✅ 完成 | 命令、工具、断点、图谱、录制、自愈 |
| LLM 多厂商配置 | ✅ 完成 | 5 个预设 + 优先级合并 + 故障转移 |
| 本机 Neo4j 图谱 | ✅ 完成 | 一键起停、镜像回退、批量写入 |
| UI 录制 → 功能用例 | ✅ 完成 | Playwright codegen + 文案匹配 |
| API 录制（HAR） | 🚧 进行中 | 仅完成计划，未实现 |
| 官网 | 🚧 进行中 | 独立仓库，见文末 |

**当前阶段**：录制同时产出 UI 和 API 脚本。

---

## ✅ 当前产品（`cli/`）

最后提交：2026-10-01。测试：Node 57 个 + Python 9 个，全部通过。

### 9 步流程与门禁

| 命令 | 快捷键 | 产物 | 状态 |
|---|---|---|---|
| `/status` | `Ctrl+Shift+0` | 全局进度 | ✅ |
| `/analyze` | `Ctrl+Shift+1` | `knowledge/` `graph/` | ✅ |
| `/points` | `Ctrl+Shift+2` | `test-points/` | ✅ |
| `/cases` | `Ctrl+Shift+3` | `cases/` | ✅ |
| `/record` | `Ctrl+Shift+4` | `automation/` | ✅（仅 UI） |
| `/run` | `Ctrl+Shift+5` | 执行脚本 | ✅ |
| `/heal` | `Ctrl+Shift+6` | 前后版本供选择 | ✅ |
| `/defects` | `Ctrl+Shift+7` | `defects/` | ✅ |
| `/report` | `Ctrl+Shift+8` | `reports/` | ✅ |

两处强制门禁：`/points` 写完必须人工确认，`/cases` 在未确认时被 `commands.js` 直接拦截；`/record` 不猜沙箱地址，必须用户提供 http/https 地址。

### 8 个注册工具

`task_checkpoint`、`store_requirement_graph`、`query_requirement_graph`、`record_playwright_scenario`、`run_playwright_test`、`heal_selector`、`fetch_zentao_jira`、`write_executive_report`

### 关键机制

- **断点续跑**：所有任务共用一份 checkpoint（`tasks/checkpoint.json`），`status.md` 人可读。已完成的步骤不重做，失败步骤从该步继续。再次 `plan` 不会把已完成步骤改回未做。
- **产物落位**：写到需求文档旁边、以产品名命名的可见目录。拒绝点开头的隐藏目录，拒绝写到启动命令时所在目录。`/project` 选择的项目持久化在 `~/.opentest/project.json`。
- **需求图谱**：分批写入（单批上限 20 节点 / 20 关系），首批 `replace`、后续 `append`。写 Neo4j 前先落 `graph/index.md`。Neo4j 未启动时图谱只留在产品目录，Agent 不会谎称已入库。
- **内置模板**：`/prd-analysis` 只读。自定义模板放 `~/.opentest/pi-agent/prompts/`。历史版本化模板（`prd-analysis-1.0.0` ~ `1.4.0`）已合并回单一文件。
- **选择器自愈**：`/run` 中选择器失效时立即调用 `heal_selector`，不留存「替换前 / 替换后」两个版本供 `/heal` 选择，Agent 不自行决定留哪一版。

### LLM 配置

5 个预设：`openrouter`（免费调试）、`deepseek`（生产）、`cc-switch`（企业中转）、`ollama`（内网离线）、`custom`。合并优先级：overrides → 项目 `opentest.config.json` → 用户 `~/.opentest/config.json` → 环境变量 → 内置预设。支持 `failover_order` 故障转移链，API key 全程掩码显示。

### 本机 Neo4j

`npx open-test services up` 起 `neo4j:5.24-community`，仅绑定回环（7687 / 7474），随机密码写入 `~/.opentest/services.json`（权限 `0600`）。Docker Hub 超时自动走 `m.daocloud.io` 镜像重试。

### 录制

Playwright 锁定 `1.63.0`（与内置 Chromium 版本匹配，不可浮动）。录制后从 spec 中提取 `name:` 与 `getByText/Placeholder/Label/Title` 的界面文案，对 `cases/` 做关键词计分匹配：对上的改为 `自动化：是` 并记录脚本路径，未对上的补 `自动化：否`；分数打平时拒绝自动匹配，要求指定用例编号。

---

## 🚧 进行中：API 录制（HAR）

`TODO.md` 中唯一未完成项，2026-10-01 仅完成计划。目标：一次录制窗口同时产出 UI 脚本与 API 脚本。

计划要点：
1. 录制前让用户选择：两者都录 / 只录 UI / 只录 API
2. 复用 `codegen` 的 `--save-har` + `--save-har-glob`，一窗双录
3. 用 glob 过滤静态资源、埋点、第三方域名
4. HAR 渲染为 pytest 脚本，写入产品目录 `automation/api/`
5. AI 分析请求/响应，抽取变量（环境地址、账号、时间戳、随机编号、分页参数），识别前序依赖（token、新建记录 id 需从前置响应取）
6. 凭据抽环境变量，不写入脚本和产物
7. UI 与 API 脚本均补前置准备与后置清理，测试数据带本次执行唯一后缀，保证可重复执行
8. 录制结果仍需对上功能用例并记入 task `record`

---

## ⚠️ 已知问题与技术债

1. **`npm test` 指向错误**：原指向 `tests/`（Rust cargo crate，停留在 2026-09-29），当前实际测试在 Node `--test`。已修正。
2. **`repository` 字段为占位符**：`package.json` 与部分文档写 `github.com/yourusername/open-test`，真实仓库为 `github.com/miraclebro89757/open-test`（见 `schemas/llm-config.schema.json` 与 OpenRouter `HTTP-Referer` 请求头）。已修正。
3. **`package.json` description 失真**：描述中的 "semantic element location" 属于遗留微服务架构的能力。已修正。
4. **录制匹配为关键词计分**，非语义匹配。UI 改版导致文案变化时会失配。
5. **`knowledge-graph/` 解析能力闲置**：该目录有 1045 行文档解析器（markdown 389 / openapi 340 / docx 225），当前 CLI 走的是 `cli/agent/graph/`（187 行图谱存取），只支持 Markdown。若需要 docx 或 OpenAPI 输入，需把解析器接回 CLI。
6. **legacy CLI 命令仍在**：`init` / `start` / `stop` / `status` / `logs` / `test` 仍调用 Docker Compose，面向的是已废弃的微服务架构。README 已标注为 legacy。

---

## 📦 遗留代码（最后提交时间）

| 目录 | 最后提交 | 说明 |
|---|---|---|
| `api/` | 2026-09-29 | Go REST API 网关 |
| `executor/` | 2026-09-29 | Go + Playwright 执行器 |
| `frontend/` | 2026-09-29 | React 仪表盘 |
| `agent/core/` | 2026-09-30 | Python LangGraph 工作流（已废弃） |
| `knowledge-graph/` | 2026-09-29 | 需求图谱（已被 `cli/agent/graph/` 取代） |
| `semantic-engine/` | 2026-09-29 | Rust 元素定位引擎 |
| `event-bus/` | 2026-09-29 | Rust 事件总线 |
| `worker-pool/` | 2026-09-29 | Rust 工作池 |
| `db/` | 2026-09-29 | PostgreSQL schema |
| `tests/` | 2026-09-29 | Rust 集成测试 |

`agent/llm/` 是例外——仍被当前 CLI 调用，保留。

---

## 🌐 官网

独立仓库 `open-test-official-website`，最后提交 2026-10-01。

- Vite 8 + React 19 + Tailwind 4，21 个组件，中英双语
- 首页：交互式终端演示、基准测试、架构、资源计算器、模型配置工作室、高管简报工作室等
- 文章页 5 篇：白皮书、规格演进、图谱需求、人话用例、测试报告指南
- `docs/` 下 10 份产品规格

待办：
- `package.json` 仍是脚手架默认名 `react-example` v0.0.0
- `src/lib/llmConfig.ts` + `@google/genai` 依赖：首页模型配置演示会真调 Gemini API，上线前需确认是有意保留还是演示残留

---

## 📝 下一步

1. 实现 HAR / API 录制（见上）
2. 考虑是否删除遗留代码，或移入 `archive/` 分支
3. 官网包名与部署
4. 若需要 docx / OpenAPI 需求输入，将 `knowledge-graph/src/parsers/` 接回 CLI