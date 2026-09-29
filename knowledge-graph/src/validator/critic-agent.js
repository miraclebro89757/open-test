/**
 * Critic Agent - Test Case Quality Validator
 * 批判者 Agent - 测试用例质量验证器
 * 
 * 核心职责:
 * 1. 扫描并拦截模糊词汇（"有效数据"、"正常响应"等）
 * 2. 验证测试用例的完整性（Fixtures、步骤、预期结果）
 * 3. 计算质量评分
 * 4. 提供修复建议
 * 
 * 验收标准:
 * - 前置数据完备率: 100%
 * - 步骤动词量化率: 100%
 * - 预期视觉与状态确定性: 100%
 */

/**
 * Banned Fuzzy Words Registry
 * 禁用模糊词库
 */
const BANNED_FUZZY_WORDS = {
  // 模糊数据词汇
  data: [
    '有效的数据', 'valid data', '有效数据',
    '合适的参数', 'appropriate parameters', '合适参数',
    '正常的信息', 'normal information', '正常信息',
    '任意', 'any', 'arbitrary',
    '随便', 'random', 'whatever',
    '某个', 'some', 'a certain',
    '相关', 'related', 'relevant'
  ],

  // 模糊状态词汇
  state: [
    '响应正常', 'response normal', '正常响应',
    '页面平稳', 'page stable', '平稳运行',
    '数据一致', 'data consistent', '一致性',
    '系统正常', 'system normal', '正常运行',
    '运行平稳', 'running smoothly',
    '工作正常', 'working normally'
  ],

  // 模糊动作词汇
  action: [
    '稍后点击', 'click later', '稍后',
    '适当等待', 'wait appropriately', '适当',
    '合理操作', 'reasonable operation', '合理',
    '正确输入', 'enter correctly', '正确',
    '适时', 'timely', 'at the right time'
  ],

  // 模糊结果词汇
  outcome: [
    '操作成功', 'operation successful', '成功',
    '执行完成', 'execution completed', '完成',
    '显示正确', 'display correct', '正确显示',
    '数据正确', 'data correct', '正确',
    '符合预期', 'as expected', '预期'
  ],

  // 模糊量化词汇
  quantifier: [
    '可能', 'maybe', 'might', 'perhaps',
    '大概', 'probably', 'roughly',
    '一般', 'generally', 'usually',
    '合理', 'reasonable',
    '良好', 'good', 'well',
    '适当', 'appropriate',
    '较快', 'relatively fast',
    '较慢', 'relatively slow',
    '应该', 'should',
    '尽量', 'try to',
    '尽可能', 'as much as possible'
  ]
};

/**
 * Quality Check Result
 * 质量检查结果
 */
class QualityCheckResult {
  constructor() {
    this.passed = true;
    this.score = 100;
    this.violations = [];
    this.warnings = [];
    this.suggestions = [];
  }

  /**
   * Add a violation (blocking issue)
   * @param {Object} violation - Violation details
   */
  addViolation(violation) {
    this.passed = false;
    this.violations.push({
      severity: 'BLOCKING',
      ...violation,
      timestamp: new Date().toISOString()
    });
    
    // Deduct score
    this.score -= violation.score_penalty || 20;
  }

  /**
   * Add a warning (non-blocking issue)
   * @param {Object} warning - Warning details
   */
  addWarning(warning) {
    this.warnings.push({
      severity: 'WARNING',
      ...warning,
      timestamp: new Date().toISOString()
    });
    
    // Small score deduction
    this.score -= warning.score_penalty || 5;
  }

  /**
   * Add a suggestion
   * @param {string} suggestion - Suggestion text
   */
  addSuggestion(suggestion) {
    this.suggestions.push(suggestion);
  }

  /**
   * Get final assessment
   * @returns {Object} Assessment summary
   */
  getAssessment() {
    return {
      passed: this.passed && this.score >= 70,
      score: Math.max(0, this.score),
      total_violations: this.violations.length,
      total_warnings: this.warnings.length,
      verdict: this.getVerdict(),
      violations: this.violations,
      warnings: this.warnings,
      suggestions: this.suggestions
    };
  }

