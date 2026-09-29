/**
 * Dual-Format Exporter
 * 人机双模态输出器 - 生成人类 Markdown Checklist + 自动化 Automation Spec
 * 
 * 双模态交付:
 * 1. Human Markdown Checklist - 人类测试员可直接执行的清单
 * 2. Automation Spec (JSON/YAML) - 自动化工具可解析的规范
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Markdown Exporter
 * Markdown 格式导出器 - 生成人类可读的测试用例清单
 */
class MarkdownExporter {
  /**
   * Export test case to Markdown format
   * @param {Object} testCase - Test case object
   * @param {Object} validation - Validation result
   * @returns {string} Markdown content
   */
  export(testCase, validation = null) {
    let md = '';

    // Header
    md += `# 测试用例: ${testCase.title}\n\n`;

    // Metadata badges
    md += this.generateBadges(testCase, validation);
    md += '\n\n';

    // Case information
    md += `## 📋 用例信息\n\n`;
    md += `| 项目 | 内容 |\n`;
    md += `|------|------|\n`;
    md += `| **用例编号** | \`${testCase.case_id}\` |\n`;
    md += `| **关联需求** | \`${testCase.requirement_ref}\` |\n`;
    if (testCase.module_ref) {
      md += `| **所属模块** | \`${testCase.module_ref}\` |\n`;
    }
    md += `| **测试维度** | ${this.getAngleEmoji(testCase.angle)} ${testCase.angle} |\n`;
    md += `| **优先级** | ${this.getPriorityBadge(testCase.priority)} |\n`;
    md += `| **执行类型** | ${testCase.execution_type} |\n`;
    md += `| **预计耗时** | ${this.formatDuration(testCase.estimated_duration_seconds)} |\n`;
    md += '\n';

    // Test environment and account
    md += `## 🔧 测试环境与账号\n\n`;
    md += `**环境**: \`${testCase.fixtures.env}\`\n\n`;
    
    md += `**测试账号**:\n`;
    md += `- 用户名: \`${testCase.fixtures.test_account.username}\`\n`;
    md += `- 密码: \`${testCase.fixtures.test_account.password}\`\n`;
    if (testCase.fixtures.test_account.initial_balance) {
      md += `- 初始余额: \`¥${testCase.fixtures.test_account.initial_balance}\`\n`;
    }
    if (testCase.fixtures.test_account.bound_phone) {
      md += `- 绑定手机: \`${testCase.fixtures.test_account.bound_phone}\`\n`;
    }
    md += '\n';

    // Test data payload
    if (testCase.fixtures.test_payload && Object.keys(testCase.fixtures.test_payload).length > 0) {
      md += `**测试数据**:\n`;
      md += '```json\n';
      md += JSON.stringify(testCase.fixtures.test_payload, null, 2);
      md += '\n```\n\n';
    }

    // Preconditions
    md += `## ✅ 前置条件\n\n`;
    md += `> 执行本用例前，请确保以下条件已满足：\n\n`;
    testCase.preconditions.forEach(precondition => {
      md += `- [ ] ${precondition}\n`;
    });
    md += '\n';

    // Test steps
    md += `## 📝 测试步骤\n\n`;
    testCase.steps.forEach((step, index) => {
      md += `### 步骤 ${step.step_no}: ${step.intent}\n\n`;
      
      // Human instruction
      md += `**操作说明**:\n\n`;
      md += `${step.human_instruction}\n\n`;

      // Locators (for reference)
      if (step.locators) {
        md += `**UI 定位**:\n`;
        if (step.locators.visual_anchor) {
          md += `- 视觉锚点: ${step.locators.visual_anchor}\n`;
        }
        if (step.locators.dom_selector) {
          md += `- DOM 选择器: \`${step.locators.dom_selector}\`\n`;
        }
        md += '\n';
      }

      // Expected outcome
      md += `**预期结果**:\n\n`;
      md += `${step.expected_outcome}\n\n`;

      // Checkbox for manual testing
      md += `- [ ] 步骤 ${step.step_no} 执行完成\n`;
      md += `- [ ] 预期结果已验证\n\n`;

      md += '---\n\n';
    });

    // Validation result (if available)
    if (validation) {
      md += `## 🔍 质量评分\n\n`;
      md += `| 指标 | 结果 |\n`;
      md += `|------|------|\n`;
      md += `| **综合评分** | ${validation.score}/100 |\n`;
      md += `| **评级** | ${validation.verdict} |\n`;
      md += `| **验收状态** | ${validation.passed ? '✅ 通过' : '❌ 不通过'} |\n`;
      
      if (validation.total_violations > 0) {
        md += `| **违规项** | ${validation.total_violations} 个 |\n`;
      }
      if (validation.total_warnings > 0) {
        md += `| **警告项** | ${validation.total_warnings} 个 |\n`;
      }
      md += '\n';
    }

    // Footer
    md += `---\n\n`;
    md += `> 📄 本用例符合规范: \`SPEC-AI-HUMAN-READABLE-TESTCASE-002\`\n`;
    md += `> 🤖 由 OpenTest 自动生成\n`;
    if (testCase.metadata && testCase.metadata.generated_at) {
      md += `> 📅 生成时间: ${new Date(testCase.metadata.generated_at).toLocaleString('zh-CN')}\n`;
    }
    md += '\n';

    return md;
  }

