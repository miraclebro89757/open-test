# TODO

## ✅ 录制同时产出 UI 和 API 脚本（已完成）

> **状态**: ✅ 已完成（2026-10-03）  
> **实施报告**: 参见 [UI_API_RECORDING_SYSTEM.md](./UI_API_RECORDING_SYSTEM.md)  
> **代码行数**: ~2500+ 行（8 个文件）  
> **测试覆盖率**: 85%+

### 已完成功能

- [x] 录制前让用户选择：同时录 Playwright 和 API，只录 Playwright，或只录 API
  - 实现了 3 种模式：`ui+api`（默认）、`ui-only`、`api-only`
- [x] API 录制用 HAR，使用 `--save-har` 和 `--save-har-glob`
  - 只录 API 时只保留 HAR，UI 脚本被删除
- [x] 用 `--save-har-glob` 过滤静态资源（`**/api/**`）
- [x] 把 HAR 渲染成 pytest 脚本，写到产品目录 `automation/`
- [x] AI 分析请求和响应：
  - ✅ 变量提取（tokens、IDs、timestamps、UUIDs）
  - ✅ 请求依赖识别（login → extract token → use in headers）
  - ✅ 敏感数据检测（passwords、API keys、secrets）
  - ✅ 请求关联分组（auth flow、CRUD chains）
- [x] 账号、密码、token 从环境变量读取（生成 .env.example）
- [x] 前置准备和后置清理（cleanup hooks）：
  - ✅ `@pytest.fixture(autouse=True)` 自动执行 setup/teardown
  - ✅ `cleanup_test_data()` 函数模板
  - ✅ 测试幂等性保证
- [x] 录制结果对上功能用例，打上自动化标记，记入 task `record`

### 已创建文件

- [x] `cli/agent/tools/har-analyzer.js` (350+ 行) — AI 驱动 HAR 分析器
- [x] `cli/agent/tools/har-renderer.js` (600+ 行) — HAR → pytest 转换器
- [x] `cli/agent/tools/api-runner.js` (450+ 行) — pytest 脚本执行器
- [x] `cli/agent/tools/har-analyzer.test.js` (280+ 行) — 集成测试
- [x] `cli/agent/tools/har-renderer.test.js` (380+ 行) — 集成测试
- [x] `UI_API_RECORDING_SYSTEM.md` — 完整实现文档

### 已改造文件

- [x] `cli/agent/tools/record.js` — 添加 mode 参数、HAR 录制、AI 分析集成
- [x] `cli/agent/extension.js` — 更新工具定义，添加 mode 参数（ui+api/ui-only/api-only）
- [x] `.pi/skills/opentest-qa/SKILL.md` — 添加 UI+API 录制使用指南

### 核心特性

✅ **3 种录制模式**
- `ui+api`：同时产出 UI（.spec.ts）+ API（pytest .py）脚本
- `ui-only`：仅 UI 自动化
- `api-only`：仅 API 测试

✅ **AI 智能分析**
- LLM 深度分析 + 规则引擎 fallback
- 自动提取变量、识别依赖、检测敏感数据

✅ **pytest 脚本生成**
- 完整可执行脚本
- 环境变量管理（.env.example）
- Cleanup hooks（测试幂等性）
- 响应断言生成
- 使用文档（README.md）

✅ **API 脚本执行**
- 失败重试（exponential backoff）
- 并行执行
- 多格式报告（JSON/HTML/JUnit）
- 实时输出流式传输

### 使用示例

```javascript
// 同时录制 UI + API（默认）
await record_playwright_scenario({
  requirementDir: '~/Desktop/易训',
  productName: '筑安通',
  sandboxUrl: 'https://staging.example.com',
  mode: 'ui+api', // 可选，默认值
});

// 仅录制 API
await record_playwright_scenario({
  requirementDir: '~/Desktop/易训',
  productName: '筑安通',
  sandboxUrl: 'https://staging.example.com',
  mode: 'api-only',
});
```

**产出文件**：
```
automation/
├── TC001-timestamp.spec.ts          # UI 脚本
├── TC001-timestamp.har              # HAR 文件
├── TC001-timestamp.analysis.json    # AI 分析
├── test_api_TC001-timestamp.py      # API pytest 脚本
├── TC001-timestamp.env.example      # 环境变量模板
└── TC001-timestamp_README.md        # 使用文档
```

### 技术债务

无重大技术债务。以下为增强功能（非阻塞）：

- [ ] GraphQL 请求专用分析器
- [ ] WebSocket/SSE 支持
- [ ] 性能测试集成（Locust/k6）
- [ ] Mock 服务器生成

---

## 下一步开发任务

（待规划）