  /**
   * Get verdict text
   * @returns {string} Verdict
   */
  getVerdict() {
    if (this.score >= 95) return '优秀 - 工业级人类可执行用例';
    if (this.score >= 85) return '良好 - 基本符合标准';
    if (this.score >= 70) return '及格 - 需要改进';
    if (this.score >= 50) return '不及格 - 存在严重问题';
    return 'AI 废话用例 - 人类无法执行';
  }
}

/**
 * Critic Agent Validator
 * 批判者验证器
 */
class CriticAgent {
  constructor() {
    this.bannedWords = BANNED_FUZZY_WORDS;
  }

  /**
   * Validate a complete test case
   * @param {Object} testCase - Test case to validate
   * @returns {QualityCheckResult} Validation result
   */
  validate(testCase) {
    const result = new QualityCheckResult();

    // Check 1: Fixtures completeness
    this.validateFixtures(testCase, result);

    // Check 2: Preconditions clarity
    this.validatePreconditions(testCase, result);

    // Check 3: Steps quality
    this.validateSteps(testCase, result);

    // Check 4: Fuzzy words detection
    this.detectFuzzyWords(testCase, result);

    // Check 5: Locators completeness
    this.validateLocators(testCase, result);

    // Check 6: Expected outcomes determinism
    this.validateExpectedOutcomes(testCase, result);

    return result;
  }

  /**
   * Validate fixtures completeness
   * @param {Object} testCase - Test case
   * @param {QualityCheckResult} result - Result object
   */
  validateFixtures(testCase, result) {
    if (!testCase.fixtures) {
      result.addViolation({
        type: 'MISSING_FIXTURES',
        message: '缺少 fixtures 配置',
        score_penalty: 30,
        location: 'testCase.fixtures',
        fix_suggestion: '必须提供 fixtures，包含 env、test_account、test_payload'
      });
      return;
    }

    const fixtures = testCase.fixtures;

    // Check environment
    if (!fixtures.env) {
      result.addViolation({
        type: 'MISSING_ENV',
        message: '未指定测试环境（env）',
        score_penalty: 15,
        location: 'fixtures.env',
        fix_suggestion: '必须明确指定测试环境，如 STAGING_ENV_02 或 PRODUCTION'
      });
    }

    // Check test account
    if (!fixtures.test_account) {
      result.addViolation({
        type: 'MISSING_TEST_ACCOUNT',
        message: '未提供测试账号（test_account）',
        score_penalty: 25,
        location: 'fixtures.test_account',
        fix_suggestion: '必须提供具体的测试账号，包含 username、password、initial_balance 等'
      });
    } else {
      const account = fixtures.test_account;
      
      if (!account.username) {
        result.addViolation({
          type: 'MISSING_USERNAME',
          message: '测试账号缺少用户名',
          score_penalty: 15,
          location: 'fixtures.test_account.username'
        });
      }

      if (!account.password) {
        result.addViolation({
          type: 'MISSING_PASSWORD',
          message: '测试账号缺少密码',
          score_penalty: 15,
          location: 'fixtures.test_account.password'
        });
      }

      // Check for fuzzy account descriptions
      if (account.username && account.username.includes('某用户')) {
        result.addViolation({
          type: 'FUZZY_ACCOUNT',
          message: `测试账号使用了模糊描述: "${account.username}"`,
          score_penalty: 20,
          location: 'fixtures.test_account.username',
          fix_suggestion: '必须使用具体的测试账号，如 tester_gold_01@corp.com'
        });
      }
    }

    // Check test payload
    if (fixtures.test_payload && typeof fixtures.test_payload !== 'object') {
      result.addWarning({
        type: 'INVALID_PAYLOAD',
        message: 'test_payload 应该是一个对象',
        score_penalty: 5,
        location: 'fixtures.test_payload'
      });
    }
  }