  /**
   * Generate badge section
   * @param {Object} testCase - Test case
   * @param {Object} validation - Validation result
   * @returns {string} Badge markdown
   */
  generateBadges(testCase, validation) {
    let badges = '';
    
    // Priority badge
    const priorityColor = {
      'P0': 'critical',
      'P1': 'important',
      'P2': 'normal',
      'P3': 'low'
    }[testCase.priority] || 'normal';
    
    badges += `![Priority](https://img.shields.io/badge/Priority-${testCase.priority}-${priorityColor}) `;
    
    // Angle badge
    const angleBadge = {
      'Functional': '![Functional](https://img.shields.io/badge/Functional-✓-green)',
      'Exception': '![Exception](https://img.shields.io/badge/Exception-⚠-orange)',
      'Security': '![Security](https://img.shields.io/badge/Security-🔒-blue)',
      'Performance': '![Performance](https://img.shields.io/badge/Performance-⚡-yellow)'
    }[testCase.angle] || '';
    
    badges += angleBadge + ' ';
    
    // Validation badge
    if (validation) {
      const validationBadge = validation.passed
        ? '![Validated](https://img.shields.io/badge/Quality-✓_Passed-success)'
        : '![Validation Failed](https://img.shields.io/badge/Quality-✗_Failed-critical)';
      badges += validationBadge;
    }
    
    return badges;
  }

  /**
   * Get angle emoji
   * @param {string} angle - Test angle
   * @returns {string} Emoji
   */
  getAngleEmoji(angle) {
    const emojiMap = {
      'Functional': '✅',
      'Exception': '⚠️',
      'Security': '🔒',
      'Performance': '⚡'
    };
    return emojiMap[angle] || '📋';
  }

  /**
   * Get priority badge
   * @param {string} priority - Priority level
   * @returns {string} Badge text
   */
  getPriorityBadge(priority) {
    const badgeMap = {
      'P0': '🔴 P0 - 关键',
      'P1': '🟠 P1 - 重要',
      'P2': '🟡 P2 - 中等',
      'P3': '🟢 P3 - 较低'
    };
    return badgeMap[priority] || priority;
  }

