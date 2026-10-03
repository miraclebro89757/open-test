# TODO

## ✅ 录制同时产出 UI 和 API 脚本

> **状态**: 已完成 · **设计文档**: [UI_API_RECORDING_SYSTEM.md](./UI_API_RECORDING_SYSTEM.md)
> **测试**: `npm test`（`cli/agent/tools/har-analyzer.test.js`、`har-renderer.test.js`、`record.test.js`）

### 交付内容

- [x] 三种录制模式：`ui+api`（默认）、`ui-only`、`api-only`
- [x] HAR 录制用 `--save-har` + `--save-har-glob '**/api/**'` 过滤静态资源
- [x] HAR 分析：变量提取、请求依赖识别、敏感数据检测、请求链分组
- [x] HAR → pytest 脚本，含环境变量模板、cleanup hooks、响应断言
- [x] 录制结果回写用例的自动化标记

### 产出文件

```
automation/
├── TC001-<ts>.spec.ts          # UI 脚本
├── TC001-<ts>.har              # HAR 原始记录
├── TC001-<ts>.analysis.json    # 分析结果（含 source: ai | rules）
├── test_api_TC001-<ts>.py      # API pytest 脚本
├── TC001-<ts>.env.example      # 环境变量模板
└── TC001-<ts>_README.md        # 使用说明
```

### 校准记录（2026-10-03）

本节原先记录「测试覆盖率 85%+」，但两个 HAR 测试文件是用 Jest 风格的
`describe`/`it` 写的，从未接入 `npm test`，单独运行直接
`ReferenceError: describe is not defined`。该结论不成立。已处理：

- 两个测试文件改写为 `node:test` + `node:assert/strict`，共 23 个用例全部通过
- `npm test` 改为 `node --test 'cli/**/*.test.js'`，新增测试文件自动纳入，
  不再依赖手工维护文件清单
- 修复两处继承自旧测试的错误断言（README 用的是 `**Total Requests**:` 加粗格式；
  `VERIFY_SSL` 里的 `"true"` 是合法 Python 字符串而非 JS 布尔值泄漏）

### 同期修复

- [x] `record.js` 对同一份用例连续调用两次 `applyAutomationTags`，第二次会把
      `脚本` 字段覆盖成 API 路径，UI 脚本路径丢失。改为一次调用、传入路径数组，
      输出 `- 脚本：<UI 路径>，<API 路径>`
- [x] `record.js` 的 `llmClient` 取自 `ctx.llmClient`，而 pi 从不提供该字段，
      于是永远走降级分支，文档所称的「AI 分析」实际从未运行。新增
      `cli/agent/tools/llm-client.js`，用 `resolveLLMConfig` + `completeWithFailover`
      构造真实客户端；无可用 profile 时返回 `null`，由分析器退回规则引擎，
      并在结果里用 `source` 字段如实标注

### 后续可做（非阻塞）

- [ ] HAR 分析的规则引擎目前识别不出请求依赖（实测 `dependencies` 为 0），
      token → `Authorization` 这类链路要靠模型才能发现
- [ ] GraphQL 请求专用分析器
- [ ] WebSocket / SSE 支持
- [ ] 性能测试集成（Locust / k6）
- [ ] Mock 服务器生成

---

## ✅ 清理遗留微服务架构

> **状态**: 已完成（2026-10-03）

`cli/` 之外全部是早期微服务架构的遗留，CLI 从不引用。已删除：

- **服务**：`api/`（Go）、`executor/`（Go）、`frontend/`（React）、`agent/`（Python）
- **Rust 组件**：`semantic-engine/`、`event-bus/`、`worker-pool/`、`knowledge-graph/`
- **Rust 集成测试**：`tests/`、`run-tests.sh`、`Makefile`、`test-build.sh`
- **死命令**：`start` `stop` `logs` `status` `test` `init` `upgrade` `changelog`
  （依赖根目录 `docker-compose.yml`）、`cli/commands/{start,status,run,init}.js`、
  `install.js` 里的 cargo 检查
- **编排文件**：根 `docker-compose.yml`、`docker-compose.bench.yml`、`.dockerignore`
- **过时文档**：18 份历史完成报告 / 清单 / 全栈指南
- **配置**：`.npmignore`（`package.json` 的 `files` 存在时它被静默忽略，
  留着只会形成互相矛盾的第二份事实来源）

同步校准：

- `npm test` 去掉 `python3 -m unittest agent.llm.*`，改为纯 Node
- 删掉 JS/Python preset 一致性校验测试（Python 侧已不存在），
  换成两条 catalog 自洽性断言
- `package.json` 新增 `files` 白名单，npm 包从 55 个文件 / 88.7 kB
  降到 44 个文件 / 73.5 kB，且不再打包测试文件
- `.env.example` 去掉已不存在的 Postgres / Redis / Elasticsearch / 前端变量

保留：`cli/`、`.pi/`（`cli/agent/launch.js:28` 运行时加载该技能）、
`schemas/`、`opentest.config.example.json`、`README.md`、`PUBLISHING.md`、`LICENSE`。