  /**
   * Validate preconditions clarity
   * @param {Object} testCase - Test case
   * @param {QualityCheckResult} result - Result object
   */
  validatePreconditions(testCase, result) {
    if (!testCase.preconditions || testCase.preconditions.length === 0) {
      result.addWarning({
        type: 'MISSING_PRECONDITIONS',
        message: '缺少前置条件说明',
        score_penalty: 10,
        location: 'testCase.preconditions',
        fix_suggestion: '应明确列出执行本用例前必须满足的初始状态'
      });
      return;
    }

    testCase.preconditions.forEach((precondition, index) => {
      // Check for fuzzy preconditions
      if (typeof precondition === 'string') {
        if (precondition.includes('正常') || precondition.includes('normal')) {
          result.addViolation({
            type: 'FUZZY_PRECONDITION',
            message: `前置条件 #${index + 1} 使用了模糊词汇: "${precondition}"`,
            score_penalty: 10,
            location: `preconditions[${index}]`,
            fix_suggestion: '应使用具体的状态描述，如"账号余额为 ¥1000.00"而非"账号状态正常"'
          });
        }

        if (precondition.length < 10) {
          result.addWarning({
            type: 'VAGUE_PRECONDITION',
            message: `前置条件 #${index + 1} 过于简短: "${precondition}"`,
            score_penalty: 5,
            location: `preconditions[${index}]`,
            fix_suggestion: '前置条件应该详细说明具体的初始状态'
          });
        }
      }
    });
  }

  /**
   * Validate steps quality
   * @param {Object} testCase - Test case
   * @param {QualityCheckResult} result - Result object
   */
  validateSteps(testCase, result) {
    if (!testCase.steps || testCase.steps.length === 0) {
      result.addViolation({
        type: 'MISSING_STEPS',
        message: '缺少测试步骤',
        score_penalty: 40,
        location: 'testCase.steps',
        fix_suggestion: '必须提供详细的测试步骤，每个步骤包含 intent、human_instruction、expected_outcome'
      });
      return;
    }

    testCase.steps.forEach((step, index) => {
      const stepNo = index + 1;

      // Check required fields
      if (!step.intent) {
        result.addViolation({
          type: 'MISSING_INTENT',
          message: `步骤 #${stepNo} 缺少 intent（业务意图）`,
          score_penalty: 10,
          location: `steps[${index}].intent`
        });
      }

      if (!step.human_instruction) {
        result.addViolation({
          type: 'MISSING_INSTRUCTION',
          message: `步骤 #${stepNo} 缺少 human_instruction（人类操作指南）`,
          score_penalty: 15,
          location: `steps[${index}].human_instruction`
        });
      } else {
        // Check instruction quality
        const instruction = step.human_instruction;

        if (instruction.length < 20) {
          result.addWarning({
            type: 'TOO_SHORT_INSTRUCTION',
            message: `步骤 #${stepNo} 的操作指南过于简短（< 20字符）`,
            score_penalty: 5,
            location: `steps[${index}].human_instruction`,
            fix_suggestion: '应提供详细的操作说明，包括具体位置、按钮文字、输入内容'
          });
        }

        // Check for action verbs
        const hasActionVerb = /点击|输入|选择|勾选|拖动|滚动|刷新|等待|打开|关闭|访问/i.test(instruction);
        if (!hasActionVerb) {
          result.addWarning({
            type: 'NO_ACTION_VERB',
            message: `步骤 #${stepNo} 的操作指南缺少明确的动作动词`,
            score_penalty: 5,
            location: `steps[${index}].human_instruction`,
            fix_suggestion: '应使用明确的动词，如"点击"、"输入"、"选择"等'
          });
        }
      }

      if (!step.expected_outcome) {
        result.addViolation({
          type: 'MISSING_EXPECTED_OUTCOME',
          message: `步骤 #${stepNo} 缺少 expected_outcome（预期结果）`,
          score_penalty: 15,
          location: `steps[${index}].expected_outcome`
        });
      }
    });
  }

