/**
 * Test Case Generator
 * 测试用例生成器 - 整合 5 级流水线生成工业级人类可执行测试用例
 * 
 * 5 级流水线:
 * Level 1: 从 Neo4j 提取测试图谱 (TestPoint -> Requirement -> Module)
 * Level 2: 数据装置映射 (FixtureResolver)
 * Level 3: 三层人类可读展开 (StepExpander)
 * Level 4: 批判者验证门禁 (CriticAgent)
 * Level 5: 人机双模态交付 (输出格式化)
 */

const { getDriver } = require('../db/neo4j');
const { getFixtureResolver } = require('../fixtures/resolver');
const { StepExpander } = require('../expander/step-expander');
const { CriticAgent } = require('../validator/critic-agent');

/**
 * Test Case Generator
 * 测试用例生成器主类
 */
class TestCaseGenerator {
  constructor() {
    this.fixtureResolver = getFixtureResolver();
    this.stepExpander = new StepExpander();
    this.criticAgent = new CriticAgent();
  }

  /**
   * Generate test case from a test point in Neo4j
   * @param {string} testPointId - Test point ID
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated test case with validation result
   */
  async generateFromTestPoint(testPointId, options = {}) {
    // Level 1: Extract from Neo4j
    const graphData = await this.extractFromNeo4j(testPointId);
    
    if (!graphData) {
      throw new Error(`Test point ${testPointId} not found in Neo4j`);
    }

    // Level 2: Resolve fixtures
    const fixtures = await this.fixtureResolver.resolveForRequirement(
      graphData.requirement,
      { env: options.env }
    );

    // Level 3: Expand steps
    const expandedSteps = this.stepExpander.expandTestPoint(
      graphData.testPoint,
      graphData.requirement,
      fixtures
    );

    // Build test case structure
    const testCase = this.buildTestCase(
      graphData,
      fixtures,
      expandedSteps,
      options
    );

    // Level 4: Validate with critic agent
    const validationResult = this.criticAgent.validate(testCase);

    // Level 5: Package for delivery
    return {
      test_case: testCase,
      validation: validationResult.getAssessment(),
      quality_report: this.criticAgent.generateReport(validationResult),
      metadata: {
        generated_at: new Date().toISOString(),
        generator_version: '1.0.0',
        spec_version: 'SPEC-AI-HUMAN-READABLE-TESTCASE-002'
      }
    };
  }

  /**
   * Generate test cases for all test points of a requirement
   * @param {string} requirementId - Requirement ID
   * @param {Object} options - Generation options
   * @returns {Promise<Array>} Array of generated test cases
   */
  async generateForRequirement(requirementId, options = {}) {
    const driver = getDriver();
    const session = driver.session();

    try {
      // Query all test points for this requirement
      const query = `
        MATCH (r:Requirement {req_id: $reqId})
        MATCH (r)-[:DECOMPOSED_INTO]->(tp:TestPoint)
        RETURN tp.test_point_id as testPointId, tp.angle as angle
        ORDER BY tp.priority, tp.angle
      `;

      const result = await session.run(query, { reqId: requirementId });
      
      const testCases = [];
      
      for (const record of result.records) {
        const testPointId = record.get('testPointId');
        
        try {
          const generated = await this.generateFromTestPoint(testPointId, options);
          testCases.push(generated);
        } catch (error) {
          console.error(`Failed to generate test case for ${testPointId}:`, error);
          testCases.push({
            test_point_id: testPointId,
            error: error.message,
            status: 'FAILED'
          });
        }
      }

      return testCases;

    } finally {
      await session.close();
    }
  }

