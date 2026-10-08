#!/usr/bin/env node
/**
 * Test tool for Explore and Generate功能
 * 
 * Usage:
 *   node test-explore.js demo         # 演示完整流程
 *   node test-explore.js semantic     # 测试语义分析
 *   node test-explore.js generate     # 测试脚本生成
 *   node test-explore.js mock         # 使用模拟数据测试
 */

const fs = require('fs');
const path = require('path');
const { exploreAndGenerate } = require('./cli/agent/tools/explore-and-generate');
const { analyzeExploration } = require('./cli/agent/tools/semantic-action');
const { generateTestFile } = require('./cli/agent/tools/script-generator');

const COMMANDS = {
  demo: '演示完整流程（需要实际浏览器操作）',
  semantic: '测试语义分析（使用模拟事件数据）',
  generate: '测试脚本生成（使用模拟分析结果）',
  mock: '使用模拟数据完整测试',
};

async function runDemo() {
  console.log('🚀 演示完整流程');
  console.log('');
  console.log('这将启动浏览器，请手动操作后关闭浏览器窗口');
  console.log('');
  
  const workspace = path.join(__dirname, 'test-workspace');
  await fs.promises.mkdir(workspace, { recursive: true });
  
  const result = await exploreAndGenerate({
    url: 'https://example.com',
    workspace,
    caseId: 'demo-test',
    llmClient: null, // No LLM in demo
    headless: false,
    timeout: 5 * 60 * 1000, // 5 minutes
  });
  
  console.log('');
  console.log('✅ 完成！');
  console.log(JSON.stringify(result.summary, null, 2));
}

async function testSemantic() {
  console.log('🧠 测试语义分析');
  console.log('');
  
  // Create mock session data
  const workspace = path.join(__dirname, 'test-workspace');
  await fs.promises.mkdir(workspace, { recursive: true });
  
  const sessionDir = path.join(workspace, 'automation', 'mock-session');
  await fs.promises.mkdir(sessionDir, { recursive: true });
  
  const mockEvents = [
    {
      id: 1,
      type: 'navigation',
      timestamp: Date.now(),
      url: 'https://example.com/login',
      from: 'https://example.com',
    },
    {
      id: 2,
      type: 'input',
      timestamp: Date.now() + 1000,
      url: 'https://example.com/login',
      selector: '#username',
      value: 'testuser',
      context: {
        tagName: 'INPUT',
        type: 'text',
        name: 'username',
        placeholder: '用户名',
      },
    },
    {
      id: 3,
      type: 'input',
      timestamp: Date.now() + 1500,
      url: 'https://example.com/login',
      selector: '#password',
      value: 'password123',
      context: {
        tagName: 'INPUT',
        type: 'password',
        name: 'password',
        placeholder: '密码',
      },
    },
    {
      id: 4,
      type: 'click',
      timestamp: Date.now() + 2000,
      url: 'https://example.com/login',
      selector: 'button[type="submit"]',
      context: {
        tagName: 'BUTTON',
        type: 'submit',
        textContent: '登录',
        role: 'button',
      },
    },
    {
      id: 5,
      type: 'navigation',
      timestamp: Date.now() + 3000,
      url: 'https://example.com/dashboard',
      from: 'https://example.com/login',
    },
  ];
  
  const sessionData = {
    sessionId: 'mock-session',
    startUrl: 'https://example.com',
    timestamp: Date.now(),
    duration: 3000,
    events: mockEvents,
    screenshots: [],
    networkRequests: [],
    consoleMessages: [],
  };
  
  const sessionFile = path.join(sessionDir, 'session.json');
  await fs.promises.writeFile(
    sessionFile,
    JSON.stringify(sessionData, null, 2),
    'utf8'
  );
  
  console.log('📝 模拟事件数据已创建');
  console.log(`   文件: ${sessionFile}`);
  console.log('');
  
  // Analyze
  const analysis = await analyzeExploration(sessionFile);
  
  console.log('✅ 语义分析完成');
  console.log('');
  console.log('📊 分析结果:');
  console.log(`   - 事件数: ${analysis.summary.totalEvents}`);
  console.log(`   - 动作数: ${analysis.summary.totalActions}`);
  console.log(`   - 流程数: ${analysis.summary.totalFlows}`);
  console.log(`   - 分析方式: ${analysis.source}`);
  console.log('');
  
  console.log('🔍 识别的动作:');
  analysis.actions.forEach((action, i) => {
    console.log(`   ${i + 1}. ${action.type}: ${action.intent}`);
  });
  console.log('');
  
  console.log('🔗 识别的流程:');
  analysis.flows.forEach((flow, i) => {
    console.log(`   ${i + 1}. ${flow.intent} (${flow.actions.length} 个动作)`);
  });
  
  return analysis;
}