  /**
   * Detect fuzzy words in test case
   * @param {Object} testCase - Test case
   * @param {QualityCheckResult} result - Result object
   */
  detectFuzzyWords(testCase, result) {
    const textFields = [];

    // Collect all text fields to scan
    if (testCase.title) textFields.push({ field: 'title', text: testCase.title });
    
    if (testCase.preconditions) {
      testCase.preconditions.forEach((p, i) => {
        textFields.push({ field: `preconditions[${i}]`, text: String(p) });
      });
    }

    if (testCase.steps) {
      testCase.steps.forEach((step, i) => {
        if (step.intent) textFields.push({ field: `steps[${i}].intent`, text: step.intent });
        if (step.human_instruction) textFields.push({ field: `steps[${i}].human_instruction`, text: step.human_instruction });
        if (step.expected_outcome) textFields.push({ field: `steps[${i}].expected_outcome`, text: step.expected_outcome });
      });
    }

    // Scan for banned words
    for (const category in this.bannedWords) {
      const words = this.bannedWords[category];
      
      words.forEach(word => {
        textFields.forEach(({ field, text }) => {
          if (text.toLowerCase().includes(word.toLowerCase())) {
            result.addViolation({
              type: 'FUZZY_WORD_DETECTED',
              category: category,
              message: `检测到禁用的模糊词汇: "${word}" 在 ${field}`,
              score_penalty: 15,
              location: field,
              context: this.extractContext(text, word),
              fix_suggestion: this.getFuzzWordFixSuggestion(word, category)
            });
          }
        });
      });
    }
  }

  /**
   * Validate locators completeness
   * @param {Object} testCase - Test case
   * @param {QualityCheckResult} result - Result object
   */
  validateLocators(testCase, result) {
    if (!testCase.steps) return;

    testCase.steps.forEach((step, index) => {
      const stepNo = index + 1;

      if (!step.locators) {
        result.addWarning({
          type: 'MISSING_LOCATORS',
          message: `步骤 #${stepNo} 缺少 locators（UI 定位器）`,
          score_penalty: 5,
          location: `steps[${index}].locators`,
          fix_suggestion: '应提供 visual_anchor 和 dom_selector，帮助测试员快速定位元素'
        });
        return;
      }

      const locators = step.locators;

      if (!locators.visual_anchor) {
        result.addWarning({
          type: 'MISSING_VISUAL_ANCHOR',
          message: `步骤 #${stepNo} 缺少 visual_anchor（视觉锚点）`,
          score_penalty: 3,
          location: `steps[${index}].locators.visual_anchor`
        });
      }

      if (!locators.dom_selector) {
        result.addWarning({
          type: 'MISSING_DOM_SELECTOR',
          message: `步骤 #${stepNo} 缺少 dom_selector（DOM 选择器）`,
          score_penalty: 3,
          location: `steps[${index}].locators.dom_selector`
        });
      }

      // Check for generic selectors
      if (locators.dom_selector && locators.dom_selector === '[data-testid="test-action"]') {
        result.addWarning({
          type: 'GENERIC_SELECTOR',
          message: `步骤 #${stepNo} 使用了通用占位符选择器`,
          score_penalty: 5,
          location: `steps[${index}].locators.dom_selector`,
          fix_suggestion: '应提供具体的 CSS 选择器或 ID'
        });
      }
    });
  }

  /**
   * Validate expected outcomes determinism
   * @param {Object} testCase - Test case
   * @param {QualityCheckResult} result - Result object
   */
  validateExpectedOutcomes(testCase, result) {
    if (!testCase.steps) return;

    testCase.steps.forEach((step, index) => {
      const stepNo = index + 1;

      if (!step.expected_outcome) return;

      const outcome = step.expected_outcome;

      // Check for deterministic elements
      const hasDeterministicElement = (
        outcome.includes('¥') ||           // 具体金额
        outcome.includes('元') ||
        /\d+/.test(outcome) ||            // 数字
        outcome.includes('页面') ||        // 页面/UI元素
        outcome.includes('弹窗') ||
        outcome.includes('按钮') ||
        outcome.includes('Toast') ||
        outcome.includes('Modal') ||
        outcome.includes('跳转') ||        // 页面跳转
        outcome.includes('redirect') ||
        outcome.includes('HTTP') ||       // HTTP状态码
        outcome.includes('200') ||
        outcome.includes('404') ||
        /\.com|\.cn|\.org/.test(outcome) // URL
      );

      if (!hasDeterministicElement) {
        result.addViolation({
          type: 'VAGUE_EXPECTED_OUTCOME',
          message: `步骤 #${stepNo} 的预期结果缺少确定性元素（如具体金额、页面跳转、UI变化）`,
          score_penalty: 15,
          location: `steps[${index}].expected_outcome`,
          context: outcome,
          fix_suggestion: '预期结果必须包含可验证的具体元素：UI文案、数值变化、页面跳转、HTTP状态码等'
        });
      }

      // Check outcome length
      if (outcome.length < 15) {
        result.addWarning({
          type: 'TOO_SHORT_OUTCOME',
          message: `步骤 #${stepNo} 的预期结果过于简短`,
          score_penalty: 5,
          location: `steps[${index}].expected_outcome`,
          fix_suggestion: '应详细描述用户可见的变化'
        });
      }
    });
  }