  /**
   * Generate test cases for all test points in a module
   * @param {string} moduleId - Module ID
   * @param {Object} options - Generation options
   * @returns {Promise<Array>} Array of generated test cases
   */
  async generateForModule(moduleId, options = {}) {
    const driver = getDriver();
    const session = driver.session();

    try {
      // Query all requirements and their test points in this module
      const query = `
        MATCH (m:Module {module_id: $moduleId})
        MATCH (m)-[:CONTAINS]->(r:Requirement)
        MATCH (r)-[:DECOMPOSED_INTO]->(tp:TestPoint)
        RETURN tp.test_point_id as testPointId, r.req_id as reqId
        ORDER BY r.priority, tp.priority
      `;

      const result = await session.run(query, { moduleId });
      
      const testCases = [];
      
      for (const record of result.records) {
        const testPointId = record.get('testPointId');
        
        try {
          const generated = await this.generateFromTestPoint(testPointId, options);
          testCases.push(generated);
        } catch (error) {
          console.error(`Failed to generate test case for ${testPointId}:`, error);
          testCases.push({
            test_point_id: testPointId,
            error: error.message,
            status: 'FAILED'
          });
        }
      }

      return testCases;

    } finally {
      await session.close();
    }
  }

  /**
   * Extract test point, requirement, and module from Neo4j
   * @param {string} testPointId - Test point ID
   * @returns {Promise<Object>} Graph data
   */
  async extractFromNeo4j(testPointId) {
    const driver = getDriver();
    const session = driver.session();

    try {
      const query = `
        MATCH (tp:TestPoint {test_point_id: $testPointId})
        MATCH (r:Requirement)-[:DECOMPOSED_INTO]->(tp)
        OPTIONAL MATCH (m:Module)-[:CONTAINS]->(r)
        RETURN 
          tp,
          r,
          m,
          r.given as given,
          r.when as when,
          r.then as then
      `;

      const result = await session.run(query, { testPointId });

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      
      const testPoint = record.get('tp').properties;
      const requirement = record.get('r').properties;
      const module = record.has('m') ? record.get('m').properties : null;

      // Parse Given-When-Then arrays
      requirement.givenWhenThen = {
        given: record.get('given') || [],
        when: record.get('when') || [],
        then: record.get('then') || []
      };

      return {
        testPoint,
        requirement,
        module
      };

    } finally {
      await session.close();
    }
  }

  /**
   * Build test case structure
   * @param {Object} graphData - Data from Neo4j
   * @param {Object} fixtures - Resolved fixtures
   * @param {Array} expandedSteps - Expanded steps
   * @param {Object} options - Options
   * @returns {Object} Test case
   */
  buildTestCase(graphData, fixtures, expandedSteps, options = {}) {
    const { testPoint, requirement, module } = graphData;

    // Generate case ID
    const caseId = this.generateCaseId(testPoint, requirement);

    // Build preconditions
    const preconditions = this.buildPreconditions(
      graphData,
      fixtures
    );

    // Estimate duration
    const estimatedDuration = this.estimateDuration(expandedSteps);

    return {
      case_id: caseId,
      requirement_ref: `${requirement.req_id}@${requirement.version || 'v1.0'}`,
      module_ref: module ? module.module_id : null,
      title: this.generateTitle(testPoint, requirement, fixtures),
      priority: testPoint.priority || requirement.priority || 'P2',
      angle: testPoint.angle,
      execution_type: options.execution_type || 'HYBRID_MANUAL_AUTOMATED',
      estimated_duration_seconds: estimatedDuration,
      
      fixtures: {
        env: fixtures.env,
        test_account: fixtures.test_account,
        test_payload: fixtures.test_payload
      },

      preconditions,
      steps: expandedSteps,

      metadata: {
        test_point_id: testPoint.test_point_id,
        requirement_id: requirement.req_id,
        module_id: module ? module.module_id : null,
        scenario: fixtures.scenario,
        generated_by: 'OpenTest-TestCaseGenerator',
        spec_compliance: 'SPEC-AI-HUMAN-READABLE-TESTCASE-002'
      }
    };
  }