async function testGenerate(analysisInput = null) {
  console.log('📝 测试脚本生成');
  console.log('');
  
  let analysis = analysisInput;
  
  if (!analysis) {
    // Create mock analysis
    analysis = {
      sessionId: 'mock-session',
      source: 'rules',
      timestamp: Date.now(),
      summary: {
        totalEvents: 5,
        totalActions: 3,
        totalFlows: 1,
        duration: 3000,
      },
      actions: [
        {
          id: 'action-1',
          type: 'navigate',
          timestamp: Date.now(),
          url: 'https://example.com/login',
          target: 'https://example.com/login',
          from: 'https://example.com',
          intent: '导航到登录页',
        },
        {
          id: 'action-2',
          type: 'form-fill',
          timestamp: Date.now() + 1000,
          url: 'https://example.com/login',
          intent: '填写登录表单',
          fields: [
            {
              selector: '#username',
              value: 'testuser',
              name: 'username',
            },
            {
              selector: '#password',
              value: 'password123',
              name: 'password',
            },
          ],
        },
        {
          id: 'action-3',
          type: 'click',
          timestamp: Date.now() + 2000,
          url: 'https://example.com/login',
          selector: 'button[type="submit"]',
          context: {
            tagName: 'BUTTON',
            textContent: '登录',
            role: 'button',
          },
          intent: '提交登录',
        },
      ],
      flows: [
        {
          id: 'flow-1',
          intent: '用户登录流程',
          startTime: Date.now(),
          endTime: Date.now() + 3000,
          duration: 3000,
          url: 'https://example.com/login',
          actions: [
            {
              id: 'action-1',
              type: 'navigate',
              target: 'https://example.com/login',
              intent: '导航到登录页',
            },
            {
              id: 'action-2',
              type: 'form-fill',
              intent: '填写登录表单',
              fields: [
                { selector: '#username', value: 'testuser', name: 'username' },
                { selector: '#password', value: 'password123', name: 'password' },
              ],
            },
            {
              id: 'action-3',
              type: 'click',
              selector: 'button[type="submit"]',
              context: { tagName: 'BUTTON', textContent: '登录', role: 'button' },
              intent: '提交登录',
            },
          ],
        },
      ],
      networkRequests: [],
    };
    
    console.log('📝 使用模拟分析数据');
  } else {
    console.log('📝 使用真实分析数据');
  }
  
  console.log('');
  
  // Generate test file
  const result = generateTestFile(analysis, {
    testName: 'test_user_login',
    baseUrl: 'https://example.com',
    includeAssertions: true,
    parameterizeData: true,
  });
  
  console.log('✅ 脚本生成完成');
  console.log('');
  console.log('📊 生成结果:');
  console.log(`   - 动作数: ${result.metadata.actionCount}`);
  console.log(`   - 流程数: ${result.metadata.flowCount}`);
  console.log(`   - 断言: ${result.metadata.hasAssertions ? '是' : '否'}`);
  console.log(`   - 测试数据: ${result.metadata.hasTestData ? '是' : '否'}`);
  console.log('');
  
  console.log('📄 生成的测试脚本:');
  console.log('─'.repeat(60));
  console.log(result.script);
  console.log('─'.repeat(60));
  console.log('');
  
  console.log('📖 说明文档:');
  console.log('─'.repeat(60));
  console.log(result.readme);
  console.log('─'.repeat(60));
  
  return result;
}

async function testMock() {
  console.log('🎭 使用模拟数据完整测试');
  console.log('');
  
  // Step 1: Semantic analysis
  const analysis = await testSemantic();
  
  console.log('');
  console.log('─'.repeat(60));
  console.log('');
  
  // Step 2: Script generation
  await testGenerate(analysis);
}

async function main() {
  const command = process.argv[2];
  
  if (!command || !COMMANDS[command]) {
    console.log('Usage: node test-explore.js <command>');
    console.log('');
    console.log('Commands:');
    Object.entries(COMMANDS).forEach(([cmd, desc]) => {
      console.log(`  ${cmd.padEnd(12)} ${desc}`);
    });
    process.exit(1);
  }
  
  console.log('');
  console.log('═'.repeat(60));
  console.log(`  Explore & Generate Test - ${command}`);
  console.log('═'.repeat(60));
  console.log('');
  
  try {
    switch (command) {
      case 'demo':
        await runDemo();
        break;
      case 'semantic':
        await testSemantic();
        break;
      case 'generate':
        await testGenerate();
        break;
      case 'mock':
        await testMock();
        break;
    }
    
    console.log('');
    console.log('✅ 测试完成');
    
  } catch (error) {
    console.error('');
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { testSemantic, testGenerate, testMock };