  /**
   * Format duration
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds} 秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 
      ? `${minutes} 分 ${remainingSeconds} 秒`
      : `${minutes} 分钟`;
  }
}

/**
 * Automation Spec Exporter
 * 自动化规范导出器 - 生成机器可解析的测试规范
 */
class AutomationSpecExporter {
  /**
   * Export test case to automation spec (JSON)
   * @param {Object} testCase - Test case object
   * @returns {Object} Automation spec
   */
  exportJSON(testCase) {
    return {
      version: '1.0',
      spec_compliance: 'SPEC-AI-HUMAN-READABLE-TESTCASE-002',
      
      test_case: {
        id: testCase.case_id,
        title: testCase.title,
        priority: testCase.priority,
        angle: testCase.angle,
        requirement_ref: testCase.requirement_ref,
        module_ref: testCase.module_ref,
        execution_type: testCase.execution_type,
        estimated_duration_seconds: testCase.estimated_duration_seconds
      },

      environment: {
        name: testCase.fixtures.env,
        test_account: testCase.fixtures.test_account,
        test_data: testCase.fixtures.test_payload
      },

      preconditions: testCase.preconditions.map(p => ({
        description: p,
        checkable: true
      })),

      steps: testCase.steps.map(step => ({
        step_number: step.step_no,
        intent: step.intent,
        action: {
          type: this.inferActionType(step.human_instruction),
          instruction: step.human_instruction,
          locators: step.locators || {},
          automation_hint: this.generateAutomationHint(step)
        },
        assertion: {
          description: step.expected_outcome,
          verifiable_elements: this.extractVerifiableElements(step.expected_outcome)
        }
      })),

      metadata: testCase.metadata || {}
    };
  }

