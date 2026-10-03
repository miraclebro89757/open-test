# 录制模式选择指南

OpenTest 支持三种录制模式，可以根据测试需求灵活选择。

## 🎬 录制模式概览

### 1. UI + API（同时录制）🎬 **推荐**

**描述**: 同时录制 UI 脚本（Playwright）和 API 脚本（HAR）

**产出物**:
- ✅ Playwright UI 脚本 (`.spec.ts`)
- ✅ pytest API 脚本 (`test_api_*.py`)
- ✅ HAR 文件 (`.har`)

**适用场景**:
- 完整的端到端测试场景
- 需要 UI 和 API 两种测试视角
- 既要验证界面交互，又要测试后端接口
- 标准的功能测试流程

**优点**:
- 一次录制，双重产出
- 测试覆盖更全面
- UI 和 API 测试相互补充

**示例**:
```javascript
// Agent 中录制
> /record
沙箱地址: https://demo.example.com
选择模式: UI + API (推荐)

// 产出:
automation/
  ├── login-1234.spec.ts      // UI 自动化脚本
  ├── login-1234.har           // HAR 文件
  ├── test_api_login-1234.py  // API 测试脚本
  └── login-1234.env.example  // 环境变量模板
```

---

### 2. UI Only（仅 UI）🖱️

**描述**: 仅录制 UI 操作脚本（Playwright）

**产出物**:
- ✅ Playwright UI 脚本 (`.spec.ts`)

**适用场景**:
- 纯前端交互测试
- 不关注后端接口调用
- 静态页面或单页应用
- 只需要 UI 自动化

**优点**:
- 专注于 UI 层面
- 产出物简洁
- 适合前端测试

**示例**:
```javascript
// Agent 中录制
> /record
沙箱地址: https://demo.example.com
选择模式: UI Only

// 产出:
automation/
  └── login-1234.spec.ts      // 仅 UI 脚本
```

---

### 3. API Only（仅 API）🔌

**描述**: 仅捕获和分析 API 请求（HAR）

**产出物**:
- ✅ pytest API 脚本 (`test_api_*.py`)
- ✅ HAR 文件 (`.har`)

**适用场景**:
- 后端接口测试
- 不需要 UI 自动化
- API 集成测试
- 性能测试准备

**优点**:
- 专注于 API 层面
- 自动分析请求依赖
- 提取变量和认证信息

**示例**:
```javascript
// Agent 中录制
> /record
沙箱地址: https://api.example.com
选择模式: API Only

// 产出:
automation/
  ├── api-test-1234.har           // HAR 文件
  ├── test_api_1234.py            // API 测试脚本
  ├── api-test-1234.analysis.json // 分析结果
  └── api-test-1234.env.example   // 环境变量
```

---

## 📖 使用方法

### 方法 1: Agent 交互式选择（推荐）

在 Agent 中使用 `/record` 命令时，会自动弹出模式选择界面：

```
$ npx open-test run

> /record
沙箱地址: https://demo.example.com

请选择录制模式：
❯ 🎬  UI + API（同时录制） (推荐)
      同时录制 UI 脚本（Playwright）和 API 脚本（HAR）
  🖱️  UI Only（仅 UI）
      仅录制 UI 操作脚本（Playwright）
  🔌  API Only（仅 API）
      仅捕获和分析 API 请求（HAR）
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❓ 查看详细说明
```

### 方法 2: 直接指定模式

Agent 也支持直接在参数中指定模式：

```javascript
// 在 Agent 提示中
> 用 ui+api 模式录制登录场景
> 用 ui-only 模式录制导航交互
> 用 api-only 模式录制接口调用
```

### 方法 3: 工具调用（API）

```javascript
const { recordScenario } = require('./cli/agent/tools/record');

await recordScenario({
  workspace: '/path/to/workspace',
  sandboxUrl: 'https://demo.example.com',
  mode: 'ui+api', // 或 'ui-only', 'api-only'
  // ... 其他参数
});
```

---

## 🎯 如何选择模式？

### 快速决策树

```
需要测试 UI 交互吗？
  ├─ 是 → 需要测试后端接口吗？
  │       ├─ 是 → 选择 UI + API (推荐)
  │       └─ 否 → 选择 UI Only
  └─ 否 → 选择 API Only
```

### 场景对比表

| 场景 | 推荐模式 | 理由 |
|-----|---------|------|
| 登录功能测试 | UI + API | 需要验证界面和接口 |
| 表单交互测试 | UI + API | 完整的提交流程 |
| 导航菜单测试 | UI Only | 纯前端交互 |
| 静态页面测试 | UI Only | 无后端调用 |
| 接口集成测试 | API Only | 不涉及 UI |
| 性能测试准备 | API Only | 关注请求序列 |
| 完整业务流程 | UI + API | 端到端测试 |

