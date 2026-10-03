#!/usr/bin/env node

/**
 * 测试首次启动的浏览器配置流程
 * 
 * 使用方法：
 * 1. node test-first-run.js detect - 只检测环境
 * 2. node test-first-run.js setup - 运行完整配置流程
 * 3. node test-first-run.js status - 查看当前配置状态
 * 4. node test-first-run.js reset - 重置配置（模拟首次运行）
 */

const { detectEnvironment } = require('./cli/browser/env-detector');
const { loadBrowserConfig, resetBrowserConfig, getConfigPath } = require('./cli/browser/config-store');
const { setupBrowserEnvironment } = require('./cli/browser/setup');
const chalk = require('chalk');

async function main() {
  const command = process.argv[2] || 'detect';
  
  console.log(chalk.cyan.bold('\n🧪 OpenTest 浏览器配置测试工具\n'));
  
  switch (command) {
    case 'detect':
      await testDetection();
      break;
    
    case 'setup':
      await testSetup();
      break;
    
    case 'status':
      await testStatus();
      break;
    
    case 'reset':
      await testReset();
      break;
    
    case 'help':
    default:
      showHelp();
      break;
  }
}

async function testDetection() {
  console.log(chalk.blue('📍 步骤 1: 环境检测\n'));
  console.log(chalk.gray('正在检测您的系统环境...\n'));
  
  const env = await detectEnvironment();
  
  console.log(chalk.bold('系统信息：'));
  console.log(`  平台: ${env.platform}`);
  console.log(`  架构: ${env.arch}`);
  console.log(`  Node.js: ${env.nodeVersion}\n`);
  
  console.log(chalk.bold('系统浏览器检测结果：'));
  if (env.systemBrowsers.length > 0) {
    console.log(chalk.green(`  ✅ 找到 ${env.systemBrowsers.length} 个浏览器\n`));
    env.systemBrowsers.forEach((browser, index) => {
      const icon = browser.recommended ? '⭐' : '  ';
      console.log(`  ${icon} ${index + 1}. ${browser.name}`);
      console.log(chalk.gray(`     版本: ${browser.version}`));
      console.log(chalk.gray(`     类型: ${browser.type}`));
      console.log(chalk.gray(`     路径: ${browser.path}`));
      if (browser.recommended) {
        console.log(chalk.yellow(`     推荐: 是`));
      }
      console.log('');
    });
  } else {
    console.log(chalk.yellow('  ⚠️  未检测到系统浏览器\n'));
  }
  
  console.log(chalk.bold('Playwright 浏览器：'));
  if (env.playwright.installed) {
    console.log(chalk.green(`  ✅ 已安装 (v${env.playwright.version})\n`));
    if (env.playwright.browsers.length > 0) {
      env.playwright.browsers.forEach(browser => {
        console.log(`     ${browser.name}`);
        console.log(chalk.gray(`     ${browser.path}\n`));
      });
    }
  } else {
    console.log(chalk.yellow('  ⚠️  未安装\n'));
  }
  
  // 检查当前配置
  const config = await loadBrowserConfig();
  console.log(chalk.bold('当前配置状态：'));
  if (config.configured) {
    console.log(chalk.green(`  ✅ 已配置 (${config.type})`));
    if (config.browser) {
      console.log(`     浏览器: ${config.browser.name}`);
    }
  } else {
    console.log(chalk.yellow('  ⚠️  未配置 (首次运行状态)'));
  }
  console.log(chalk.gray(`  配置文件: ${getConfigPath()}\n`));
  
  // 提示
  console.log(chalk.cyan('💡 提示：'));
  console.log(chalk.gray('  • 运行 ') + chalk.cyan('node test-first-run.js setup') + chalk.gray(' 体验完整配置流程'));
  console.log(chalk.gray('  • 运行 ') + chalk.cyan('node test-first-run.js reset') + chalk.gray(' 重置配置模拟首次运行'));
  console.log('');
}

