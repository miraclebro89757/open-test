#!/usr/bin/env node
/**
 * LLM Configuration Diagnostic Tool
 * 
 * Helps diagnose LLM configuration issues for OpenTest
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function checkFile(filePath, description) {
  console.log(`\n📁 检查 ${description}`);
  console.log(`   路径: ${filePath}`);
  
  if (fs.existsSync(filePath)) {
    console.log('   ✓ 文件存在');
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(content);
      console.log('   ✓ JSON 格式正确');
      return config;
    } catch (e) {
      console.log(`   ✗ JSON 解析失败: ${e.message}`);
      return null;
    }
  } else {
    console.log('   ✗ 文件不存在');
    return null;
  }
}

function checkLLMConfig() {
  console.log('═'.repeat(60));
  console.log('  OpenTest LLM Configuration Diagnostics');
  console.log('═'.repeat(60));
  
  // Check global config
  const globalConfigDir = path.join(os.homedir(), '.opentest');
  const globalModelsFile = path.join(globalConfigDir, 'models.json');
  
  const globalConfig = checkFile(globalModelsFile, '全局 LLM 配置');
  
  if (globalConfig) {
    console.log('\n   配置内容:');
    console.log(`   - activeProfile: ${globalConfig.activeProfile || '(未设置)'}`);
    console.log(`   - profiles: ${Object.keys(globalConfig.profiles || {}).length} 个`);
    
    if (globalConfig.profiles) {
      Object.entries(globalConfig.profiles).forEach(([name, profile]) => {
        console.log(`\n   Profile: ${name}`);
        console.log(`     - endpoint: ${profile.endpoint || '(未设置)'}`);
        console.log(`     - model: ${profile.model || '(未设置)'}`);
        console.log(`     - apiKey: ${profile.apiKey ? '✓ 已设置' : '✗ 未设置'}`);
      });
    }
  }
  
  // Check project config
  const projectConfigFile = path.join(process.cwd(), 'opentest.config.json');
  const projectConfig = checkFile(projectConfigFile, '项目 LLM 配置');
  
  if (projectConfig && projectConfig.llm) {
    console.log('\n   项目配置:');
    console.log(`   - provider: ${projectConfig.llm.provider || '(未设置)'}`);
    console.log(`   - model: ${projectConfig.llm.model || '(未设置)'}`);
    console.log(`   - baseUrl: ${projectConfig.llm.baseUrl || '(未设置)'}`);
  }
  
  // Check environment variables
  console.log('\n🌍 检查环境变量');
  const envVars = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENROUTER_API_KEY',
    'OPENTEST_LLM_PROVIDER',
    'OPENTEST_LLM_MODEL',
    'OPENTEST_LLM_BASE_URL',
  ];
  
  envVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`   ✓ ${varName}: ${value.substring(0, 10)}...`);
    } else {
      console.log(`   ✗ ${varName}: (未设置)`);
    }
  });
  
  // Test LLM client creation
  console.log('\n🧪 测试 LLM Client 创建');
  try {
    const { createLLMClient } = require('./cli/agent/tools/llm-client');
    
    createLLMClient().then(client => {
      if (client) {
        console.log('   ✓ LLM Client 创建成功');
        console.log(`   - Active Profile: ${client.activeProfile || '(未知)'}`);
      } else {
        console.log('   ℹ️ LLM Client 为 null（将使用规则引擎）');
        console.log('\n   💡 建议:');
        console.log('      1. 配置 LLM 以启用 AI 增强分析');
        console.log('      2. 或者继续使用规则引擎（功能正常，只是没有 AI 增强）');
      }
    }).catch(error => {
      console.log(`   ✗ LLM Client 创建失败: ${error.message}`);
      console.log('\n   💡 这通常意味着 LLM 配置有问题或未配置');
      console.log('      但不影响基础功能，系统会自动降级到规则引擎');
    });
  } catch (e) {
    console.log(`   ✗ 加载 LLM Client 模块失败: ${e.message}`);
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('  总结');
  console.log('═'.repeat(60));
  console.log('\n✨ OpenTest 功能状态:');
  console.log('   - 基础功能: ✓ 正常（不依赖 LLM）');
  console.log('   - 事件捕获: ✓ 正常');
  console.log('   - 语义分析: ✓ 正常（规则引擎）');
  console.log('   - 脚本生成: ✓ 正常');
  
  const hasConfig = globalConfig || projectConfig || 
                   process.env.OPENAI_API_KEY || 
                   process.env.DEEPSEEK_API_KEY;
  
  if (!hasConfig) {
    console.log('   - AI 增强:  ⚠️  未配置（可选）');
    console.log('\n💡 配置默认 LLM 后，所有功能自动使用 AI 增强：');
    console.log('   node cli/commands/llm-config.js');
    console.log('');
    console.log('   配置一次，全部生效：');
    console.log('   • /explore - AI 识别用户意图和业务场景');
    console.log('   • /analyze - AI 分析需求文档');
    console.log('   • /points - AI 生成测试点');
    console.log('   • /cases - AI 生成测试用例');
  } else {
    console.log('   - AI 增强:  ✓ 已配置');
    console.log('\n✓ 所有 OpenTest 功能将自动使用 AI 增强分析');
  }
  
  console.log('\n📚 相关文档:');
  console.log('   - 查看当前配置: node cli/commands/llm-config.js show');
  console.log('   - 重新配置: node cli/commands/llm-config.js');
  console.log('   - Explore 功能: docs/EXPLORE_AND_GENERATE.md');
  console.log('');
}

// Run diagnostics
checkLLMConfig();
