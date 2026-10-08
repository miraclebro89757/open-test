/**
 * Explore and Generate
 * 
 * 统一的浏览器探索和脚本生成工具。
 * 
 * 完整流程：
 * 1. Browser Explore - 用户操作录制
 * 2. Semantic Analysis - 语义动作提取
 * 3. Script Generation - 测试脚本生成
 * 
 * 对应规划文档 Section 36-39：
 * - Browser Explore
 * - Explore数据（Raw Event → Semantic Action → Test Step）
 * - Automation Asset
 * 
 * @module explore-and-generate
 */

const fs = require('fs');
const path = require('path');
const { exploreBrowser } = require('./browser-explore');
const { analyzeExploration } = require('./semantic-action');
const { generateTestFile } = require('./script-generator');

/**
 * Complete explore and generate workflow
 * 
 * @param {Object} options
 * @param {string} options.url - Starting URL for exploration
 * @param {string} options.workspace - Workspace directory
 * @param {string} options.caseId - Optional test case ID
 * @param {Object} options.llmClient - Optional LLM client for AI enhancement
 * @param {boolean} options.headless - Run browser in headless mode
 * @param {number} options.timeout - Exploration timeout in ms
 * @returns {Promise<Object>} Generation result
 */
async function exploreAndGenerate({
  url,
  workspace,
  caseId = null,
  llmClient = null,
  headless = false,
  timeout = 15 * 60 * 1000,
}) {
  const timestamp = Date.now();
  const sessionId = caseId ? `${caseId}-${timestamp}` : `explore-${timestamp}`;
  
  // Create output directory
  const outputDir = path.join(workspace, 'automation');
  await fs.promises.mkdir(outputDir, { recursive: true });
  
  const result = {
    sessionId,
    timestamp,
    url,
    steps: [],
  };
  
  try {
    // Step 1: Browser Exploration
    result.steps.push('开始浏览器探索');
    console.log('🌐 启动浏览器探索...');
    console.log(`   URL: ${url}`);
    console.log('   请在浏览器中完成测试操作，关闭浏览器窗口即可结束录制');
    
    const exploreResult = await exploreBrowser({
      url,
      outputDir,
      headless,
      timeout,
    });
    
    result.exploreResult = exploreResult;
    result.steps.push(
      `浏览器探索完成：${exploreResult.eventCount} 个事件，${exploreResult.screenshotCount} 张截图`
    );
    console.log(`✓ 录制完成: ${exploreResult.eventCount} 个事件`);
    
    // Step 2: Semantic Analysis
    result.steps.push('开始语义分析');
    console.log('🧠 分析语义动作...');
    
    // Try AI-enhanced analysis, fall back to rules on failure
    let analysis;
    try {
      analysis = await analyzeExploration(
        exploreResult.sessionFile,
        llmClient
      );
    } catch (error) {
      console.log(`   ⚠️  AI 分析失败: ${error.message}`);
      console.log('   ℹ️  降级到规则引擎...');
      analysis = await analyzeExploration(
        exploreResult.sessionFile,
        null  // Force rule-based analysis
      );
    }
    
    result.analysis = analysis;
    result.steps.push(
      `语义分析完成：${analysis.summary.totalActions} 个动作，${analysis.summary.totalFlows} 个流程（${analysis.source === 'ai' ? 'AI' : '规则引擎'}）`
    );
    console.log(`✓ 识别到 ${analysis.summary.totalActions} 个语义动作`);
    console.log(`✓ 识别到 ${analysis.summary.totalFlows} 个用户流程`);
    if (analysis.source === 'ai') {
      console.log(`✓ AI 增强分析：${analysis.aiEnhanced?.testIntent || '已完成'}`);
    }
    
    // Save analysis
    const analysisFile = path.join(exploreResult.sessionDir, 'analysis.json');
    await fs.promises.writeFile(
      analysisFile,
      JSON.stringify(analysis, null, 2),
      'utf8'
    );
    result.analysisFile = analysisFile;
    
    // Step 3: Script Generation
    result.steps.push('开始生成测试脚本');
    console.log('📝 生成测试脚本...');
    
    const testName = analysis.aiEnhanced?.suggestedTestName || 
                     (caseId ? `test_${caseId}` : 'test_scenario');
    
    const scriptResult = generateTestFile(analysis, {
      testName,
      baseUrl: url,
      includeAssertions: true,
      parameterizeData: true,
    });
    
    // Save test script
    const scriptFile = path.join(outputDir, `${sessionId}.spec.ts`);
    await fs.promises.writeFile(scriptFile, scriptResult.script, 'utf8');
    result.scriptFile = scriptFile;
    result.steps.push(`测试脚本已生成：${path.basename(scriptFile)}`);
    console.log(`✓ 测试脚本: ${path.basename(scriptFile)}`);
    
    // Save README
    const readmeFile = path.join(outputDir, `${sessionId}_README.md`);
    await fs.promises.writeFile(readmeFile, scriptResult.readme, 'utf8');
    result.readmeFile = readmeFile;
    result.steps.push(`说明文档已生成：${path.basename(readmeFile)}`);
    console.log(`✓ 说明文档: ${path.basename(readmeFile)}`);
    
    // Save summary
    const summary = {
      sessionId,
      timestamp,
      url,
      testName,
      eventCount: exploreResult.eventCount,
      actionCount: analysis.summary.totalActions,
      flowCount: analysis.summary.totalFlows,
      analysisSource: analysis.source,
      testIntent: analysis.aiEnhanced?.testIntent || '未知',
      files: {
        session: exploreResult.sessionFile,
        analysis: analysisFile,
        script: scriptFile,
        readme: readmeFile,
        sessionDir: exploreResult.sessionDir,
      },
      metadata: scriptResult.metadata,
    };
    
    const summaryFile = path.join(outputDir, `${sessionId}_summary.json`);
    await fs.promises.writeFile(
      summaryFile,
      JSON.stringify(summary, null, 2),
      'utf8'
    );
    result.summaryFile = summaryFile;
    
    result.success = true;
    result.summary = summary;
    
    console.log('');
    console.log('✅ 探索和生成完成！');
    console.log('');
    console.log('📊 总结：');
    console.log(`   - 录制事件: ${exploreResult.eventCount} 个`);
    console.log(`   - 语义动作: ${analysis.summary.totalActions} 个`);
    console.log(`   - 用户流程: ${analysis.summary.totalFlows} 个`);
    console.log(`   - 测试意图: ${summary.testIntent}`);
    console.log('');
    console.log('📁 生成文件：');
    console.log(`   - 测试脚本: ${scriptFile}`);
    console.log(`   - 说明文档: ${readmeFile}`);
    console.log(`   - 完整数据: ${exploreResult.sessionDir}`);
    
  } catch (error) {
    result.success = false;
    result.error = error.message;
    result.steps.push(`错误：${error.message}`);
    console.error('❌ 探索和生成失败:', error.message);
    throw error;
  }
  
  return result;
}

/**
 * Explore multiple scenarios in batch
 */
async function exploreMultiple({
  scenarios,
  workspace,
  llmClient = null,
  headless = true,
  timeout = 15 * 60 * 1000,
}) {
  const results = [];
  
  for (const scenario of scenarios) {
    console.log('');
    console.log(`🚀 开始场景: ${scenario.caseId || scenario.url}`);
    console.log('─'.repeat(60));
    
    try {
      const result = await exploreAndGenerate({
        url: scenario.url,
        workspace,
        caseId: scenario.caseId,
        llmClient,
        headless,
        timeout,
      });
      
      results.push({
        scenario,
        success: true,
        result,
      });
      
    } catch (error) {
      results.push({
        scenario,
        success: false,
        error: error.message,
      });
    }
    
    console.log('─'.repeat(60));
  }
  
  // Print summary
  console.log('');
  console.log('📊 批量探索完成');
  console.log('');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✓ 成功: ${successful}`);
  console.log(`✗ 失败: ${failed}`);
  console.log(`总计: ${results.length}`);
  
  return results;
}

module.exports = {
  exploreAndGenerate,
  exploreMultiple,
};
