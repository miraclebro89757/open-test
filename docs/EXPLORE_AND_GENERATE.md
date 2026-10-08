# Explore and Generate - 浏览器探索与脚本生成

## 概述

Explore and Generate 是 OpenTest 的核心自动化功能之一，实现了"人录制一遍，Agent 自动探索并形成脚本"的理念。

### 核心特性

- **原始事件捕获**：完整记录用户在浏览器中的所有操作
- **语义动作提取**：将原始事件转换为有业务含义的测试步骤
- **智能脚本生成**：生成可维护的 Playwright 测试脚本
- **AI 增强分析**：可选的 LLM 支持，提升分析质量

## 架构设计

根据规划文档 Section 36-39，系统分为三层：

```
Raw Event → Semantic Action → Test Step
```

### 1. Browser Explore（原始事件捕获）

捕获用户操作的完整轨迹：

- **交互事件**：click, input, change, submit, keydown...
- **上下文信息**：元素选择器、属性、文本内容
- **辅助数据**：截图、网络请求、控制台消息
- **时间序列**：精确的时间戳和事件顺序

#### 捕获的事件类型

```javascript
const TRACKABLE_EVENTS = [
  'click',      // 点击
  'dblclick',   // 双击
  'input',      // 输入
  'change',     // 值变化
  'keydown',    // 键盘按下
  'submit',     // 表单提交
  'focus',      // 获得焦点
  'blur',       // 失去焦点
];
```

#### 事件数据结构

```javascript
{
  "id": 1,
  "type": "click",
  "timestamp": 1696752000000,
  "url": "https://example.com/login",
  "selector": "#login-button",
  "context": {
    "tagName": "BUTTON",
    "textContent": "登录",
    "ariaLabel": "Login",
    "role": "button",
    "className": "btn btn-primary",
    "id": "login-button"
  },
  "coordinates": {
    "x": 450,
    "y": 300
  }
}
```

### 2. Semantic Action（语义动作提取）

将原始事件转换为有意义的测试动作：

#### 事件分组策略

- **时间窗口**：2 秒内的相关事件合并为一个动作
- **上下文相关性**：同一元素或同一表单的操作合并
- **业务含义**：识别完整的业务操作（如"填写登录表单"）

#### 动作类型

| 动作类型 | 说明 | 示例 |
|---------|------|------|
| `navigate` | 页面导航 | 进入登录页 |
| `click` | 点击操作 | 点击提交按钮 |
| `input` | 单个输入 | 输入用户名 |
| `form-fill` | 填写表单 | 填写注册信息 |
| `submit` | 提交表单 | 提交登录 |
| `complex` | 复杂交互 | 多步骤操作 |

#### 意图识别

基于元素上下文自动推断操作意图：

```javascript
// 按钮文本识别
"提交" / "Submit" → "提交表单"
"取消" / "Cancel" → "取消操作"
"删除" / "Delete" → "删除数据"
"创建" / "Create" → "创建新数据"

// 表单字段识别
name="username" → "输入：username"
placeholder="邮箱" → "输入：邮箱"
```

#### 用户流程识别

将语义动作组织成完整的用户流程：

```javascript
{
  "id": "flow-1",
  "intent": "用户登录流程",
  "duration": 3000,
  "actions": [
    { "type": "navigate", "intent": "进入登录页" },
    { "type": "form-fill", "intent": "填写登录表单" },
    { "type": "click", "intent": "点击登录按钮" }
  ]
}
```

### 3. Script Generator（测试脚本生成）

生成可维护的 Playwright 测试脚本：

#### 选择器优化策略

优先级排序（从高到低）：

1. `data-testid` - 最稳定
2. `aria-label` - 语义化
3. `role + text` - 可读性强
4. `id` - 简洁
5. `name` 属性 - 表单专用
6. 原始选择器 - 兜底

#### 测试数据参数化

自动提取输入值并参数化：

```javascript
// 原始事件
input: { selector: '#username', value: 'testuser' }

// 生成代码
const testData = {
  username: 'testuser'
};
await page.fill('#username', testData.username);
```

#### 断言生成

基于操作意图自动添加断言：