---

## 💡 提示和最佳实践

### 1. 默认选择

- ✅ **优先使用 UI + API**：除非明确只需要一种类型的测试
- ✅ **可以混用**：不同场景可以选择不同模式
- ✅ **后期可调整**：录制后可以手动删除不需要的脚本

### 2. 模式别名

为了方便使用，系统支持多种写法：

```javascript
// UI + API 模式
'ui+api'  // 标准写法
'both'    // 别名
'all'     // 别名
'ui-api'  // 别名

// UI Only 模式
'ui-only' // 标准写法
'ui'      // 别名

// API Only 模式
'api-only' // 标准写法
'api'      // 别名
```

### 3. 文件命名

产出物命名规则：

```
UI + API 模式:
  - {caseId}-{timestamp}.spec.ts       // UI 脚本
  - {caseId}-{timestamp}.har           // HAR 文件
  - test_api_{caseId}-{timestamp}.py   // API 脚本

UI Only 模式:
  - {caseId}-{timestamp}.spec.ts       // UI 脚本

API Only 模式:
  - {caseId}-{timestamp}.har           // HAR 文件
  - test_api_{caseId}-{timestamp}.py   // API 脚本
```

### 4. 用例标记

录制完成后，匹配到的功能用例会自动更新：

```markdown
### WEB-LOGIN-001 用户登录

- 步骤：输入用户名和密码，点击登录
- 自动化：是
- 脚本：automation/login-1234.spec.ts，automation/test_api_login-1234.py
```

---

## 🧪 测试和调试

### 测试工具

```bash
# 查看所有模式信息
node test-recording-mode.js info

# 交互式选择模式
node test-recording-mode.js select

# 解析模式字符串
node test-recording-mode.js parse ui+api

# 查看详细帮助
node test-recording-mode.js help

# 预览确认消息
node test-recording-mode.js confirm ui-only
```

### 单元测试

```bash
# 运行模式选择器测试
npm test -- cli/agent/tools/record-mode-selector.test.js
```

---

## ⚙️ 技术细节

### API 接口

```javascript
// 选择录制模式
const { selectRecordingMode } = require('./cli/agent/tools/record-mode-selector');

const mode = await selectRecordingMode({
  hasUI: true,           // 是否有交互界面
  defaultMode: 'ui+api'  // 默认模式
});

// 解析模式字符串
const { parseRecordingMode } = require('./cli/agent/tools/record-mode-selector');

const mode = parseRecordingMode('both'); // 返回 'ui+api'

// 检查模式特性
const { producesUIScript, producesAPIScript } = require('./cli/agent/tools/record-mode-selector');

if (producesUIScript(mode)) {
  // 处理 UI 脚本
}

if (producesAPIScript(mode)) {
  // 处理 API 脚本
}
```

### 模式配置

```javascript
const RECORDING_MODES = {
  'ui+api': {
    label: 'UI + API（同时录制）',
    description: '同时录制 UI 脚本（Playwright）和 API 脚本（HAR）',
    icon: '🎬',
    produces: ['Playwright UI 脚本', 'pytest API 脚本', 'HAR 文件'],
    useCase: '完整测试场景，需要 UI 和 API 两种视角',
    recommended: true,
  },
  // ...
};
```

---

## ❓ 常见问题

### Q: 能否在录制过程中切换模式？

A: 不能。模式在录制开始前选择，录制过程中不可更改。如需其他模式，请重新录制。

### Q: UI + API 模式会生成两个独立的脚本吗？

A: 是的。UI 脚本和 API 脚本是完全独立的，可以单独运行和调试。

### Q: API Only 模式下还需要操作浏览器吗？

A: 是的。录制窗口仍会打开，你需要在浏览器中操作以触发 API 请求。但不会生成 UI 脚本。

### Q: 选择了 UI Only，还能获取 HAR 文件吗？

A: 不能。UI Only 模式不会保存 HAR 文件。如需 HAR，请选择 UI + API 或 API Only。

### Q: 如何知道当前使用的是哪种模式？

A: 录制开始前的确认消息会显示模式，录制完成后的消息也会说明产出物。

### Q: 模式选择会影响录制质量吗？

A: 不会。所有模式使用相同的录制引擎，质量一致。只是产出物不同。

---

## 📚 相关文档

- [录制功能总览](./UI_API_RECORDING_SYSTEM.md)
- [HAR 分析文档](./cli/agent/tools/har-analyzer.js)
- [Playwright 集成](./cli/agent/tools/playwright.js)

---

**提示**: 如有疑问，运行 `node test-recording-mode.js help` 查看交互式帮助文档！
