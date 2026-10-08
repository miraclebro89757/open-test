#!/usr/bin/env node
/**
 * LLM Configuration Wizard
 * 
 * 帮助用户快速配置默认 LLM，配置后所有功能自动使用
 */

const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const { writeProfile } = require('../llm/config-store');

const LLM_PRESETS = {
  deepseek: {
    name: 'DeepSeek',
    description: 'DeepSeek API - 性价比最高（推荐）',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    envVar: 'DEEPSEEK_API_KEY',
    keyExample: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docs: 'https://platform.deepseek.com/',
  },
  openai: {
    name: 'OpenAI',
    description: 'OpenAI GPT-4 - 最强大的模型',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    envVar: 'OPENAI_API_KEY',
    keyExample: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docs: 'https://platform.openai.com/',
  },
  anthropic: {
    name: 'Anthropic',
    description: 'Claude - 代码理解能力强',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
    envVar: 'ANTHROPIC_API_KEY',
    keyExample: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docs: 'https://console.anthropic.com/',
  },
  openrouter: {
    name: 'OpenRouter',
    description: 'OpenRouter - 统一多个模型供应商',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
    envVar: 'OPENROUTER_API_KEY',
    keyExample: 'sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docs: 'https://openrouter.ai/',
  },
  ollama: {
    name: 'Ollama',
    description: 'Ollama - 本地运行（免费，需先安装 Ollama）',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:14b',
    envVar: null,
    keyExample: 'ollama-no-key-required',
    docs: 'https://ollama.ai/',
  },
  custom: {
    name: '自定义',
    description: '自定义 OpenAI 兼容 API',
    provider: 'custom',
    baseUrl: null,
    model: null,
    envVar: null,
    keyExample: null,
    docs: null,
  },
};