  /**
   * Export test case to Playwright script template
   * @param {Object} testCase - Test case object
   * @returns {string} Playwright test code
   */
  exportPlaywright(testCase) {
    let code = '';

    code += `// Test Case: ${testCase.case_id}\n`;
    code += `// ${testCase.title}\n`;
    code += `// Generated by OpenTest\n\n`;

    code += `import { test, expect } from '@playwright/test';\n\n`;

    // Test function
    code += `test('${testCase.title}', async ({ page }) => {\n`;
    code += `  // Environment: ${testCase.fixtures.env}\n`;
    code += `  const baseURL = 'https://staging-02.opentest.com'; // Update as needed\n\n`;

    // Login (if needed)
    if (testCase.fixtures.test_account) {
      code += `  // Login with test account\n`;
      code += `  await page.goto(baseURL + '/login');\n`;
      code += `  await page.fill('input#email', '${testCase.fixtures.test_account.username}');\n`;
      code += `  await page.fill('input#password', '${testCase.fixtures.test_account.password}');\n`;
      code += `  await page.click('button#login-btn');\n`;
      code += `  await page.waitForURL(baseURL + '/dashboard');\n\n`;
    }

    // Test steps
    testCase.steps.forEach((step, index) => {
      code += `  // Step ${step.step_no}: ${step.intent}\n`;
      
      const selector = step.locators?.dom_selector || '[data-testid="action"]';
      const instruction = step.human_instruction.toLowerCase();

      // Infer Playwright action
      if (instruction.includes('点击') || instruction.includes('click')) {
        code += `  await page.click('${selector}');\n`;
      } else if (instruction.includes('输入') || instruction.includes('input') || instruction.includes('填写')) {
        // Extract value to input
        const valueMatch = instruction.match(/['"](.+?)['"]/);
        const value = valueMatch ? valueMatch[1] : 'test_value';
        code += `  await page.fill('${selector}', '${value}');\n`;
      } else if (instruction.includes('等待') || instruction.includes('wait')) {
        code += `  await page.waitForTimeout(2000);\n`;
      } else {
        code += `  // TODO: Implement action for: ${step.human_instruction}\n`;
      }

      // Add assertion
      const outcome = step.expected_outcome;
      if (outcome.includes('跳转') || outcome.includes('redirect')) {
        const urlMatch = outcome.match(/\/[\w\-\/]+/);
        if (urlMatch) {
          code += `  await expect(page).toHaveURL(baseURL + '${urlMatch[0]}');\n`;
        }
      } else if (outcome.includes('显示') || outcome.includes('出现')) {
        const textMatch = outcome.match(/['"](.+?)['"]/);
        if (textMatch) {
          code += `  await expect(page.locator('body')).toContainText('${textMatch[1]}');\n`;
        }
      } else {
        code += `  // TODO: Add assertion for: ${step.expected_outcome}\n`;
      }

      code += '\n';
    });

    code += `});\n`;

    return code;
  }

  /**
   * Export test case to Cypress script template
   * @param {Object} testCase - Test case object
   * @returns {string} Cypress test code
   */
  exportCypress(testCase) {
    let code = '';

    code += `// Test Case: ${testCase.case_id}\n`;
    code += `// ${testCase.title}\n\n`;

    code += `describe('${testCase.title}', () => {\n`;
    code += `  const baseURL = 'https://staging-02.opentest.com';\n\n`;

    code += `  beforeEach(() => {\n`;
    code += `    // Login\n`;
    code += `    cy.visit(baseURL + '/login');\n`;
    code += `    cy.get('input#email').type('${testCase.fixtures.test_account.username}');\n`;
    code += `    cy.get('input#password').type('${testCase.fixtures.test_account.password}');\n`;
    code += `    cy.get('button#login-btn').click();\n`;
    code += `    cy.url().should('include', '/dashboard');\n`;
    code += `  });\n\n`;

    code += `  it('should ${testCase.title}', () => {\n`;

    testCase.steps.forEach((step) => {
      code += `    // Step ${step.step_no}: ${step.intent}\n`;
      
      const selector = step.locators?.dom_selector || '[data-testid="action"]';
      const instruction = step.human_instruction.toLowerCase();

      if (instruction.includes('点击') || instruction.includes('click')) {
        code += `    cy.get('${selector}').click();\n`;
      } else if (instruction.includes('输入')) {
        const valueMatch = instruction.match(/['"](.+?)['"]/);
        const value = valueMatch ? valueMatch[1] : 'test_value';
        code += `    cy.get('${selector}').type('${value}');\n`;
      }

      // Add assertion
      const outcome = step.expected_outcome;
      if (outcome.includes('显示') || outcome.includes('出现')) {
        const textMatch = outcome.match(/['"](.+?)['"]/);
        if (textMatch) {
          code += `    cy.contains('${textMatch[1]}').should('be.visible');\n`;
        }
      }

      code += '\n';
    });

    code += `  });\n`;
    code += `});\n`;

    return code;
  }

  /**
   * Infer action type from instruction
   * @param {string} instruction - Human instruction
   * @returns {string} Action type
   */
  inferActionType(instruction) {
    const lower = instruction.toLowerCase();
    if (lower.includes('点击') || lower.includes('click')) return 'click';
    if (lower.includes('输入') || lower.includes('input') || lower.includes('填写')) return 'input';
    if (lower.includes('选择') || lower.includes('select')) return 'select';
    if (lower.includes('勾选') || lower.includes('check')) return 'checkbox';
    if (lower.includes('等待') || lower.includes('wait')) return 'wait';
    if (lower.includes('刷新') || lower.includes('refresh')) return 'refresh';
    if (lower.includes('打开') || lower.includes('访问') || lower.includes('navigate')) return 'navigate';
    if (lower.includes('验证') || lower.includes('核对') || lower.includes('verify')) return 'verify';
    return 'custom';
  }

  /**
   * Generate automation hint
   * @param {Object} step - Test step
   * @returns {Object} Automation hints
   */
  generateAutomationHint(step) {
    const hints = {
      suggested_timeout: 5000,
      retry_on_failure: true,
      screenshot_on_error: true
    };

    const instruction = (step.human_instruction || '').toLowerCase();
    
    if (instruction.includes('等待') || instruction.includes('wait')) {
      hints.suggested_timeout = 10000;
    }

    if (instruction.includes('短信') || instruction.includes('sms') || instruction.includes('验证码')) {
      hints.may_require_manual_input = true;
      hints.note = 'SMS verification may require manual code input in test environment';
    }

    if (instruction.includes('弹窗') || instruction.includes('modal')) {
      hints.wait_for_element = 'modal';
      hints.suggested_timeout = 3000;
    }

    return hints;
  }

  /**
   * Extract verifiable elements from expected outcome
   * @param {string} outcome - Expected outcome text
   * @returns {Array} Verifiable elements
   */
  extractVerifiableElements(outcome) {
    const elements = [];

    // Extract text in quotes
    const textMatches = outcome.match(/['"](.+?)['"]/g);
    if (textMatches) {
      textMatches.forEach(match => {
        elements.push({
          type: 'text',
          value: match.replace(/['"]/g, ''),
          verification: 'contains'
        });
      });
    }

    // Extract URLs
    const urlMatches = outcome.match(/\/[\w\-\/]+/g);
    if (urlMatches) {
      urlMatches.forEach(url => {
        elements.push({
          type: 'url',
          value: url,
          verification: 'includes'
        });
      });
    }

    // Extract amounts
    const amountMatches = outcome.match(/¥[\d,]+\.?\d*/g);
    if (amountMatches) {
      amountMatches.forEach(amount => {
        elements.push({
          type: 'amount',
          value: amount,
          verification: 'equals'
        });
      });
    }

    // Extract HTTP status codes
    const statusMatches = outcome.match(/\b(200|201|400|401|403|404|500|502|503)\b/g);
    if (statusMatches) {
      statusMatches.forEach(code => {
        elements.push({
          type: 'http_status',
          value: code,
          verification: 'equals'
        });
      });
    }

    return elements;
  }
}

/**
 * Dual-Format Exporter
 * 双模态导出器主类
 */
class DualFormatExporter {
  constructor() {
    this.markdownExporter = new MarkdownExporter();
    this.automationExporter = new AutomationSpecExporter();
  }

  /**
   * Export test case to both formats
   * @param {Object} generatedTestCase - Generated test case with validation
   * @param {Object} options - Export options
   * @returns {Object} Exported content in both formats
   */
  export(generatedTestCase, options = {}) {
    const testCase = generatedTestCase.test_case;
    const validation = generatedTestCase.validation;

    return {
      markdown: this.markdownExporter.export(testCase, validation),
      json: this.automationExporter.exportJSON(testCase),
      playwright: options.include_playwright 
        ? this.automationExporter.exportPlaywright(testCase)
        : null,
      cypress: options.include_cypress
        ? this.automationExporter.exportCypress(testCase)
        : null
    };
  }

  /**
   * Export and save to files
   * @param {Object} generatedTestCase - Generated test case
   * @param {string} outputDir - Output directory
   * @param {Object} options - Export options
   * @returns {Promise<Object>} File paths
   */
  async exportToFiles(generatedTestCase, outputDir, options = {}) {
    await fs.ensureDir(outputDir);

    const testCase = generatedTestCase.test_case;
    const caseId = testCase.case_id;
    const exported = this.export(generatedTestCase, options);

    const files = {};

    // Save Markdown
    const mdPath = path.join(outputDir, `${caseId}.md`);
    await fs.writeFile(mdPath, exported.markdown, 'utf8');
    files.markdown = mdPath;

    // Save JSON
    const jsonPath = path.join(outputDir, `${caseId}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(exported.json, null, 2), 'utf8');
    files.json = jsonPath;

    // Save Playwright (if requested)
    if (exported.playwright) {
      const pwPath = path.join(outputDir, `${caseId}.spec.ts`);
      await fs.writeFile(pwPath, exported.playwright, 'utf8');
      files.playwright = pwPath;
    }

    // Save Cypress (if requested)
    if (exported.cypress) {
      const cyPath = path.join(outputDir, `${caseId}.cy.js`);
      await fs.writeFile(cyPath, exported.cypress, 'utf8');
      files.cypress = cyPath;
    }

    return files;
  }
}

module.exports = {
  DualFormatExporter,
  MarkdownExporter,
  AutomationSpecExporter
};