```javascript
// 导航操作 → URL 断言
await page.goto('https://example.com/login');
await expect(page).toHaveURL('https://example.com/login');

// 提交操作 → 成功消息断言
await page.click('[data-testid="submit"]');
// TODO: 验证提交成功（根据实际响应调整）
// await expect(page.locator('.success-message')).toBeVisible();
```

## AI 增强分析

当配置了 LLM 时，系统会进行 AI 增强分析：

### 增强内容

- **测试意图识别**：理解用户想测试什么功能
- **业务场景描述**：将技术操作映射到业务场景
- **测试步骤优化**：生成更符合业务语言的步骤描述
- **测试用例命名**：建议更有意义的测试名称

### 示例

```javascript
// AI 增强结果
{
  "testIntent": "测试用户登录功能，验证正常登录流程",
  "businessScenario": "用户使用正确的用户名和密码登录系统",
  "steps": [
    { "step": 1, "description": "访问登录页面" },
    { "step": 2, "description": "输入有效的登录凭证" },
    { "step": 3, "description": "点击登录按钮提交" },
    { "step": 4, "description": "验证跳转到用户仪表盘" }
  ],
  "suggestedTestName": "test_user_normal_login"
}
```

## 使用方式

### 1. Agent 工具调用

在 Pi Agent 中使用 `explore_and_generate` 工具：

```javascript
{
  "tool": "explore_and_generate",
  "parameters": {
    "sandboxUrl": "https://test.example.com",  // 可选，自动解析
    "requirementDir": "./requirements",
    "productName": "产品名称",
    "caseId": "TC-001",                       // 可选，用例 ID
    "headless": false,                        // 是否无头模式
    "timeout": 900000                         // 超时时间（默认 15 分钟）
  }
}
```

### 2. 命令行快捷方式

未来可通过 CLI 命令快速使用：

```bash
# 开始探索（将集成到 /record 命令）
npx open-test explore https://example.com

# 指定用例 ID
npx open-test explore --case TC-001
```

### 3. 交互式流程

```
1. Agent 启动浏览器
2. 用户在浏览器中完成操作
3. 用户关闭浏览器窗口
4. Agent 自动分析
5. 生成测试脚本和文档
```

## 输出产物

每次探索会生成完整的测试资产：

```
automation/
└── TC001-1696752000000/
    ├── session.json           # 原始会话数据
    ├── events.json            # 事件列表
    ├── analysis.json          # 语义分析结果
    ├── screenshot-1.png       # 关键截图
    ├── screenshot-2.png
    └── video/                 # 录制视频

TC001-1696752000000.spec.ts   # Playwright 测试脚本
TC001-1696752000000_README.md # 测试说明文档
TC001-1696752000000_summary.json # 执行摘要
```

### 测试脚本示例

```typescript
import { test, expect } from '@playwright/test';

// 测试数据
const testData = {
  username: 'testuser',
  password: 'password123',
};

test('test_user_login', async ({ page }) => {
  // 测试用户登录功能
  
  // 用户登录流程
  await page.goto('https://example.com/login');
  await expect(page).toHaveURL('https://example.com/login');
  
  // 填写登录表单
  await page.fill('[data-testid="username"]', testData.username);
  await page.fill('[data-testid="password"]', testData.password);
  
  // 提交登录
  await page.click('role=button[name="登录"]');
  
  // 验证登录成功
  await page.waitForURL('https://example.com/dashboard');
  await expect(page).toHaveURL('https://example.com/dashboard');
});
```

### 说明文档示例

```markdown
# test_user_login

## 测试说明

测试用户登录功能，验证正常登录流程

## 业务场景

用户使用正确的用户名和密码登录系统

## 测试步骤

1. 访问登录页面
2. 输入有效的登录凭证
3. 点击登录按钮提交
4. 验证跳转到用户仪表盘

## 测试数据

测试数据已参数化，可在脚本中的 `testData` 对象中修改：

\```javascript
username: 'testuser'
password: 'password123'
\```

## 运行测试

\```bash
npx playwright test TC001-1696752000000.spec.ts
\```

## 元数据

- 操作数量: 4
- 流程数量: 1
- 生成时间: 2026-10-08T10:30:00.000Z
- 数据源: AI 增强
```

## 技术实现

### 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| Browser Explore | `browser-explore.js` | 原始事件捕获 |
| Semantic Action | `semantic-action.js` | 语义动作提取 |
| Script Generator | `script-generator.js` | 测试脚本生成 |
| Orchestrator | `explore-and-generate.js` | 流程编排 |