  /**
   * Generate case ID
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @returns {string} Case ID
   */
  generateCaseId(testPoint, requirement) {
    // Extract requirement number
    const reqMatch = requirement.req_id.match(/REQ-([A-Z]+-\d+)/i);
    const reqPart = reqMatch ? reqMatch[1] : requirement.req_id.replace(/[^A-Z0-9]/gi, '');

    // Extract angle abbreviation
    const angleAbbr = {
      'Functional': 'FUNC',
      'Exception': 'EXC',
      'Security': 'SEC',
      'Performance': 'PERF'
    }[testPoint.angle] || 'TEST';

    // Generate sequential number (hash of test point ID)
    const hash = this.hashString(testPoint.test_point_id);
    const seqNum = (hash % 900) + 100; // 3-digit number

    return `CASE-${reqPart}-${angleAbbr}-${seqNum}`;
  }

  /**
   * Generate human-readable title
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {string} Title
   */
  generateTitle(testPoint, requirement, fixtures) {
    const account = fixtures.test_account;
    
    // Build context descriptors
    const contextParts = [];

    // Add account role descriptor
    if (account.member_level) {
      const levelMap = {
        'gold': '黄金会员',
        'silver': '银色会员',
        'basic': '普通用户'
      };
      contextParts.push(levelMap[account.member_level] || account.member_level);
    }

    // Add phone binding status
    if (account.bound_phone) {
      contextParts.push('已绑定手机号');
    }

    // Build action descriptor from test point
    const action = testPoint.title || testPoint.description || requirement.title;

    // Combine parts
    const context = contextParts.length > 0 
      ? contextParts.join('的') + '，'
      : '';

    return `${context}${action}`;
  }

  /**
   * Build preconditions list
   * @param {Object} graphData - Graph data
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Preconditions
   */
  buildPreconditions(graphData, fixtures) {
    const { testPoint, requirement } = graphData;
    const account = fixtures.test_account;
    const env = fixtures.environment;
    const preconditions = [];

    // 1. Account login status
    preconditions.push(
      `1. 测试账号 ${account.username} 已处于登录状态（环境：${env.name}）`
    );

    // 2. Account balance (if relevant)
    if (account.initial_balance && parseFloat(account.initial_balance) > 0) {
      preconditions.push(
        `2. 账号钱包当前可用余额确认 >= ¥${account.initial_balance}`
      );
    }

    // 3. From Given statements
    if (requirement.givenWhenThen && requirement.givenWhenThen.given) {
      requirement.givenWhenThen.given.forEach((given, index) => {
        const num = account.initial_balance ? index + 3 : index + 2;
        preconditions.push(`${num}. ${given}`);
      });
    }

    // 4. Scenario-specific preconditions
    if (fixtures.scenario === 'payment_with_sms' && fixtures.test_payload.item_id) {
      const num = preconditions.length + 1;
      preconditions.push(
        `${num}. 购物车内已添加 1 件 ${fixtures.test_payload.item_name || fixtures.test_payload.item_id} (单价 ¥${fixtures.test_payload.item_price})`
      );
    }

    return preconditions;
  }

  /**
   * Estimate test execution duration
   * @param {Array} steps - Test steps
   * @returns {number} Duration in seconds
   */
  estimateDuration(steps) {
    // Base time per step
    let totalSeconds = 0;

    steps.forEach(step => {
      const instruction = (step.human_instruction || '').toLowerCase();

      // Different actions have different time estimates
      if (instruction.includes('等待') || instruction.includes('wait')) {
        totalSeconds += 10; // Wait actions: 10s
      } else if (instruction.includes('刷新') || instruction.includes('refresh')) {
        totalSeconds += 5; // Refresh: 5s
      } else if (instruction.includes('输入') || instruction.includes('input')) {
        totalSeconds += 8; // Input: 8s
      } else if (instruction.includes('点击') || instruction.includes('click')) {
        totalSeconds += 5; // Click: 5s
      } else if (instruction.includes('验证') || instruction.includes('核对') || instruction.includes('verify')) {
        totalSeconds += 10; // Verification: 10s
      } else {
        totalSeconds += 7; // Default: 7s
      }
    });

    // Add buffer time (20%)
    totalSeconds = Math.ceil(totalSeconds * 1.2);

    return totalSeconds;
  }

