'use strict';

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.opentest');
const CONFIG_FILE = path.join(CONFIG_DIR, 'browser.json');

/**
 * Load browser configuration
 * @returns {Promise<Object>}
 */
async function loadBrowserConfig() {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    // Return default config if file doesn't exist
    return {
      configured: false,
      type: 'none', // 'system' | 'playwright' | 'none'
      browser: null,
      configuredAt: null,
    };
  }
}

/**
 * Save browser configuration
 * @param {Object} config Configuration to save
 * @returns {Promise<void>}
 */
async function saveBrowserConfig(config) {
  // Ensure config directory exists
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  
  const fullConfig = {
    ...config,
    configured: true,
    configuredAt: new Date().toISOString(),
  };
  
  await fs.writeFile(
    CONFIG_FILE,
    JSON.stringify(fullConfig, null, 2),
    'utf8'
  );
}

/**
 * Reset browser configuration
 * @returns {Promise<void>}
 */
async function resetBrowserConfig() {
  try {
    await fs.unlink(CONFIG_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Get configuration file path
 * @returns {string}
 */
function getConfigPath() {
  return CONFIG_FILE;
}

module.exports = {
  loadBrowserConfig,
  saveBrowserConfig,
  resetBrowserConfig,
  getConfigPath,
};
