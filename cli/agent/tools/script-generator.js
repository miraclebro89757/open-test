/**
 * Test Script Generator
 * 
 * 基于语义动作生成 Playwright 测试脚本。
 * 
 * 生成策略：
 * 1. Semantic Actions → Playwright Code
 * 2. Selector Optimization (优先 testid, aria-label, role)
 * 3. Assertions Generation (基于预期行为)
 * 4. Data Parameterization (识别并参数化测试数据)
 * 
 * @module script-generator
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate Playwright test script from semantic analysis
 * 
 * @param {Object} analysis - Semantic analysis result
 * @param {Object} options
 * @param {string} options.testName - Test function name
 * @param {string} options.baseUrl - Base URL for the test
 * @param {boolean} options.includeAssertions - Generate assertions
 * @param {boolean} options.parameterizeData - Extract data as parameters
 * @returns {Object} Generated script and metadata
 */
function generatePlaywrightScript(analysis, options = {}) {
  const {
    testName = 'test_scenario',
    baseUrl = '',
    includeAssertions = true,
    parameterizeData = true,
  } = options;
  
  const flows = analysis.flows || [];
  const actions = analysis.actions || [];
  
  if (flows.length === 0 && actions.length === 0) {
    throw new Error('No actions found in analysis');
  }
  
  // Use AI-enhanced info if available
  const testIntent = analysis.aiEnhanced?.testIntent || '自动化测试场景';
  const suggestedName = analysis.aiEnhanced?.suggestedTestName || testName;
  
  // Extract test data
  const testData = parameterizeData ? extractTestData(actions) : {};
  
  // Generate test code
  const lines = [];
  
  // Imports
  lines.push("import { test, expect } from '@playwright/test';");
  lines.push('');
  
  // Test data (if extracted)
  if (Object.keys(testData).length > 0) {
    lines.push('// 测试数据');
    lines.push('const testData = {');
    Object.entries(testData).forEach(([key, value]) => {
      lines.push(`  ${key}: '${value}',`);
    });
    lines.push('};');
    lines.push('');
  }
  
  // Test function
  lines.push(`test('${suggestedName}', async ({ page }) => {`);
  lines.push(`  // ${testIntent}`);
  lines.push('');
  
  // Generate code for each flow
  flows.forEach((flow, flowIndex) => {
    lines.push(`  // ${flow.intent}`);
    
    flow.actions.forEach((action, actionIndex) => {
      const code = generateActionCode(action, {
        includeAssertions,
        testData,
        isFirstAction: flowIndex === 0 && actionIndex === 0,
      });
      
      code.forEach(line => {
        lines.push(`  ${line}`);
      });
    });
    
    lines.push('');
  });
  
  // If no flows, generate from actions directly
  if (flows.length === 0) {
    actions.forEach((action, index) => {
      const code = generateActionCode(action, {
        includeAssertions,
        testData,
        isFirstAction: index === 0,
      });
      
      code.forEach(line => {
        lines.push(`  ${line}`);
      });
    });
  }
  
  lines.push('});');
  
  const script = lines.join('\n');
  
  return {
    script,
    testName: suggestedName,
    testData,
    metadata: {
      actionCount: actions.length,
      flowCount: flows.length,
      testIntent,
      hasAssertions: includeAssertions,
      hasTestData: Object.keys(testData).length > 0,
    },
  };
}

/**
 * Generate Playwright code for a single action
 */
function generateActionCode(action, options = {}) {
  const { includeAssertions, testData, isFirstAction } = options;
  const lines = [];
  
  switch (action.type) {
    case 'navigate':
      if (isFirstAction) {
        lines.push(`await page.goto('${action.target}');`);
      } else {
        lines.push(`// 页面跳转到: ${action.target}`);
        lines.push(`await page.waitForURL('${action.target}');`);
      }
      if (includeAssertions) {
        lines.push(`await expect(page).toHaveURL('${action.target}');`);
      }
      break;
      
    case 'click':
      const clickSelector = optimizeSelector(action.selector, action.context);
      lines.push(`// ${action.intent}`);
      lines.push(`await page.click('${clickSelector}');`);
      
      if (includeAssertions) {
        // Add assertion based on intent
        if (action.intent.includes('提交') || action.intent.includes('保存')) {
          lines.push('// TODO: 验证提交成功（根据实际响应调整）');
          lines.push("// await expect(page.locator('.success-message')).toBeVisible();");
        }
      }
      break;
      
    case 'input':
      const inputSelector = optimizeSelector(action.selector, action.context);
      const paramKey = findTestDataKey(action.context, testData);
      const inputValue = paramKey ? `testData.${paramKey}` : `'${action.value}'`;
      
      lines.push(`// ${action.intent}`);
      lines.push(`await page.fill('${inputSelector}', ${inputValue});`);
      break;
      
    case 'form-fill':
      lines.push(`// ${action.intent}`);
      action.fields.forEach(field => {
        const selector = optimizeSelector(field.selector, field);
        const paramKey = findTestDataKey(field, testData);
        const value = paramKey ? `testData.${paramKey}` : `'${field.value}'`;
        lines.push(`await page.fill('${selector}', ${value});`);
      });
      break;
      
    case 'submit':
      lines.push(`// ${action.intent}`);
      lines.push(`await page.click('${optimizeSelector(action.selector, action.context)}');`);
      
      if (includeAssertions) {
        lines.push('// 等待提交响应');
        lines.push('await page.waitForLoadState(\'networkidle\');');
      }
      break;
      
    case 'complex':
    case 'interact-and-fill':
      lines.push(`// ${action.intent}`);
      action.steps.forEach(step => {
        if (step.type === 'click') {
          lines.push(`await page.click('${step.selector}');`);
        } else if (step.type === 'input') {
          const paramKey = findTestDataKey(step, testData);
          const value = paramKey ? `testData.${paramKey}` : `'${step.value}'`;
          lines.push(`await page.fill('${step.selector}', ${value});`);
        }
      });
      break;
      
    default:
      lines.push(`// 未识别的操作类型: ${action.type}`);
  }
  
  return lines;
}

