'use strict';

const chalk = require('chalk');
const { detectEnvironment } = require('../browser/env-detector');
const { loadBrowserConfig, resetBrowserConfig, getConfigPath } = require('../browser/config-store');
const { setupBrowserEnvironment, verifyPlaywrightBrowser } = require('../browser/setup');

/**
 * Register browser command with commander
 * @param {Command} program Commander program
 */
function registerBrowserCommand(program) {
  const browser = program
    .command('browser')
    .description('🌐 浏览器环境管理');
  
  // browser setup
  browser
    .command('setup')
    .description('配置浏览器环境')
    .option('--force', '强制重新配置')
    .action(async (options) => {
      await setupBrowserEnvironment({ force: options.force });
    });
  
  // browser status
  browser
    .command('status')
    .description('查看浏览器配置状态')
    .action(async () => {
      await showBrowserStatus();
    });
  
  // browser verify
  browser
    .command('verify')
    .description('验证浏览器配置')
    .action(async () => {
      await verifyBrowserConfiguration();
    });
  
  // browser reset
  browser
    .command('reset')
    .description('重置浏览器配置')
    .action(async () => {
      await resetBrowserConfiguration();
    });
  
  // browser detect
  browser
    .command('detect')
    .description('检测系统浏览器')
    .action(async () => {
      await detectBrowsers();
    });
}

/**
 * Show browser configuration status
 */
async function showBrowserStatus() {
  console.log(chalk.bold('\n🌐 浏览器配置状态\n'));
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  
  const config = await loadBrowserConfig();
  
  if (!config.configured || config.type === 'none') {
    console.log(chalk.yellow('⚠️  浏览器环境未配置'));
    console.log(chalk.gray(`   运行 ${chalk.cyan('npx open-test browser setup')} 进行配置\n`));
    return;
  }
  
  console.log(chalk.green('✅ 浏览器环境已配置\n'));
  console.log(chalk.bold('配置详情：'));
  console.log(`  类型：${config.type === 'system' ? '系统浏览器' : 'Playwright Chromium'}`);
  
  if (config.browser) {
    console.log(`  名称：${config.browser.name}`);
    if (config.browser.version) {
      console.log(`  版本：${config.browser.version}`);
    }
    if (config.browser.path) {
      console.log(`  路径：${chalk.gray(config.browser.path)}`);
    }
  }
  
  if (config.configuredAt) {
    const date = new Date(config.configuredAt);
    console.log(`  配置时间：${date.toLocaleString('zh-CN')}`);
  }
  
  console.log(`\n  配置文件：${chalk.gray(getConfigPath())}\n`);
}

/**
 * Verify browser configuration
 */
async function verifyBrowserConfiguration() {
  console.log(chalk.bold('\n🔬 验证浏览器配置\n'));
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  
  const config = await loadBrowserConfig();
  
  if (!config.configured || config.type === 'none') {
    console.log(chalk.red('❌ 浏览器环境未配置'));
    console.log(chalk.gray(`   运行 ${chalk.cyan('npx open-test browser setup')} 进行配置\n`));
    return;
  }
  
  console.log('正在验证浏览器...\n');
  
  try {
    if (config.type === 'system') {
      // Verify system browser
      const { chromium } = require('playwright-core');
      const browser = await chromium.launch({
        executablePath: config.browser.path,
        headless: true,
        timeout: 30000,
      });
      
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('about:blank');
      await browser.close();
      
      console.log(chalk.green('✅ 系统浏览器验证成功！'));
      console.log(`   ${config.browser.name} v${config.browser.version}\n`);
      
    } else if (config.type === 'playwright') {
      // Verify Playwright browser
      const result = await verifyPlaywrightBrowser();
      
      if (result.success) {
        console.log(chalk.green('✅ Playwright Chromium 验证成功！'));
        console.log(`   版本: ${result.version}\n`);
      } else {
        console.log(chalk.red('❌ Playwright Chromium 验证失败'));
        console.log(chalk.red(`   ${result.message}\n`));
        console.log(chalk.gray(`   尝试运行 ${chalk.cyan('npx playwright install chromium')}\n`));
      }
    }
  } catch (error) {
    console.log(chalk.red('❌ 浏览器验证失败'));
    console.error(chalk.red(`   ${error.message}\n`));
    console.log(chalk.gray(`   运行 ${chalk.cyan('npx open-test browser setup --force')} 重新配置\n`));
  }
}

/**
 * Reset browser configuration
 */
async function resetBrowserConfiguration() {
  console.log(chalk.bold('\n🔄 重置浏览器配置\n'));
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  
  const config = await loadBrowserConfig();
  
  if (!config.configured) {
    console.log(chalk.yellow('⚠️  浏览器环境未配置，无需重置\n'));
    return;
  }
  
  await resetBrowserConfig();
  console.log(chalk.green('✅ 浏览器配置已重置'));
  console.log(chalk.gray(`   运行 ${chalk.cyan('npx open-test browser setup')} 重新配置\n`));
}

/**
 * Detect system browsers
 */
async function detectBrowsers() {
  console.log(chalk.bold('\n🔍 检测系统浏览器\n'));
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  
  const env = await detectEnvironment();
  
  // System info
  console.log(chalk.bold('系统信息：'));
  console.log(`  平台：${env.platform} (${env.arch})`);
  console.log(`  Node.js：${env.nodeVersion}\n`);
  
  // System browsers
  console.log(chalk.bold('系统浏览器：'));
  if (env.systemBrowsers.length > 0) {
    env.systemBrowsers.forEach((browser, index) => {
      const icon = browser.recommended ? chalk.green('✅') : chalk.blue('ℹ️');
      console.log(`${icon} ${browser.name} v${browser.version}`);
      console.log(chalk.gray(`   ${browser.path}`));
      if (index < env.systemBrowsers.length - 1) console.log('');
    });
  } else {
    console.log(chalk.yellow('  ⚠️  未检测到系统浏览器 (Chrome/Edge/Chromium)'));
  }
  
  console.log('');
  
  // Playwright
  console.log(chalk.bold('Playwright：'));
  if (env.playwright.installed) {
    console.log(chalk.green(`✅ Chromium v${env.playwright.version}`));
    if (env.playwright.browsers.length > 0) {
      env.playwright.browsers.forEach(browser => {
        console.log(chalk.gray(`   ${browser.path}`));
      });
    }
  } else {
    console.log(chalk.yellow('  ⚠️  Playwright 浏览器未安装'));
    console.log(chalk.gray(`     运行 ${chalk.cyan('npx playwright install chromium')} 安装`));
  }
  
  console.log('');
}

module.exports = {
  registerBrowserCommand,
  showBrowserStatus,
  verifyBrowserConfiguration,
};
