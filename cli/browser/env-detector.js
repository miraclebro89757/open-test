'use strict';

const fs = require('fs').promises;
const { execFile: execFileCallback } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const path = require('path');

const execFile = promisify(execFileCallback);

/**
 * Detect system-installed Chromium-based browsers
 * @returns {Promise<Array>} List of detected browsers
 */
async function detectSystemBrowsers() {
  const browsers = [];
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS
    const candidates = [
      {
        name: 'Chrome',
        type: 'chrome',
        path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        recommended: true,
      },
      {
        name: 'Edge',
        type: 'msedge',
        path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      },
      {
        name: 'Chromium',
        type: 'chromium',
        path: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      },
      {
        name: 'Brave',
        type: 'chrome',
        path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      },
    ];
    
    for (const candidate of candidates) {
      if (await pathExists(candidate.path)) {
        const version = await getChromiumVersion(candidate.path);
        browsers.push({
          ...candidate,
          version,
          channel: 'stable',
        });
      }
    }
  } else if (platform === 'win32') {
    // Windows
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    
    const candidates = [
      {
        name: 'Chrome',
        type: 'chrome',
        paths: [
          path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ],
        recommended: true,
      },
      {
        name: 'Edge',
        type: 'msedge',
        paths: [
          path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ],
      },
      {
        name: 'Brave',
        type: 'chrome',
        paths: [
          path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
          path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        ],
      },
    ];
    
    for (const candidate of candidates) {
      for (const p of candidate.paths) {
        if (await pathExists(p)) {
          const version = await getChromiumVersion(p);
          browsers.push({
            name: candidate.name,
            type: candidate.type,
            path: p,
            version,
            channel: 'stable',
            recommended: candidate.recommended || false,
          });
          break; // Only add first found path
        }
      }
    }
  } else if (platform === 'linux') {
    // Linux
    const candidates = [
      { name: 'Chrome', type: 'chrome', commands: ['google-chrome', 'google-chrome-stable'], recommended: true },
      { name: 'Chromium', type: 'chromium', commands: ['chromium', 'chromium-browser'] },
      { name: 'Edge', type: 'msedge', commands: ['microsoft-edge', 'microsoft-edge-stable'] },
      { name: 'Brave', type: 'chrome', commands: ['brave', 'brave-browser'] },
    ];
    
    for (const candidate of candidates) {
      for (const cmd of candidate.commands) {
        const browserPath = await which(cmd);
        if (browserPath) {
          const version = await getChromiumVersion(browserPath);
          browsers.push({
            name: candidate.name,
            type: candidate.type,
            path: browserPath,
            version,
            channel: 'stable',
            recommended: candidate.recommended || false,
          });
          break;
        }
      }
    }
  }
  
  return browsers;
}

/**
 * Check if Playwright browsers are installed
 * @returns {Promise<Object>} Playwright installation status
 */
async function detectPlaywrightBrowsers() {
  const result = {
    installed: false,
    browsers: [],
    version: null,
  };
  
  try {
    // Check if playwright package is installed
    const playwrightPath = require.resolve('playwright/package.json');
    const playwrightPkg = require(playwrightPath);
    result.version = playwrightPkg.version;
    
    // Check if browsers are actually downloaded
    // Playwright stores browsers in a specific location
    const { chromium } = require('playwright');
    
    try {
      // Try to get executable path - if successful, browser is installed
      const executablePath = chromium.executablePath();
      if (await pathExists(executablePath)) {
        result.installed = true;
        result.browsers.push({
          name: 'Playwright Chromium',
          type: 'chromium',
          path: executablePath,
          version: playwrightPkg.version,
        });
      }
    } catch {
      // Browser not downloaded yet
      result.installed = false;
    }
  } catch {
    // Playwright not installed
    result.installed = false;
  }
  
  return result;
}

/**
 * Get Chromium version from executable
 * @param {string} executablePath Path to browser executable
 * @returns {Promise<string>} Version string
 */
async function getChromiumVersion(executablePath) {
  try {
    const { stdout } = await execFile(executablePath, ['--version'], { timeout: 5000 });
    // Parse version from output like "Google Chrome 131.0.6778.85" or "Chromium 119.0.6045.0"
    const match = stdout.match(/(\d+\.\d+\.\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Check if a path exists
 * @param {string} p File path to check
 * @returns {Promise<boolean>}
 */
async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find command in PATH (cross-platform)
 * @param {string} command Command name
 * @returns {Promise<string|null>} Full path or null
 */
async function which(command) {
  try {
    const { stdout } = await execFile(
      process.platform === 'win32' ? 'where' : 'which',
      [command],
      { timeout: 5000 }
    );
    return stdout.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

/**
 * Detect complete browser environment
 * @returns {Promise<Object>}
 */
async function detectEnvironment() {
  const [systemBrowsers, playwright] = await Promise.all([
    detectSystemBrowsers(),
    detectPlaywrightBrowsers(),
  ]);
  
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    systemBrowsers,
    playwright,
  };
}

/**
 * Get browser size estimate
 * @returns {Object} Download and disk size
 */
function getBrowserSizeEstimate() {
  return {
    download: '~120 MB',
    disk: '~280 MB',
  };
}

module.exports = {
  detectSystemBrowsers,
  detectPlaywrightBrowsers,
  detectEnvironment,
  getChromiumVersion,
  getBrowserSizeEstimate,
  pathExists,
};
