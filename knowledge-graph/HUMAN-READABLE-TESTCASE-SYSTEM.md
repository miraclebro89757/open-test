# 工业级人类可执行测试用例生成系统

**规范**: SPEC-AI-HUMAN-READABLE-TESTCASE-002 v1.0.0-GA  
**状态**: ✅ 已完成  
**完成时间**: 2024-09-29

---

## 📋 系统概述

本系统实现了从 Neo4j 需求图谱到工业级人类可执行测试用例的完整 **5 级流水线**，彻底终结 AI 生成的"废话用例"。

### 核心目标

让一个**刚入职第一天、对项目一无所知的新人测试员**，拿到生成的用例后能在 **60 秒内开始执行**，并且全程不需要询问任何问题！

### 5 级流水线架构

```
┌─────────────────────────────────────────────────────────────────┐
│ Level 1: Neo4j 测试图谱提取                                        │
│ 提取: TestPoint -> Requirement -> Module                        │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Level 2: 数据装置映射器 (FixtureResolver)                         │
│ 注入: 测试账号、环境配置、测试数据                                │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Level 3: 三层人类可读展开器 (StepExpander)                        │
│ 展开: Intent + Human Instruction + Expected Outcome             │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Level 4: 批判者 Agent 验证门禁 (CriticAgent)                      │
│ 扫描: 模糊词汇、质量评分、修复建议                                │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Level 5: 人机双模态输出器 (DualFormatExporter)                    │
│ 输出: Markdown + JSON + Playwright + Cypress                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 1. 运行完整演示

```bash
cd knowledge-graph
npm install
node examples/e2e-test-case-generation.js
```

**输出**:
- ✅ 完整的 5 级流水线执行过程
- ✅ 生成的测试用例文件（Markdown + JSON + Playwright + Cypress）
- ✅ 质量评分报告

### 2. 批量生成演示

```bash
node examples/e2e-test-case-generation.js batch
```

### 3. 质量门禁演示

```bash
node examples/e2e-test-case-generation.js quality
```

查看批判者 Agent 如何拦截 AI 废话用例。

---

## 📁 项目结构

```
knowledge-graph/
├── src/
│   ├── fixtures/
│   │   └── resolver.js            # Level 2: 数据装置管理器
│   ├── expander/
│   │   └── step-expander.js       # Level 3: 三层步骤展开器
│   ├── validator/
│   │   └── critic-agent.js        # Level 4: 批判者验证器
│   ├── generator/
│   │   └── test-case-generator.js # 核心生成引擎
│   └── exporter/
│       └── dual-format-exporter.js # Level 5: 双模态输出器
│
├── prompts/
│   ├── test-case-writer-agent.md  # Agent System Prompt
│   └── few-shot-examples.json     # Few-Shot 示例
│
├── examples/
│   └── e2e-test-case-generation.js # 端到端演示
│
└── output/                         # 生成的测试用例输出目录
```

---

## 💡 核心组件详解

### Level 1: Neo4j 图谱提取

**职责**: 从 Neo4j 数据库中提取测试点、需求、模块的完整信息。

**关键数据**:
- TestPoint: 测试点（含维度 angle: Functional/Exception/Security/Performance）
- Requirement: 需求（含 Given-When-Then）
- Module: 模块

### Level 2: FixtureResolver (数据装置管理器)

**职责**: 为测试用例注入确定性的测试数据，消除"有效数据"、"某用户"等模糊表达。

**管理三类 Registry**:

1. **TestAccountRegistry** - 测试账号池
   ```javascript
   {
     username: "tester_gold_01@corp.com",
     password: "Password#2026",
     initial_balance: "1000.00",
     bound_phone: "13800138000",
     member_level: "gold"
   }
   ```

2. **EnvironmentRegistry** - 环境配置
   ```javascript
   {
     name: "STAGING_ENV_02",
     base_url: "https://staging-02.opentest.com",
     api_base_url: "https://api-staging-02.opentest.com"
   }
   ```

3. **TestDataTemplateRegistry** - 测试数据模板
   ```javascript
   {
     template_id: "TPL_PAYMENT_SMS_2FA",
     scenario: "payment_with_sms",
     test_payload: {
       item_id: "SKU_LAPTOP_PRO",
       item_price: "100.00",
       mock_sms_code: "902188"
     }
   }
   ```

### Level 3: StepExpander (三层步骤展开器)

**职责**: 将抽象测试点展开为人类可执行的详细步骤。

**三层结构**:

```javascript
{
  step_no: 1,
  
  // Layer 1: Intent (业务意图)
  intent: "进入结算台并提交订单",
  
  // Layer 2: Human Instruction (人类操作指南)
  human_instruction: "在页面顶部点击【购物车图标】，在展开的抽屉中点击右下角绿色【去结算】按钮...",
  
  // Layer 3: Expected Outcome (可验证预期)
  expected_outcome: "页面居中弹出【短信二次验证码】弹窗，弹窗内文案显示：'验证码已发送至 138****8000'"
}
```

**内置场景模板**:
- ✅ 支付 SMS 2FA 场景
- ✅ 登录场景
- ✅ 余额不足异常
- ✅ 验证码错误异常
- ✅ 超时异常
- ✅ 认证安全测试
- ✅ 越权安全测试
- ✅ 注入安全测试
- ✅ 性能测试

### Level 4: CriticAgent (批判者验证器)

**职责**: 质量门禁，拦截任何模糊词汇和不合格用例。

**5 大类禁用词库** (50+ 词汇):
- ❌ **Data**: "有效数据"、"合适参数"、"某用户"
- ❌ **State**: "响应正常"、"系统正常"、"数据一致"
- ❌ **Action**: "稍后点击"、"适当等待"
- ❌ **Outcome**: "操作成功"、"执行完成"
- ❌ **Quantifier**: "可能"、"大概"、"应该"、"尽量"

**6 项质量检查**:
1. ✅ Fixtures 完整性（账号、环境、数据）
2. ✅ Preconditions 清晰度
3. ✅ Steps 质量（intent + instruction + outcome）
4. ✅ 模糊词汇检测
5. ✅ Locators 完整性（visual_anchor + dom_selector）
6. ✅ ExpectedOutcomes 确定性（UI变化 + 数据变更）

**评分系统**:
- 100 分制
- < 70 分: ❌ 不通过
- 70-84 分: 及格
- 85-94 分: 良好
- 95+ 分: ✨ 优秀（工业级标准）

### Level 5: DualFormatExporter (双模态输出器)

**职责**: 生成人类可读和机器可解析的双格式输出。

**4 种输出格式**:

1. **Markdown Checklist** - 人类可执行清单
   - 📋 徽章、元数据表格
   - ✅ 前置条件复选框
   - 📝 详细步骤（含 UI 定位）
   - 🔍 质量评分

2. **JSON Automation Spec** - 机器可解析规范
   - 结构化测试用例数据
   - 可验证元素提取
   - 自动化提示

3. **Playwright 脚本** - TypeScript 测试代码
   - 自动推断操作类型
   - 生成断言代码

4. **Cypress 脚本** - Cypress 测试代码
   - 完整的测试脚本
   - 钩子函数

---

## 🎯 使用示例

### 示例 1: 单个测试点生成

```javascript
const { TestCaseGenerator } = require('./src/generator/test-case-generator');
const { DualFormatExporter } = require('./src/exporter/dual-format-exporter');

