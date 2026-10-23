'use strict';

const chalk = require('chalk');
const { ensureRecordingBrowser, installPinnedChromium } = require('./recording-browser');

/**
 * Make the recording browser ready. Uses the installed Google Chrome when
 * this machine has one, and downloads Playwright's matching Chromium otherwise.
 * There is no browser menu: Edge, Brave, and a saved choice are not used.
 */
async function setupBrowserEnvironment() {
  const browser = await ensureRecordingBrowser({
    installChromium: async () => {
      console.log(chalk.blue('没有找到本机 Chrome，正在安装 Playwright Chromium…'));
      await installPinnedChromium();
    },
  });
  if (browser.source === 'chrome') {
    console.log(chalk.green(`使用本机 Chrome ${browser.version}`));
    console.log(chalk.gray(`  ${browser.executablePath}`));
  } else {
    console.log(chalk.green(`Playwright Chromium ${browser.version} 已就绪`));
  }
  return { configured: true, browser };
}

module.exports = {
  setupBrowserEnvironment,
};