  /**
   * Simple hash function for string
   * @param {string} str - String to hash
   * @returns {number} Hash value
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Batch generate test cases with retry on validation failure
   * @param {Array} testPointIds - Array of test point IDs
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Batch generation result
   */
  async batchGenerate(testPointIds, options = {}) {
    const results = {
      total: testPointIds.length,
      succeeded: 0,
      failed: 0,
      validation_failed: 0,
      test_cases: [],
      errors: []
    };

    for (const testPointId of testPointIds) {
      try {
        const generated = await this.generateFromTestPoint(testPointId, options);
        
        if (generated.validation.passed) {
          results.succeeded++;
          results.test_cases.push(generated);
        } else {
          results.validation_failed++;
          results.test_cases.push(generated);
          
          // Optionally retry with manual intervention hints
          if (options.retry_on_validation_failure) {
            console.warn(`Test case ${testPointId} failed validation. Manual review required.`);
          }
        }

      } catch (error) {
        results.failed++;
        results.errors.push({
          test_point_id: testPointId,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Generate summary report for batch generation
   * @param {Object} batchResult - Batch generation result
   * @returns {string} Summary report
   */
  generateBatchReport(batchResult) {
    let report = '\n========================================\n';
    report += '📊 批量生成测试用例报告\n';
    report += '========================================\n\n';
    
    report += `总计: ${batchResult.total} 个测试点\n`;
    report += `✅ 生成成功: ${batchResult.succeeded} 个\n`;
    report += `⚠️  验证失败: ${batchResult.validation_failed} 个\n`;
    report += `❌ 生成失败: ${batchResult.failed} 个\n\n`;

    const successRate = ((batchResult.succeeded / batchResult.total) * 100).toFixed(1);
    report += `成功率: ${successRate}%\n\n`;

    if (batchResult.validation_failed > 0) {
      report += '⚠️  以下用例需要人工审核:\n';
      report += '----------------------------------------\n';
      batchResult.test_cases
        .filter(tc => tc.validation && !tc.validation.passed)
        .forEach(tc => {
          report += `- ${tc.test_case.case_id}: ${tc.test_case.title}\n`;
          report += `  评分: ${tc.validation.score}/100\n`;
          report += `  问题: ${tc.validation.total_violations} 个违规项\n\n`;
        });
    }

    if (batchResult.errors.length > 0) {
      report += '❌ 生成失败的用例:\n';
      report += '----------------------------------------\n';
      batchResult.errors.forEach(err => {
        report += `- ${err.test_point_id}: ${err.error}\n`;
      });
      report += '\n';
    }

    report += '========================================\n';

    return report;
  }
}

/**
 * Convenience function: Generate from test point
 * @param {string} testPointId - Test point ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Generated test case
 */
async function generateTestCase(testPointId, options = {}) {
  const generator = new TestCaseGenerator();
  return await generator.generateFromTestPoint(testPointId, options);
}

/**
 * Convenience function: Generate for requirement
 * @param {string} requirementId - Requirement ID
 * @param {Object} options - Options
 * @returns {Promise<Array>} Generated test cases
 */
async function generateTestCasesForRequirement(requirementId, options = {}) {
  const generator = new TestCaseGenerator();
  return await generator.generateForRequirement(requirementId, options);
}

/**
 * Convenience function: Generate for module
 * @param {string} moduleId - Module ID
 * @param {Object} options - Options
 * @returns {Promise<Array>} Generated test cases
 */
async function generateTestCasesForModule(moduleId, options = {}) {
  const generator = new TestCaseGenerator();
  return await generator.generateForModule(moduleId, options);
}

module.exports = {
  TestCaseGenerator,
  generateTestCase,
  generateTestCasesForRequirement,
  generateTestCasesForModule
};