async function configureDefaultLLM() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  OpenTest 默认 LLM 配置');
  console.log('═'.repeat(60));
  console.log('');
  console.log('配置后，所有功能自动使用这个 LLM：');
  console.log('  • /explore - 浏览器探索与脚本生成');
  console.log('  • /analyze - 需求分析');
  console.log('  • /points - 测试点生成');
  console.log('  • /cases - 测试用例生成');
  console.log('  • API 分析、选择器修复等');
  console.log('');
  
  // Step 1: Choose provider
  const providerChoices = Object.entries(LLM_PRESETS).map(([key, preset]) => ({
    name: `${preset.name} - ${preset.description}`,
    value: key,
  }));
  
  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: '选择 LLM 供应商:',
      choices: providerChoices,
      default: 'deepseek',
    },
  ]);
  
  const preset = LLM_PRESETS[provider];
  console.log('');
  
  let config = {
    provider: preset.provider,
    baseUrl: preset.baseUrl,
    model: preset.model,
  };
  
  // Step 2: Configure based on provider
  if (provider === 'custom') {
    // Custom configuration
    const customAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'API Base URL:',
        default: 'https://api.openai.com/v1',
      },
      {
        type: 'input',
        name: 'model',
        message: '模型名称:',
        default: 'gpt-4o-mini',
      },
      {
        type: 'input',
        name: 'apiKey',
        message: 'API Key:',
      },
    ]);
    
    config = {
      provider: 'custom',
      baseUrl: customAnswers.baseUrl,
      model: customAnswers.model,
      apiKey: customAnswers.apiKey,
    };
    
  } else if (provider === 'ollama') {
    // Ollama configuration
    console.log(`✓ ${preset.name} 不需要 API Key`);
    console.log('');
    
    const { ollamaModel, ollamaUrl } = await inquirer.prompt([
      {
        type: 'input',
        name: 'ollamaUrl',
        message: 'Ollama URL:',
        default: preset.baseUrl,
      },
      {
        type: 'input',
        name: 'ollamaModel',
        message: '模型名称:',
        default: preset.model,
      },
    ]);
    
    config.baseUrl = ollamaUrl;
    config.model = ollamaModel;
    config.apiKey = 'ollama-no-key-required';
    
  } else {
    // API key based providers
    console.log(`配置 ${preset.name}`);
    if (preset.docs) {
      console.log(`获取 API Key: ${preset.docs}`);
    }
    console.log('');
    
    const { useEnvVar } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useEnvVar',
        message: `使用环境变量 ${preset.envVar}?`,
        default: true,
      },
    ]);
    
    if (useEnvVar) {
      // Use environment variable
      config.apiKey = `\${${preset.envVar}}`;
      console.log('');
      console.log(`✓ 将使用环境变量 ${preset.envVar}`);
      console.log('');
      console.log('请设置环境变量:');
      console.log(`  export ${preset.envVar}="your-api-key"`);
      console.log('');
      console.log('或添加到 ~/.bashrc 或 ~/.zshrc 以持久化');
      console.log('');
      
    } else {
      // Enter API key directly
      const { apiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'API Key:',
          mask: '*',
        },
      ]);
      
      config.apiKey = apiKey;
    }
    
    // Optional: customize model
    const { customizeModel } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'customizeModel',
        message: `使用默认模型 ${preset.model}?`,
        default: true,
      },
    ]);
    
    if (!customizeModel) {
      const { model } = await inquirer.prompt([
        {
          type: 'input',
          name: 'model',
          message: '模型名称:',
          default: preset.model,
        },
      ]);
      config.model = model;
    }
  }
  
  // Step 3: Choose scope
  const { scope } = await inquirer.prompt([
    {
      type: 'list',
      name: 'scope',
      message: '配置范围:',
      choices: [
        {
          name: '项目级 (opentest.config.json) - 推荐',
          value: 'project',
        },
        {
          name: '全局级 (~/.opentest/models.json)',
          value: 'user',
        },
      ],
      default: 'project',
    },
  ]);
  
  // Step 4: Write configuration
  console.log('');
  console.log('正在保存配置...');
  
  try {
    const result = writeProfile({
      scope,
      profileName: 'default',
      profile: config,
      activate: true,
    });
    
    console.log('');
    console.log('✅ 配置成功！');
    console.log('');
    console.log(`配置文件: ${result.filePath}`);
    console.log(`配置范围: ${result.scope === 'project' ? '项目级' : '全局级'}`);
    console.log(`供应商: ${config.provider}`);
    console.log(`模型: ${config.model}`);
    console.log('');
    console.log('现在所有 OpenTest 功能都会自动使用这个 LLM！');
    console.log('');
    console.log('测试配置:');
    console.log('  node diagnose-llm.js');
    console.log('');
    console.log('使用示例:');
    console.log('  /explore https://example.com');
    console.log('  /analyze @requirements.md');
    console.log('');
    
    if (result.warning) {
      console.log('⚠️  警告:');
      console.log(result.warning);
      console.log('');
    }
    
  } catch (error) {
    console.error('');
    console.error('❌ 配置失败:', error.message);
    console.error('');
    process.exit(1);
  }
}

async function showCurrentConfig() {
  const { resolveLLMConfig } = require('../llm/config-store');
  
  try {
    const config = resolveLLMConfig({
      cwd: process.cwd(),
      env: process.env,
    });
    
    console.log('');
    console.log('═'.repeat(60));
    console.log('  当前 LLM 配置');
    console.log('═'.repeat(60));
    console.log('');
    console.log(`活动 Profile: ${config.activeProfile}`);
    console.log(`来源: ${config.profileSource}`);
    console.log('');
    console.log('配置详情:');
    console.log(`  供应商: ${config.config.provider}`);
    console.log(`  模型: ${config.config.model}`);
    console.log(`  Base URL: ${config.config.baseUrl || '(默认)'}`);
    console.log(`  API Key: ${config.profiles[0]?.maskedKey || '(未设置)'}`);
    console.log('');
    
    if (config.profiles.length > 1) {
      console.log('可用 Profiles:');
      config.profiles.forEach(profile => {
        const active = profile.name === config.activeProfile ? '✓' : ' ';
        const usable = profile.usable ? '✓' : '✗';
        console.log(`  [${active}] ${profile.name} (${profile.provider}/${profile.model}) [${usable}]`);
      });
      console.log('');
    }
    
  } catch (error) {
    console.log('');
    console.log('❌ 未配置 LLM');
    console.log('');
    console.log('运行以下命令配置:');
    console.log('  node cli/commands/llm-config.js');
    console.log('');
  }
}

async function main() {
  const command = process.argv[2];
  
  if (command === 'show' || command === 'status') {
    await showCurrentConfig();
  } else {
    await configureDefaultLLM();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { configureDefaultLLM, showCurrentConfig };
