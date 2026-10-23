'use strict';

const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const { detectPlaywrightBrowsers, detectSystemBrowsers } = require('./env-detector');
const { PLAYWRIGHT_VERSION, playwrightInvoke } = require('../agent/tools/playwright-cli');

const execFileAsync = promisify(execFile);
const DOWNLOAD_MIRROR = 'https://npmmirror.com/mirrors/playwright';

function findLocalChrome(browsers) {
  return browsers.find((browser) => browser.name === 'Chrome') || null;
}

async function installPinnedChromium() {
  const command = playwrightInvoke(['install', 'chromium']);
  const options = {
    cwd: path.join(__dirname, '..', '..'),
    timeout: 10 * 60 * 1000,
    env: process.env,
  };
  try {
    await execFileAsync(command.file, command.args, options);
  } catch (error) {
    if (process.env.PLAYWRIGHT_DOWNLOAD_HOST) throw error;
    await execFileAsync(command.file, command.args, {
      ...options,
      env: { ...process.env, PLAYWRIGHT_DOWNLOAD_HOST: DOWNLOAD_MIRROR },
    });
  }
}

/**
 * Chrome when this machine has it. Otherwise the Chromium build that matches
 * the Playwright version shipped with this package.
 */
async function ensureRecordingBrowser({
  findChrome = async () => findLocalChrome(await detectSystemBrowsers()),
  installChromium = installPinnedChromium,
} = {}) {
  const chrome = await findChrome();
  if (chrome) {
    return {
      source: 'chrome',
      name: 'Chrome',
      executablePath: chrome.path,
      version: chrome.version,
    };
  }
  await installChromium();
  return {
    source: 'playwright',
    name: 'Playwright Chromium',
    executablePath: null,
    version: PLAYWRIGHT_VERSION,
  };
}

/** What recording would use right now, without downloading anything. */
async function describeRecordingBrowser() {
  const chrome = findLocalChrome(await detectSystemBrowsers());
  if (chrome) {
    return {
      ready: true,
      source: 'chrome',
      name: 'Chrome',
      path: chrome.path,
      version: chrome.version,
    };
  }
  const playwright = await detectPlaywrightBrowsers();
  if (playwright.installed) {
    return {
      ready: true,
      source: 'playwright',
      name: 'Playwright Chromium',
      path: playwright.browsers[0]?.path || null,
      version: playwright.version,
    };
  }
  return { ready: false, source: 'missing', name: null, path: null, version: null };
}

module.exports = {
  findLocalChrome,
  ensureRecordingBrowser,
  describeRecordingBrowser,
  installPinnedChromium,
};
