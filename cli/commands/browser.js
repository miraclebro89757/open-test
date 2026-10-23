'use strict';

const chalk = require('chalk');
const { detectEnvironment } = require('../browser/env-detector');
const { resetBrowserConfig, getConfigPath } = require('../browser/config-store');
const { setupBrowserEnvironment } = require('../browser/setup');
const { describeRecordingBrowser } = require('../browser/recording-browser');

function registerBrowserCommand(program) {
  const browser = program
    .command('browser')
    .description('Recording browser');

  browser
    .command('setup')
    .description('Use local Chrome, or install Playwright Chromium when it is missing')
    .option('--force', 'Check again. Chrome is still used when it is installed')
    .action(async () => {
      await setupBrowserEnvironment();
    });

  browser
    .command('status')
    .description('Show which browser recording will use')
    .action(async () => {
      await showBrowserStatus();
    });

  browser
    .command('verify')
    .description('Launch the browser recording will use')
    .action(async () => {
      await verifyBrowserConfiguration();
    });

  browser
    .command('reset')
    .description('Delete the old browser choice')
    .action(async () => {
      await resetBrowserConfiguration();
    });

  browser
    .command('detect')
    .description('Look for local Chrome')
    .action(async () => {
      await detectBrowsers();
    });
}

async function showBrowserStatus() {
  console.log(chalk.bold('\nRecording browser\n'));
  const browser = await describeRecordingBrowser();
  if (!browser.ready) {
    console.log(chalk.yellow('Local Chrome was not found, and Playwright Chromium is not installed'));
    console.log(chalk.gray('  Run: npx opentest-ai install\n'));
    return;
  }
  if (browser.source === 'chrome') {
    console.log(chalk.green(`Local Chrome ${browser.version}`));
  } else {
    console.log(chalk.green(`Playwright Chromium ${browser.version}`));
    console.log(chalk.gray('  Local Chrome was not found, so recording uses the downloaded browser'));
  }
  if (browser.path) console.log(chalk.gray(`  ${browser.path}`));
  console.log('');
}

async function verifyBrowserConfiguration() {
  console.log(chalk.bold('\nVerify the recording browser\n'));
  const browser = await describeRecordingBrowser();
  if (!browser.ready) {
    console.log(chalk.red('No browser is ready'));
    console.log(chalk.gray('  Run: npx opentest-ai install\n'));
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
    console.log(chalk.green(`Launched ${browser.name} ${browser.version || ''}\n`));
  } catch (error) {
    console.log(chalk.red('The browser did not start'));
    console.error(chalk.red(`  ${error.message}\n`));
  }
}

async function resetBrowserConfiguration() {
  await resetBrowserConfig();
  console.log(chalk.green('\nDeleted the old browser choice'));
  console.log(chalk.gray(`  ${getConfigPath()}`));
  console.log(chalk.gray('  Recording now uses local Chrome, and downloads a browser only when Chrome is missing\n'));
}

async function detectBrowsers() {
  console.log(chalk.bold('\nDetect browsers\n'));
  const env = await detectEnvironment();
  const chosen = await describeRecordingBrowser();
  console.log(`Platform: ${env.platform} (${env.arch})`);
  console.log(`Node.js: ${env.nodeVersion}\n`);
  if (chosen.ready && chosen.source === 'chrome') {
    console.log(chalk.green(`Recording uses local Chrome ${chosen.version}`));
    console.log(chalk.gray(`  ${chosen.path}\n`));
  } else if (chosen.ready) {
    console.log(chalk.yellow('Local Chrome was not found'));
    console.log(chalk.green(`Recording uses the downloaded Playwright Chromium ${chosen.version}\n`));
  } else {
    console.log(chalk.yellow('Local Chrome was not found, and Playwright Chromium is not downloaded'));
    console.log(chalk.gray('  Run: npx opentest-ai install\n'));
  }
}

module.exports = {
  registerBrowserCommand,
  showBrowserStatus,
  verifyBrowserConfiguration,
};
