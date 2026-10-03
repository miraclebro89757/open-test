'use strict';

const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { execFile: execFileCallback } = require('child_process');
const { promisify } = require('util');

const { detectEnvironment, getBrowserSizeEstimate } = require('./env-detector');
const { loadBrowserConfig, saveBrowserConfig } = require('./config-store');

const execFile = promisify(execFileCallback);

/**
 * Main setup flow - friendly TUI for browser environment configuration
 * @param {Object} options Setup options
 * @param {boolean} options.force Force reconfiguration even if already set up
 * @returns {Promise<Object>} Setup result
 */
async function setupBrowserEnvironment(options = {}) {
  const { force = false } = options;
  
  // Check if already configured
  if (!force) {
    const existingConfig = await loadBrowserConfig();
    if (existingConfig.configured && existingConfig.type !== 'none') {
      console.log(chalk.green(`✓ 浏览器环境已配置: ${existingConfig.browser?.name || 'Playwright Chromium'}`));
      console.log(chalk.gray(`  运行 ${chalk.cyan('npx open-test browser setup --force')} 重新配置`));
      return { configured: true, skipped: true, config: existingConfig };
    }
  }
  
  // Clear screen and show welcome
  console.clear();
  console.log(chalk.cyan.bold('\n  🌟 欢迎使用 OpenTest\n'));
  console.log('  OpenTest 是 AI 驱动的测试自动化工具\n');
  console.log('  核心功能：');
  console.log(chalk.green('    ✓') + ' 需求分析和用例生成');
  console.log(chalk.green('    ✓') + ' Bug 分析和测试报告');
  console.log(chalk.yellow('    •') + ' 浏览器自动化录制 (可选)\n');
  
  // Detect environment
  console.log(chalk.blue('  🔍 检测您的环境...\n'));
  const spinner = ora({ text: '  扫描系统浏览器...', spinner: 'dots' }).start();
  
  const env = await detectEnvironment();
  spinner.succeed(chalk.green('  ✅ 环境检测完成'));
  
  // Display detection results
  console.log('\n  检测结果：');
  console.log(chalk.green('    ✅') + ` ${getPlatformName(env.platform)} ${os.release()}`);
  console.log(chalk.green('    ✅') + ` Node.js ${env.nodeVersion}`);
  
  if (env.systemBrowsers.length > 0) {
    env.systemBrowsers.forEach(browser => {
      console.log(chalk.green('    ✅') + ` ${browser.name} v${browser.version}`);
      console.log(chalk.gray(`       ${browser.path}`));
    });
  } else {
    console.log(chalk.yellow('    ⚠️ ') + ' 未检测到系统浏览器 (Chrome/Edge/Chromium)');
  }
  
  if (env.playwright.installed) {
    console.log(chalk.green('    ✅') + ` Playwright Chromium v${env.playwright.version}`);
  } else {
    console.log(chalk.yellow('    ⚠️ ') + ' Playwright 浏览器未安装');
  }
  
  console.log('');
  
  // Build choices
  const choices = await buildSetupChoices(env);
  
  if (choices.length === 0) {
    console.log(chalk.red('  ❌ 未检测到可用的浏览器'));
    console.log(chalk.yellow('  请先安装 Chrome、Edge 或 Chromium，或运行:'));
    console.log(chalk.cyan('    npx playwright install chromium\n'));
    return { configured: false, error: 'no_browsers' };
  }
  
  // User selection
  console.log(chalk.bold('  🌐 浏览器自动化环境配置\n'));
  console.log('  录制功能需要浏览器支持，用于：');
  console.log('    • 录制 UI 操作生成测试脚本');
  console.log('    • 捕获 API 请求生成 API 测试');
  console.log('    • 回放和调试自动化测试\n');
  
  const { browserChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'browserChoice',
      message: '请选择配置方式：',
      choices,
      pageSize: 10,
    },
  ]);
  
  // Handle selection
  if (browserChoice.type === 'skip') {
    console.log(chalk.yellow('\n  ⏭  已跳过，可稍后运行 ') + chalk.cyan('npx open-test browser setup') + chalk.yellow(' 配置\n'));
    await saveBrowserConfig({
      type: 'none',
      browser: null,
    });
    return { configured: false, skipped: true };
  }
  
  if (browserChoice.type === 'system') {
    return await configureSystemBrowser(browserChoice.browser);
  } else if (browserChoice.type === 'playwright') {
    return await installPlaywrightBrowser();
  }
}

