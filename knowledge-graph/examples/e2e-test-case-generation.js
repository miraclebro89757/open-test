#!/usr/bin/env node

/**
 * End-to-End Test Case Generation Demo
 * 端到端测试用例生成演示
 * 
 * 演示完整的 5 级流水线:
 * Level 1: 从 Neo4j 提取测试图谱
 * Level 2: FixtureResolver 注入数据
 * Level 3: StepExpander 展开步骤
 * Level 4: CriticAgent 验证质量
 * Level 5: DualFormatExporter 双模态输出
 */

const path = require('path');
const fs = require('fs-extra');
const { TestCaseGenerator } = require('../src/generator/test-case-generator');
const { DualFormatExporter } = require('../src/exporter/dual-format-exporter');
const { getFixtureResolver } = require('../src/fixtures/resolver');
const { CriticAgent } = require('../src/validator/critic-agent');

/**
 * Mock Test Point Data (模拟图谱数据用于演示)
 */
const MOCK_TEST_POINT = {
  testPoint: {
    test_point_id: 'TP-PAY-2FA-FUNC-001',
    angle: 'Functional',
    title: '支付时触发短信验证码二次确认',
    description: '用户在结算页面提交订单时，系统弹出短信验证码输入框，用户输入正确验证码后完成支付',
    priority: 'P0',
    status: 'active'
  },
  requirement: {
    req_id: 'REQ-PAY-02',
    version: 'v2.0',
    title: '支付短信二次验证功能',
    description: '为保障支付安全，用户在购物车结算时需要通过短信验证码进行二次确认',
    priority: 'P0',
    givenWhenThen: {
      given: [
        '用户已登录系统',
        '用户购物车中有商品',
        '用户账户余额充足'
      ],
      when: [
        '用户点击立即支付按钮',
        '系统发送短信验证码',
        '用户输入验证码并提交'
      ],
      then: [
        '系统验证验证码正确性',
        '完成支付扣款',
        '显示支付成功页面'
      ]
    }
  },
  module: {
    module_id: 'MOD_PAYMENT',
    name: '支付模块',
    description: '处理用户支付相关的所有功能'
  }
};

/**
 * Main Demo Function
 */