### 依赖关系

```
explore-and-generate.js
├── browser-explore.js
│   └── playwright
├── semantic-action.js
│   └── llmClient (可选)
└── script-generator.js
```

### 事件追踪机制

通过 `page.addInitScript()` 注入客户端追踪代码：

```javascript
// 注入到页面的追踪脚本
window.__opentestEvents = [];

document.addEventListener('click', (e) => {
  window.__opentestEvents.push({
    type: 'click',
    timestamp: Date.now(),
    selector: getElementSelector(e.target),
    context: getElementContext(e.target)
  });
}, true);

// Agent 定期收集
setInterval(() => {
  const events = page.evaluate(() => {
    const events = window.__opentestEvents;
    window.__opentestEvents = [];
    return events;
  });
}, 1000);
```

## 与现有功能的关系

### 与 record_playwright_scenario 的区别

| 特性 | record (旧) | explore (新) |
|------|------------|-------------|
| 录制方式 | Playwright Codegen | 自定义事件追踪 |
| 输出 | 原始录制脚本 | 语义化测试脚本 |
| 选择器 | 自动生成 | 智能优化 |
| 测试数据 | 硬编码 | 自动参数化 |
| 文档 | 无 | 自动生成 |
| AI 分析 | 无 | 可选支持 |

### 未来集成方向

1. **合并到 /record 命令**
   - 提供模式选择：传统录制 vs 智能探索
   - 默认推荐智能探索模式

2. **与测试用例关联**
   - 自动匹配 test case
   - 更新自动化标记

3. **与 HAR 分析集成**
   - 同时捕获 API 请求
   - UI + API 双脚本生成

## 测试

### 单元测试

```bash
npm test -- cli/agent/tools/explore-and-generate.test.js
```

测试覆盖：
- ✅ 事件分组逻辑
- ✅ 语义动作提取
- ✅ 选择器优化
- ✅ 测试数据提取
- ✅ 脚本生成
- ✅ 流程识别

### 集成测试

```bash
# 使用模拟数据测试完整流程
node test-explore.js mock

# 测试语义分析
node test-explore.js semantic

# 测试脚本生成
node test-explore.js generate

# 演示（需要实际浏览器操作）
node test-explore.js demo
```

## 最佳实践

### 1. 操作建议

- **一次完整流程**：从头到尾完成一个完整的业务场景
- **自然操作**：按照真实用户的方式操作，不要太快
- **关键等待**：等待页面完全加载后再继续
- **避免重复**：同样的操作不要重复录制

### 2. 选择器建议

鼓励开发团队添加测试标识：

```html
<!-- 推荐 -->
<button data-testid="submit-button">提交</button>
<input aria-label="用户名" />

<!-- 避免 -->
<div class="btn-xyz-123">提交</div>
```

### 3. 测试数据处理

敏感数据建议：
- 录制时使用测试账号
- 生成后手动审查 testData
- 不要提交真实密码到版本控制

### 4. 脚本维护

生成的脚本是起点，不是终点：
- 添加更多断言
- 补充错误处理
- 提取公共函数
- 添加注释说明

## 未来规划

### 短期（MVP）

- [x] 原始事件捕获
- [x] 语义动作提取
- [x] 脚本生成
- [x] AI 增强分析
- [ ] 集成到 /record 命令
- [ ] 与 test case 关联

### 中期

- [ ] 智能等待识别
- [ ] 错误处理生成
- [ ] 数据驱动测试支持
- [ ] 断言智能建议
- [ ] Page Object 模式支持

### 长期

- [ ] 跨页面流程识别
- [ ] 复杂交互模式识别
- [ ] 自动化脚本重构建议
- [ ] 测试覆盖率分析
- [ ] 持续学习优化

## 相关文档

- [规划文档](./1008plan.md) - Section 36-39: Browser Explore
- [录制模式](../RECORDING_MODES.md) - 录制模式选择
- [沙箱配置](../README.md#沙箱配置) - URL 配置管理

## 总结

Explore and Generate 实现了从"人录制一遍"到"Agent 生成脚本"的完整流程，是 OpenTest 迈向 QA Agent 的关键一步。它不仅仅是录制工具，而是一个理解用户意图、生成可维护测试的智能系统。