/**
 * Optimize selector for better maintainability
 * 
 * Priority:
 * 1. data-testid
 * 2. aria-label
 * 3. role + name
 * 4. ID
 * 5. Name attribute
 * 6. Original selector
 */
function optimizeSelector(selector, context) {
  if (!context) return selector;
  
  // Prefer data-testid
  if (context.dataset?.testid) {
    return `[data-testid="${context.dataset.testid}"]`;
  }
  
  // Prefer aria-label
  if (context.ariaLabel) {
    return `[aria-label="${context.ariaLabel}"]`;
  }
  
  // Prefer role + text
  if (context.role && context.textContent) {
    const text = context.textContent.trim().substring(0, 30);
    return `role=${context.role}[name="${text}"]`;
  }
  
  // Prefer ID
  if (context.id) {
    return `#${context.id}`;
  }
  
  // Prefer name attribute for form fields
  if (context.name && ['INPUT', 'SELECT', 'TEXTAREA'].includes(context.tagName)) {
    return `[name="${context.name}"]`;
  }
  
  // Fallback to original
  return selector;
}

/**
 * Extract test data from actions
 * 
 * Identifies input values and creates parameterized test data object
 */
function extractTestData(actions) {
  const testData = {};
  let counter = 1;
  
  actions.forEach(action => {
    if (action.type === 'input' && action.value) {
      const fieldName = action.context?.name || 
                       action.context?.placeholder || 
                       action.context?.ariaLabel ||
                       `field${counter++}`;
      
      const key = camelCase(fieldName);
      if (!testData[key]) {
        testData[key] = action.value;
      }
    }
    
    if (action.type === 'form-fill' && action.fields) {
      action.fields.forEach(field => {
        if (field.value) {
          const key = camelCase(field.name || `field${counter++}`);
          if (!testData[key]) {
            testData[key] = field.value;
          }
        }
      });
    }
  });
  
  return testData;
}

/**
 * Find test data key for a field
 */
function findTestDataKey(context, testData) {
  if (!context) return null;
  
  const fieldName = context.name || context.placeholder || context.ariaLabel;
  if (!fieldName) return null;
  
  const key = camelCase(fieldName);
  return testData[key] ? key : null;
}

/**
 * Convert string to camelCase
 */
function camelCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, chr => chr.toLowerCase());
}

/**
 * Generate complete test file with imports and setup
 */
function generateTestFile(analysis, options = {}) {
  const scriptResult = generatePlaywrightScript(analysis, options);
  
  // Generate README
  const readme = generateReadme(analysis, scriptResult, options);
  
  return {
    script: scriptResult.script,
    readme,
    metadata: scriptResult.metadata,
  };
}

/**
 * Generate README for the test
 */
function generateReadme(analysis, scriptResult, options) {
  const lines = [];
  
  lines.push(`# ${scriptResult.testName}`);
  lines.push('');
  lines.push('## 测试说明');
  lines.push('');
  lines.push(analysis.aiEnhanced?.testIntent || '自动生成的测试场景');
  lines.push('');
  
  if (analysis.aiEnhanced?.businessScenario) {
    lines.push('## 业务场景');
    lines.push('');
    lines.push(analysis.aiEnhanced.businessScenario);
    lines.push('');
  }
  
  lines.push('## 测试步骤');
  lines.push('');
  
  if (analysis.aiEnhanced?.steps) {
    analysis.aiEnhanced.steps.forEach(step => {
      lines.push(`${step.step}. ${step.description}`);
    });
  } else {
    analysis.actions.forEach((action, index) => {
      lines.push(`${index + 1}. ${action.intent}`);
    });
  }
  
  lines.push('');
  lines.push('## 测试数据');
  lines.push('');
  
  if (Object.keys(scriptResult.testData).length > 0) {
    lines.push('测试数据已参数化，可在脚本中的 `testData` 对象中修改：');
    lines.push('');
    lines.push('```javascript');
    Object.entries(scriptResult.testData).forEach(([key, value]) => {
      lines.push(`${key}: '${value}'`);
    });
    lines.push('```');
  } else {
    lines.push('无测试数据');
  }
  
  lines.push('');
  lines.push('## 运行测试');
  lines.push('');
  lines.push('```bash');
  lines.push('npx playwright test <test-file>');
  lines.push('```');
  lines.push('');
  
  lines.push('## 元数据');
  lines.push('');
  lines.push(`- 操作数量: ${scriptResult.metadata.actionCount}`);
  lines.push(`- 流程数量: ${scriptResult.metadata.flowCount}`);
  lines.push(`- 生成时间: ${new Date().toISOString()}`);
  lines.push(`- 数据源: ${analysis.source === 'ai' ? 'AI 增强' : '规则引擎'}`);
  
  return lines.join('\n');
}

module.exports = {
  generatePlaywrightScript,
  generateTestFile,
  generateActionCode,
  optimizeSelector,
  extractTestData,
};