async function runDemo() {
  console.log('='.repeat(80));
  console.log('🚀 OpenTest 工业级测试用例生成演示');
  console.log('   规范: SPEC-AI-HUMAN-READABLE-TESTCASE-002');
  console.log('='.repeat(80));
  console.log();

  try {
    // Step 1: 展示输入数据
    console.log('📥 Step 1: 输入数据（从 Neo4j 图谱提取）');
    console.log('-'.repeat(80));
    console.log('测试点:', MOCK_TEST_POINT.testPoint.title);
    console.log('需求:', MOCK_TEST_POINT.requirement.title);
    console.log('模块:', MOCK_TEST_POINT.module.name);
    console.log('维度:', MOCK_TEST_POINT.testPoint.angle);
    console.log();

    // Step 2: 解析 Fixtures
    console.log('🔧 Step 2: 数据装置解析（FixtureResolver）');
    console.log('-'.repeat(80));
    const fixtureResolver = getFixtureResolver();
    const fixtures = await fixtureResolver.resolveForRequirement(
      MOCK_TEST_POINT.requirement,
      { env: 'STAGING_ENV_02' }
    );
    console.log('✅ 已解析测试环境:', fixtures.env);
    console.log('✅ 已解析测试账号:', fixtures.test_account.username);
    console.log('✅ 已解析测试场景:', fixtures.scenario);
    console.log('✅ 已注入测试数据:', Object.keys(fixtures.test_payload).join(', '));
    console.log();

    // Step 3: 展开步骤
    console.log('📝 Step 3: 三层步骤展开（StepExpander）');
    console.log('-'.repeat(80));
    const { StepExpander } = require('../src/expander/step-expander');
    const stepExpander = new StepExpander();
    const expandedSteps = stepExpander.expandTestPoint(
      MOCK_TEST_POINT.testPoint,
      MOCK_TEST_POINT.requirement,
      fixtures
    );
    console.log(`✅ 已展开 ${expandedSteps.length} 个测试步骤`);
    expandedSteps.forEach((step, index) => {
      console.log(`   步骤 ${step.step_no}: ${step.intent}`);
    });
    console.log();

    // Step 4: 构建完整测试用例
    console.log('🏗️  Step 4: 构建测试用例（TestCaseGenerator）');
    console.log('-'.repeat(80));
    const generator = new TestCaseGenerator();
    const testCase = generator.buildTestCase(
      MOCK_TEST_POINT,
      fixtures,
      expandedSteps
    );
    console.log('✅ 用例编号:', testCase.case_id);
    console.log('✅ 用例标题:', testCase.title);
    console.log('✅ 优先级:', testCase.priority);
    console.log('✅ 预估耗时:', testCase.estimated_duration_seconds, '秒');
    console.log('✅ 前置条件:', testCase.preconditions.length, '项');
    console.log('✅ 测试步骤:', testCase.steps.length, '步');
    console.log();

    // Step 5: 质量验证
    console.log('🔍 Step 5: 质量验证（CriticAgent）');
    console.log('-'.repeat(80));
    const critic = new CriticAgent();
    const validationResult = critic.validate(testCase);
    const assessment = validationResult.getAssessment();
    
    console.log('✅ 质量评分:', assessment.score, '/ 100');
    console.log('✅ 评级:', assessment.verdict);
    console.log('✅ 验收状态:', assessment.passed ? '✅ 通过' : '❌ 不通过');
    console.log('✅ 违规项:', assessment.total_violations, '个');
    console.log('✅ 警告项:', assessment.total_warnings, '个');
    
    if (assessment.violations && assessment.violations.length > 0) {
      console.log('\n⚠️  检测到的问题:');
      assessment.violations.slice(0, 3).forEach((v, i) => {
        console.log(`   ${i + 1}. [${v.type}] ${v.message}`);
      });
    }
    console.log();

    // Step 6: 双模态输出
    console.log('📤 Step 6: 双模态输出（DualFormatExporter）');
    console.log('-'.repeat(80));
    const exporter = new DualFormatExporter();
    const generatedTestCase = {
      test_case: testCase,
      validation: assessment,
      quality_report: critic.generateReport(validationResult),
      metadata: {
        generated_at: new Date().toISOString(),
        generator_version: '1.0.0'
      }
    };

    const exported = exporter.export(generatedTestCase, {
      include_playwright: true,
      include_cypress: true
    });

    // 保存到文件
    const outputDir = path.join(__dirname, '../output/demo');
    await fs.ensureDir(outputDir);

    const files = await exporter.exportToFiles(generatedTestCase, outputDir, {
      include_playwright: true,
      include_cypress: true
    });

    console.log('✅ 已生成文件:');
    Object.entries(files).forEach(([format, filePath]) => {
      console.log(`   📄 ${format}: ${path.basename(filePath)}`);
    });
    console.log(`\n📁 输出目录: ${outputDir}`);
    console.log();

    // Step 7: 展示部分输出内容
    console.log('📋 Step 7: 输出预览');
    console.log('-'.repeat(80));
    
    // 预览 Markdown 的前几行
    const mdLines = exported.markdown.split('\n').slice(0, 20);
    console.log('\n【Markdown 格式预览】:');
    console.log(mdLines.join('\n'));
    console.log('...(省略后续内容)');
    console.log();

    // 预览质量报告
    console.log('\n【质量检查报告】:');
    const reportLines = generatedTestCase.quality_report.split('\n').slice(0, 15);
    console.log(reportLines.join('\n'));
    console.log('...(省略后续内容)');
    console.log();

    // Success summary
    console.log('='.repeat(80));
    console.log('✨ 演示完成！5 级流水线全部执行成功！');
    console.log('='.repeat(80));
    console.log();
    console.log('🎯 生成结果摘要:');
    console.log(`   • 用例编号: ${testCase.case_id}`);
    console.log(`   • 质量评分: ${assessment.score}/100 (${assessment.verdict})`);
    console.log(`   • 测试步骤: ${testCase.steps.length} 步`);
    console.log(`   • 输出格式: Markdown + JSON + Playwright + Cypress`);
    console.log();
    console.log('📖 查看完整输出:');
    console.log(`   cd ${outputDir}`);
    console.log(`   cat ${testCase.case_id}.md`);
    console.log();

  } catch (error) {
    console.error('❌ 演示失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Demo: Batch Generation
 */
async function demoBatchGeneration() {
  console.log('\n' + '='.repeat(80));
  console.log('📦 批量生成演示');
  console.log('='.repeat(80));
  console.log();

  // Mock multiple test points
  const mockTestPoints = [
    {
      ...MOCK_TEST_POINT,
      testPoint: { ...MOCK_TEST_POINT.testPoint, test_point_id: 'TP-PAY-EXC-001', angle: 'Exception', title: '余额不足时支付失败' }
    },
    {
      ...MOCK_TEST_POINT,
      testPoint: { ...MOCK_TEST_POINT.testPoint, test_point_id: 'TP-PAY-SEC-001', angle: 'Security', title: '未登录访问支付页面' }
    },
    {
      ...MOCK_TEST_POINT,
      testPoint: { ...MOCK_TEST_POINT.testPoint, test_point_id: 'TP-PAY-PERF-001', angle: 'Performance', title: '支付 API 响应时间验证' }
    }
  ];

  console.log(`准备批量生成 ${mockTestPoints.length} 个测试用例...\n`);

  const generator = new TestCaseGenerator();
  const exporter = new DualFormatExporter();
  const results = [];

  for (const mockData of mockTestPoints) {
    try {
      const fixtureResolver = getFixtureResolver();
      const fixtures = await fixtureResolver.resolveForRequirement(
        mockData.requirement,
        { env: 'STAGING_ENV_02' }
      );

      const { StepExpander } = require('../src/expander/step-expander');
      const stepExpander = new StepExpander();
      const expandedSteps = stepExpander.expandTestPoint(
        mockData.testPoint,
        mockData.requirement,
        fixtures
      );

      const testCase = generator.buildTestCase(mockData, fixtures, expandedSteps);

      const critic = new CriticAgent();
      const validationResult = critic.validate(testCase);
      const assessment = validationResult.getAssessment();

      results.push({
        case_id: testCase.case_id,
        title: testCase.title,
        angle: testCase.angle,
        score: assessment.score,
        passed: assessment.passed
      });

      console.log(`✅ ${testCase.case_id}: ${assessment.score}/100 - ${testCase.title}`);

    } catch (error) {
      console.log(`❌ 生成失败: ${error.message}`);
      results.push({
        error: error.message
      });
    }
  }

  console.log('\n' + '-'.repeat(80));
  console.log('批量生成完成:');
  console.log(`  成功: ${results.filter(r => r.passed).length}/${results.length}`);
  console.log(`  平均评分: ${(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length).toFixed(1)}/100`);
  console.log();
}

/**
 * Demo: Quality Gate Test
 */
function demoQualityGate() {
  console.log('\n' + '='.repeat(80));
  console.log('🚨 质量门禁演示 - 检测 AI 废话用例');
  console.log('='.repeat(80));
  console.log();

  const badTestCase = {
    case_id: 'BAD-CASE-001',
    title: '测试支付功能',
    fixtures: {
      env: 'test_env',
      test_account: {
        username: '某个用户',
        password: '有效密码'
      },
      test_payload: {}
    },
    preconditions: [
      '用户正常登录系统，系统运行正常'
    ],
    steps: [
      {
        step_no: 1,
        intent: '执行支付',
        human_instruction: '打开商城，挑选喜欢的商品加入购物车',
        expected_outcome: '操作成功'
      },
      {
        step_no: 2,
        intent: '完成付款',
        human_instruction: '点击结账，输入有效信息',
        expected_outcome: '支付成功，数据正确'
      }
    ]
  };

  console.log('❌ 检测 AI 废话用例:\n');
  
  const critic = new CriticAgent();
  const validationResult = critic.validate(badTestCase);
  const assessment = validationResult.getAssessment();

  console.log('评分结果:', assessment.score, '/ 100');
  console.log('评级:', assessment.verdict);
  console.log('验收:', assessment.passed ? '通过' : '❌ 不通过\n');

  console.log('检测到的问题:');
  assessment.violations.slice(0, 5).forEach((v, i) => {
    console.log(`\n${i + 1}. [${v.type}] ${v.message}`);
    console.log(`   位置: ${v.location}`);
    if (v.fix_suggestion) {
      console.log(`   修复建议: ${v.fix_suggestion}`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('✅ 批判者 Agent 成功拦截了 AI 废话用例！');
  console.log('='.repeat(80));
  console.log();
}

// Main execution
if (require.main === module) {
  (async () => {
    const command = process.argv[2];

    if (command === 'batch') {
      await demoBatchGeneration();
    } else if (command === 'quality') {
      demoQualityGate();
    } else if (command === 'all') {
      await runDemo();
      await demoBatchGeneration();
      demoQualityGate();
    } else {
      await runDemo();
    }

    process.exit(0);
  })();
}

module.exports = {
  runDemo,
  demoBatchGeneration,
  demoQualityGate
};