/**
 * Build setup choices based on detected environment
 * @param {Object} env Environment detection result
 * @returns {Array} inquirer choices
 */
async function buildSetupChoices(env) {
  const choices = [];
  
  // 1. System browser option (priority)
  if (env.systemBrowsers.length > 0) {
    const primaryBrowser = env.systemBrowsers.find(b => b.recommended) || env.systemBrowsers[0];
    choices.push({
      name: `使用系统 ${primaryBrowser.name} ${chalk.green('(推荐)')}\n    ${chalk.gray('无需下载，立即可用')}`,
      value: { type: 'system', browser: primaryBrowser },
      short: `系统 ${primaryBrowser.name}`,
    });
  }
  
  // 2. Playwright Chromium option
  const sizes = getBrowserSizeEstimate();
  if (env.playwright.installed) {
    choices.push({
      name: `使用 Playwright Chromium ${chalk.green('(已安装)')}\n    ${chalk.gray('专用测试浏览器，完全兼容')}`,
      value: { type: 'playwright' },
      short: 'Playwright Chromium',
    });
  } else {
    choices.push({
      name: `安装 Playwright Chromium\n    ${chalk.gray('专用测试浏览器，完全兼容')}\n    ${chalk.yellow(`需要：下载 ${sizes.download}，占用 ${sizes.disk}`)}`,
      value: { type: 'playwright' },
      short: 'Playwright Chromium',
    });
  }
  
  // 3. Skip option
  choices.push({
    name: `稍后配置\n    ${chalk.gray('跳过录制功能，使用其他测试功能')}`,
    value: { type: 'skip' },
    short: '稍后配置',
  });
  
  return choices;
}

/**
 * Configure system browser
 * @param {Object} browser Browser info from detection
 * @returns {Promise<Object>}
 */
async function configureSystemBrowser(browser) {
  console.log(chalk.blue(`\n  ⚙️  配置 ${browser.name}...\n`));
  
  // Verify browser works
  console.log('  🔬 验证浏览器...');
  const spinner = ora({ text: '  启动浏览器...', spinner: 'dots' }).start();
  
  try {
    // Use playwright-core to test system browser
    const { chromium } = require('playwright-core');
    const browserInstance = await chromium.launch({
      executablePath: browser.path,
      headless: true,
      timeout: 30000,
    });
    
    // Simple page test
    const context = await browserInstance.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');
    await browserInstance.close();
    
    spinner.succeed(chalk.green('  ✅ 浏览器验证成功！'));
    
    // Save configuration
    const config = {
      type: 'system',
      browser: {
        name: browser.name,
        type: browser.type,
        path: browser.path,
        version: browser.version,
        channel: browser.channel,
      },
    };
    
    await saveBrowserConfig(config);
    
    // Generate playwright config if needed
    await generatePlaywrightConfig(config);
    
    console.log(chalk.green('\n  ✨ 配置完成！现在可以使用录制功能了\n'));
    
    return { configured: true, config };
    
  } catch (error) {
    spinner.fail(chalk.red('  ❌ 验证失败'));
    console.error(chalk.red(`\n  错误: ${error.message}\n`));
    
    // Ask if user wants to try Playwright instead
    const { fallback } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'fallback',
        message: '是否尝试安装 Playwright Chromium?',
        default: true,
      },
    ]);
    
    if (fallback) {
      return await installPlaywrightBrowser();
    }
    
    return { configured: false, error: error.message };
  }
}