// 从 Neo4j 生成
const generator = new TestCaseGenerator();
const generated = await generator.generateFromTestPoint('TP-PAY-2FA-001');

// 导出为多种格式
const exporter = new DualFormatExporter();
const files = await exporter.exportToFiles(
  generated,
  './output',
  { include_playwright: true, include_cypress: true }
);

console.log('生成的文件:', files);
// 输出:
// {
//   markdown: './output/CASE-PAY-02-FUNC-328.md',
//   json: './output/CASE-PAY-02-FUNC-328.json',
//   playwright: './output/CASE-PAY-02-FUNC-328.spec.ts',
//   cypress: './output/CASE-PAY-02-FUNC-328.cy.js'
// }
```

### 示例 2: 需求级批量生成

```javascript
// 为整个需求生成所有测试用例
const testCases = await generator.generateForRequirement('REQ-PAY-02');

console.log(`生成了 ${testCases.length} 个测试用例`);
testCases.forEach(tc => {
  console.log(`- ${tc.test_case.case_id}: ${tc.validation.score}/100`);
});
```

### 示例 3: 模块级批量生成

```javascript
// 为整个模块生成所有测试用例
const testCases = await generator.generateForModule('MOD_PAYMENT');

const batchReport = generator.generateBatchReport({
  total: testCases.length,
  succeeded: testCases.filter(tc => tc.validation.passed).length,
  // ...
});

console.log(batchReport);
```

### 示例 4: 质量验证

```javascript
const { CriticAgent } = require('./src/validator/critic-agent');

const critic = new CriticAgent();
const validationResult = critic.validate(testCase);

if (!validationResult.passed) {
  console.log('❌ 用例质量不合格:');
  console.log(critic.generateReport(validationResult));
}
```

---

## 📊 质量标准

### ✅ 优秀用例（95+ 分）的特征

1. **数据完备** - 提供具体测试账号、密码、余额
2. **步骤明确** - 指明具体位置、按钮文字、输入内容
3. **预期清晰** - 包含 UI 变化、数据变更、页面跳转
4. **无模糊词** - 零容忍"有效"、"正常"、"成功"等空洞词汇

### ❌ 不合格用例（< 70 分）的特征

1. **模糊数据** - "某用户"、"有效信息"
2. **抽象步骤** - "执行操作"、"输入数据"
3. **空洞预期** - "操作成功"、"数据正确"
4. **缺失 Fixtures** - 没有测试账号或测试数据

---

## 🔧 配置与扩展

### 添加新的测试账号

```javascript
const { getFixtureResolver } = require('./src/fixtures/resolver');