async function testSetup() {
  console.log(chalk.blue('📍 步骤 2: 完整配置流程\n'));
  
  const config = await loadBrowserConfig();
  if (config.configured) {
    console.log(chalk.yellow('⚠️  检测到已有配置：'));
    console.log(`   类型: ${config.type}`);
    if (config.browser) {
      console.log(`   浏览器: ${config.browser.name}`);
    }
    console.log('');
    console.log(chalk.gray('提示: 使用 ') + chalk.cyan('--force') + chalk.gray(' 参数强制重新配置'));
    console.log(chalk.gray('或运行 ') + chalk.cyan('node test-first-run.js reset') + chalk.gray(' 先重置\n'));
    return;
  }
  
  console.log(chalk.green('✅ 未检测到配置，模拟首次运行场景\n'));
  console.log(chalk.gray('即将启动 TUI 配置界面...\n'));
  
  // 运行配置流程
  await setupBrowserEnvironment();
}

async function testStatus() {
  console.log(chalk.blue('📍 步骤 3: 配置状态\n'));
  
  const config = await loadBrowserConfig();
  
  if (!config.configured || config.type === 'none') {
    console.log(chalk.yellow('⚠️  浏览器环境未配置'));
    console.log(chalk.gray('\n提示: 运行 ') + chalk.cyan('node test-first-run.js setup') + chalk.gray(' 进行配置\n'));
    return;
  }
  
  console.log(chalk.green('✅ 浏览器环境已配置\n'));
  console.log(chalk.bold('配置详情：'));
  console.log(`  类型: ${config.type === 'system' ? '系统浏览器' : 'Playwright Chromium'}`);
  
  if (config.browser) {
    console.log(`  名称: ${config.browser.name}`);
    if (config.browser.version) {
      console.log(`  版本: ${config.browser.version}`);
    }
    if (config.browser.path) {
      console.log(chalk.gray(`  路径: ${config.browser.path}`));
    }
  }
  
  if (config.configuredAt) {
    const date = new Date(config.configuredAt);
    console.log(`  配置时间: ${date.toLocaleString('zh-CN')}`);
  }
  
  console.log(chalk.gray(`\n  配置文件: ${getConfigPath()}\n`));
}

async function testReset() {
  console.log(chalk.blue('📍 步骤 4: 重置配置\n'));
  
  const config = await loadBrowserConfig();
  
  if (!config.configured) {
    console.log(chalk.yellow('⚠️  当前未配置，无需重置\n'));
    return;
  }
  
  console.log(chalk.yellow('准备重置浏览器配置...'));
  console.log(chalk.gray(`配置文件: ${getConfigPath()}\n`));
  
  await resetBrowserConfig();
  
  console.log(chalk.green('✅ 配置已重置！\n'));
  console.log(chalk.cyan('现在可以测试首次运行场景：'));
  console.log(chalk.gray('  1. 运行 ') + chalk.cyan('node test-first-run.js detect') + chalk.gray(' 验证状态'));
  console.log(chalk.gray('  2. 运行 ') + chalk.cyan('node test-first-run.js setup') + chalk.gray(' 体验配置流程'));
  console.log(chalk.gray('  3. 或运行 ') + chalk.cyan('npx open-test run --skip-browser-setup') + chalk.gray(' 测试实际启动\n'));
}

function showHelp() {
  console.log(chalk.bold('用法：'));
  console.log(chalk.gray('  node test-first-run.js [command]\n'));
  
  console.log(chalk.bold('命令：'));
  console.log(chalk.cyan('  detect') + '  检测环境和当前配置状态（默认）');
  console.log(chalk.cyan('  setup ') + '  运行完整配置流程（TUI 界面）');
  console.log(chalk.cyan('  status') + '  查看当前配置详情');
  console.log(chalk.cyan('  reset ') + '  重置配置，模拟首次运行');
  console.log(chalk.cyan('  help  ') + '  显示帮助信息\n');
  
  console.log(chalk.bold('示例：'));
  console.log(chalk.gray('  # 检测环境'));
  console.log(chalk.cyan('  node test-first-run.js detect\n'));
  
  console.log(chalk.gray('  # 重置配置，模拟首次运行'));
  console.log(chalk.cyan('  node test-first-run.js reset\n'));
  
  console.log(chalk.gray('  # 体验配置流程'));
  console.log(chalk.cyan('  node test-first-run.js setup\n'));
  
  console.log(chalk.gray('  # 查看配置状态'));
  console.log(chalk.cyan('  node test-first-run.js status\n'));
}

main().catch(error => {
  console.error(chalk.red('\n❌ 错误:\n'));
  console.error(error);
  process.exit(1);
});