  /**
   * Extract context around a word
   * @param {string} text - Full text
   * @param {string} word - Word to find
   * @returns {string} Context snippet
   */
  extractContext(text, word) {
    const index = text.toLowerCase().indexOf(word.toLowerCase());
    if (index === -1) return text.substring(0, 50);

    const start = Math.max(0, index - 20);
    const end = Math.min(text.length, index + word.length + 20);
    
    return '...' + text.substring(start, end) + '...';
  }

  /**
   * Get fix suggestion for fuzzy word
   * @param {string} word - Fuzzy word
   * @param {string} category - Word category
   * @returns {string} Fix suggestion
   */
  getFuzzWordFixSuggestion(word, category) {
    const suggestions = {
      data: `请使用具体的测试数据，如 "tester_01@corp.com" 而非 "${word}"`,
      state: `请使用可观测的状态描述，如 "余额显示为 ¥1000.00" 而非 "${word}"`,
      action: `请使用明确的动作指令，如 "点击右下角【提交】按钮" 而非 "${word}"`,
      outcome: `请使用可验证的预期结果，如 "页面显示绿色 Toast：'操作成功'" 而非 "${word}"`,
      quantifier: `请使用确定性的描述，如 "响应时间 < 500ms" 而非 "${word}"`
    };

    return suggestions[category] || `请替换模糊词汇 "${word}" 为具体、可验证的描述`;
  }

  /**
   * Generate quality report
   * @param {QualityCheckResult} result - Validation result
   * @returns {string} Human-readable report
   */
  generateReport(result) {
    const assessment = result.getAssessment();
    
    let report = '========================================\n';
    report += '📋 测试用例质量检查报告\n';
    report += '========================================\n\n';
    
    report += `✨ 综合评分: ${assessment.score}/100\n`;
    report += `📊 评级: ${assessment.verdict}\n`;
    report += `✅ 验收状态: ${assessment.passed ? '通过 ✓' : '不通过 ✗'}\n\n`;

    if (assessment.violations.length > 0) {
      report += `🚫 阻断性问题 (${assessment.violations.length} 项):\n`;
      report += '----------------------------------------\n';
      assessment.violations.forEach((v, i) => {
        report += `${i + 1}. [${v.type}] ${v.message}\n`;
        report += `   位置: ${v.location}\n`;
        if (v.context) report += `   上下文: ${v.context}\n`;
        if (v.fix_suggestion) report += `   修复建议: ${v.fix_suggestion}\n`;
        report += '\n';
      });
    }

    if (assessment.warnings.length > 0) {
      report += `⚠️  警告 (${assessment.warnings.length} 项):\n`;
      report += '----------------------------------------\n';
      assessment.warnings.forEach((w, i) => {
        report += `${i + 1}. [${w.type}] ${w.message}\n`;
        report += `   位置: ${w.location}\n`;
        if (w.fix_suggestion) report += `   建议: ${w.fix_suggestion}\n`;
        report += '\n';
      });
    }

    if (assessment.suggestions.length > 0) {
      report += '💡 改进建议:\n';
      report += '----------------------------------------\n';
      assessment.suggestions.forEach((s, i) => {
        report += `${i + 1}. ${s}\n`;
      });
      report += '\n';
    }

    if (assessment.passed) {
      report += '========================================\n';
      report += '✨ 恭喜！这是一份工业级人类可执行用例！\n';
      report += '========================================\n';
    } else {
      report += '========================================\n';
      report += '❌ 请修复上述问题后重新提交验证\n';
      report += '========================================\n';
    }

    return report;
  }
}

module.exports = {
  CriticAgent,
  QualityCheckResult,
  BANNED_FUZZY_WORDS
};
