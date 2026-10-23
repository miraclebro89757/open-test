'use strict';

const chalk = require('chalk');
const { detectEnvironment } = require('../browser/env-detector');
const { resetBrowserConfig, getConfigPath } = require('../browser/config-store');
const { setupBrowserEnvironment } = require('../browser/setup');
const { describeRecordingBrowser } = require('../browser/recording-browser');

function registerBrowserCommand(program) {
  const browser = program
    .command('browser')
    .description('录制用的浏览器');

  browser
    .command('setup')
    .description('使用本机 Chrome；没有则安装 Playwright Chromium')
    .option('--force', '再检查一次。有 Chrome 时仍使用 Chrome')
    .action(async () => {
      await setupBrowserEnvironment();
    });

  browser
    .command('status')
    .description('查看录制会使用哪一个浏览器')
    .action(async () => {
      await showBrowserStatus();
    });

  browser
    .command('verify')
    .description('启动录制会使用的浏览器')
    .action(async () => {
      await verifyBrowserConfiguration();
    });

  browser
    .command('reset')
    .description('删掉旧的浏览器选择')
    .action(async () => {
      await resetBrowserConfiguration();
    });

  browser
    .command('detect')
    .description('检测本机 Chrome')
    .action(async () => {
      await detectBrowsers();
    });
}

async function showBrowserStatus() {
  console.log(chalk.bold('\n录制浏览器\n'));
  const browser = await describeRecordingBrowser();
  if (!browser.ready) {
    console.log(chalk.yellow('没有找到本机 Chrome，Playwright Chromium 也还没安装'));
    console.log(chalk.gray('  运行 npx opentest-ai install\n'));
    return;
  }
  if (browser.source === 'chrome') {
    console.log(chalk.green(`本机 Chrome ${browser.version}`));
  } else {
    console.log(chalk.green(`Playwright Chromium ${browser.version}`));
    console.log(chalk.gray('  本机没有 Chrome，录制使用下载的浏览器'));
  }
  if (browser.path) console.log(chalk.gray(`  ${browser.path}`));
  console.log('');
}

async function verifyBrowserConfiguration() {
  console.log(chalk.bold('\n验证录制浏览器\n'));
  const browser = await describeRecordingBrowser();
  if (!browser.ready) {
    console.log(chalk.red('还没有可用的浏览器'));
    console.log(chalk.gray('  运行 npx opentest-ai install\n'));
    return;
  }
  try {
    const { chromium } = require('playwright');
    const launched = await chromium.launch({
      headless: true,
      timeout: 30000,
      ...(browser.source === 'chrome' ? { executablePath: browser.path } : {}),
    });
    const context = await launched.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');
    await launched.close();
    console.log(chalk.green(`可以启动 ${browser.name} ${browser.version || ''}\n`));
  } catch (error) {
    console.log(chalk.red('浏览器没有启动'));
    console.error(chalk.red(`  ${error.message}\n`));
  }
}

async function resetBrowserConfiguration() {
  await resetBrowserConfig();
  console.log(chalk.green('\n已删掉旧的浏览器选择'));
  console.log(chalk.gray(`  ${getConfigPath()}`));
  console.log(chalk.gray('  录制现在自动使用本机 Chrome，找不到再下载\n'));
}

async function detectBrowsers() {
  console.log(chalk.bold('\n检测浏览器\n'));
  const env = await detectEnvironment();
  const chosen = await describeRecordingBrowser();
  console.log(`平台：${env.platform} (${env.arch})`);
  console.log(`Node.js：${env.nodeVersion}\n`);
  if (chosen.ready && chosen.source === 'chrome') {
    console.log(chalk.green(`录制使用本机 Chrome ${chosen.version}`));
    console.log(chalk.gray(`  ${chosen.path}\n`));
  } else if (chosen.ready) {
    console.log(chalk.yellow('没有找到本机 Chrome'));
    console.log(chalk.green(`录制使用已下载的 Playwright Chromium ${chosen.version}\n`));
  } else {
    console.log(chalk.yellow('没有找到本机 Chrome，也还没有下载 Playwright Chromium'));
    console.log(chalk.gray('  运行 npx opentest-ai install\n'));
  }
}

module.exports = {
  registerBrowserCommand,
  showBrowserStatus,
  verifyBrowserConfiguration,
};