const resolver = getFixtureResolver();
resolver.accountRegistry.register({
  env: 'STAGING_ENV_02',
  username: 'tester_vip_01@corp.com',
  password: 'VIP#2026',
  role: 'vip_member',
  initial_balance: '5000.00',
  member_level: 'vip'
});
```

### 添加新的场景模板

```javascript
resolver.dataTemplateRegistry.register({
  template_id: 'TPL_REFUND',
  scenario: 'refund',
  description: '退款场景',
  test_payload: {
    order_id: 'ORD_TEST_001',
    refund_amount: '100.00',
    refund_reason: '不想要了'
  }
});
```

### 扩展步骤展开器

在 `src/expander/step-expander.js` 中添加新的场景模板：

```javascript
expandRefundSteps(testPoint, requirement, fixtures) {
  return [
    {
      step_no: 1,
      intent: '进入订单详情页',
      human_instruction: '...',
      expected_outcome: '...'
    },
    // ...
  ];
}
```

---

## 📖 Agent Prompt 使用

### 使用 System Prompt

将 `prompts/test-case-writer-agent.md` 的内容作为 AI Agent 的 System Prompt：

```javascript
const systemPrompt = await fs.readFile(
  './prompts/test-case-writer-agent.md',
  'utf8'
);

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '根据需求 REQ-PAY-02 生成测试用例' }
  ]
});
```

### 使用 Few-Shot Examples

```javascript
const examples = require('./prompts/few-shot-examples.json');

// 构建 few-shot prompt
const fewShotMessages = examples.examples.map(ex => [
  { role: 'user', content: JSON.stringify(ex.input) },
  { role: 'assistant', content: JSON.stringify(ex.output) }
]).flat();
```

---

## 🧪 测试

运行端到端演示：

```bash
# 完整演示
npm run demo

# 或直接运行
node examples/e2e-test-case-generation.js
```

---

## 📝 输出示例

### Markdown 输出示例

```markdown
# 测试用例: 已绑定手机号的黄金会员，在购物车完成结算时正确触发并核销 6 位短信 2FA

![Priority](https://img.shields.io/badge/Priority-P0-critical) ![Functional](https://img.shields.io/badge/Functional-✓-green) ![Validated](https://img.shields.io/badge/Quality-✓_Passed-success)

## 📋 用例信息

| 项目 | 内容 |
|------|------|
| **用例编号** | `CASE-PAY-02-FUNC-328` |
| **关联需求** | `REQ-PAY-02@v2.0` |
| **测试维度** | ✅ Functional |
| **优先级** | 🔴 P0 - 关键 |
| **预计耗时** | 45 秒 |

## 🔧 测试环境与账号

**环境**: `STAGING_ENV_02`

**测试账号**:
- 用户名: `tester_gold_01@corp.com`
- 密码: `Password#2026`
- 初始余额: `¥1000.00`

## ✅ 前置条件

- [ ] 1. 测试账号 tester_gold_01@corp.com 已处于登录状态
- [ ] 2. 账号钱包当前可用余额确认 >= ¥1000.00
- [ ] 3. 购物车内已添加 1 件 SKU_LAPTOP_PRO (单价 ¥100.00)

## 📝 测试步骤

### 步骤 1: 进入结算台并提交订单

**操作说明**:

在页面顶部点击【购物车图标】，在展开的抽屉中点击右下角绿色【去结算】按钮...

**预期结果**:

页面居中弹出【短信二次验证码】弹窗，文案显示：'验证码已发送至 138****8000'

- [ ] 步骤 1 执行完成
- [ ] 预期结果已验证

---
```

### JSON 输出示例

```json
{
  "version": "1.0",
  "spec_compliance": "SPEC-AI-HUMAN-READABLE-TESTCASE-002",
  "test_case": {
    "id": "CASE-PAY-02-FUNC-328",
    "title": "已绑定手机号的黄金会员...",
    "priority": "P0",
    "angle": "Functional"
  },
  "environment": {
    "name": "STAGING_ENV_02",
    "test_account": {
      "username": "tester_gold_01@corp.com",
      "password": "Password#2026"
    }
  },
  "steps": [...]
}
```

---

## 🎓 设计原则

### 1. 零容忍模糊词汇

任何"有效"、"正常"、"成功"等空洞词汇都会被 CriticAgent 拦截。

### 2. 数据装置先行

所有测试数据必须在 Fixtures 中提前声明，不允许凭空编造。

### 3. 三层结构强制

每个步骤必须包含 Intent（为什么）、Instruction（怎么做）、Outcome（看到什么）。

### 4. 人类可读优先

生成的用例必须让零背景的新人也能流畅执行。

### 5. 机器可解析兼顾

同时输出结构化数据，支持自动化工具解析。

---

## 📚 相关文档

- [规范文档](./HUMAN-READABLE-TEST-AGENT-SPEC.md) - SPEC-AI-HUMAN-READABLE-TESTCASE-002
- [Agent Prompt](./prompts/test-case-writer-agent.md) - System Prompt 完整版
- [Few-Shot Examples](./prompts/few-shot-examples.json) - 示例库

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

特别欢迎:
- 新的场景模板
- 更多的测试账号配置
- 更丰富的模糊词库
- 新的输出格式

---

## 📄 License

Apache 2.0

---

**Status**: ✅ 生产就绪  
**Version**: 1.0.0  
**Last Updated**: 2024-09-29