/**
 * Install Playwright browser
 * @returns {Promise<Object>}
 */
async function installPlaywrightBrowser() {
  console.log(chalk.blue('\n  📦 准备安装 Playwright Chromium...\n'));
  
  const sizes = getBrowserSizeEstimate();
  
  // Display installation info
  console.log('  安装要求：');
  console.log(`    • 磁盘空间：${sizes.disk}`);
  console.log(`    • 网络下载：${sizes.download}`);
  console.log(`    • 预计时间：2-5 分钟\n`);
  
  // Confirm installation
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '确认安装?',
      default: true,
    },
  ]);
  
  if (!confirm) {
    console.log(chalk.yellow('  已取消\n'));
    return { configured: false, cancelled: true };
  }
  
  // Install
  console.log('');
  const spinner = ora({ text: '  正在安装 Playwright Chromium...', spinner: 'dots' }).start();
  
  try {
    // Run playwright install chromium
    await execFile('npx', ['playwright', 'install', 'chromium'], {
      cwd: process.cwd(),
      timeout: 10 * 60 * 1000, // 10 minutes
    });
    
    spinner.succeed(chalk.green('  ✅ 安装成功！'));
    
    // Verify installation
    console.log('\n  🔬 验证安装...');
    const verifyResult = await verifyPlaywrightBrowser();
    
    if (verifyResult.success) {
      console.log(chalk.green(`  ✅ 验证成功！版本: ${verifyResult.version}\n`));
      
      const config = {
        type: 'playwright',
        browser: {
          name: 'Playwright Chromium',
          type: 'chromium',
          version: verifyResult.version,
        },
      };
      
      await saveBrowserConfig(config);
      await generatePlaywrightConfig(config);
      
      console.log(chalk.green('  ✨ 配置完成！现在可以使用录制功能了\n'));
      
      return { configured: true, config };
    } else {
      console.error(chalk.red(`  ❌ 验证失败: ${verifyResult.message}\n`));
      return { configured: false, error: verifyResult.message };
    }
    
  } catch (error) {
    spinner.fail(chalk.red('  ❌ 安装失败'));
    console.error(chalk.red(`\n  错误: ${error.message}\n`));
    return { configured: false, error: error.message };
  }
}

/**
 * Verify Playwright browser installation
 * @returns {Promise<Object>}
 */
async function verifyPlaywrightBrowser() {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const version = browser.version();
    await browser.close();
    
    return { success: true, version };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Generate playwright.config.js based on browser config
 * @param {Object} config Browser configuration
 * @returns {Promise<void>}
 */
async function generatePlaywrightConfig(config) {
  const configPath = path.join(process.cwd(), 'playwright.config.js');
  
  // Check if config already exists
  try {
    await fs.access(configPath);
    // Config exists, don't overwrite
    return;
  } catch {
    // Config doesn't exist, create it
  }
  
  let configContent = '';
  
  if (config.type === 'system') {
    configContent = `// Auto-generated by OpenTest
// Using system browser: ${config.browser.name}

module.exports = {
  use: {
    channel: '${config.browser.type}', // Use system ${config.browser.name}
    // Alternative: specify exact path
    // executablePath: '${config.browser.path}',
    
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
};
`;
  } else if (config.type === 'playwright') {
    configContent = `// Auto-generated by OpenTest
// Using Playwright Chromium

module.exports = {
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
};
`;
  }
  
  if (configContent) {
    await fs.writeFile(configPath, configContent, 'utf8');
  }
}

/**
 * Get human-readable platform name
 * @param {string} platform Process platform
 * @returns {string}
 */
function getPlatformName(platform) {
  const names = {
    darwin: 'macOS',
    win32: 'Windows',
    linux: 'Linux',
  };
  return names[platform] || platform;
}

module.exports = {
  setupBrowserEnvironment,
  configureSystemBrowser,
  installPlaywrightBrowser,
  verifyPlaywrightBrowser,
};
