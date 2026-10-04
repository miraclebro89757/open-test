'use strict';

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');

const DEFAULT_CONFIG_FILENAME = 'opentest.sandbox.json';

/**
 * Sandbox configuration structure
 * @typedef {Object} SandboxConfig
 * @property {string} defaultUrl - Default sandbox URL
 * @property {Object.<string, string>} environments - Environment-specific URLs
 * @property {string} activeEnvironment - Active environment name
 * @property {string} lastUsedUrl - Last used URL for quick access
 */

/**
 * Load sandbox configuration
 * @param {string} workspace Project workspace directory
 * @returns {Promise<SandboxConfig|null>}
 */
async function loadSandboxConfig(workspace) {
  const configPath = path.join(workspace, DEFAULT_CONFIG_FILENAME);
  
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);
    return config;
  } catch (error) {
    // Config doesn't exist or is invalid
    return null;
  }
}

/**
 * Save sandbox configuration
 * @param {string} workspace Project workspace directory
 * @param {SandboxConfig} config Configuration to save
 * @returns {Promise<void>}
 */
async function saveSandboxConfig(workspace, config) {
  const configPath = path.join(workspace, DEFAULT_CONFIG_FILENAME);
  
  const contentWithComment = {
    $comment: 'OpenTest 沙箱配置文件 - 配置测试环境的 URL',
    ...config,
  };
  
  await fs.writeFile(
    configPath,
    JSON.stringify(contentWithComment, null, 2),
    'utf8'
  );
}

/**
 * Resolve sandbox URL with priority:
 * 1. Environment variable (OPENTEST_SANDBOX_URL or env-specific)
 * 2. Project config (environment-specific or default)
 * 3. Last used URL
 * 4. Prompt user
 * 
 * @param {string} workspace Project workspace directory
 * @param {Object} options Options
 * @param {Object} options.piUI Pi UI object for prompts
 * @param {boolean} options.allowPrompt Allow prompting user
 * @param {string} options.preferredEnv Preferred environment name
 * @returns {Promise<{url: string, source: string, shouldSave: boolean}>}
 */
async function resolveSandboxUrl(workspace, options = {}) {
  const { piUI = null, allowPrompt = true, preferredEnv = null } = options;
  
  // 1. Try environment variables first (highest priority)
  const envUrl = getUrlFromEnvironment(preferredEnv);
  if (envUrl) {
    return {
      url: envUrl,
      source: 'environment',
      shouldSave: false,
    };
  }
  
  // 2. Load project configuration
  const config = await loadSandboxConfig(workspace);
  
  if (config) {
    // Try active environment
    if (config.activeEnvironment && config.environments?.[config.activeEnvironment]) {
      return {
        url: config.environments[config.activeEnvironment],
        source: `config:${config.activeEnvironment}`,
        shouldSave: false,
      };
    }
    
    // Try default URL
    if (config.defaultUrl) {
      return {
        url: config.defaultUrl,
        source: 'config:default',
        shouldSave: false,
      };
    }
    
    // Try last used URL
    if (config.lastUsedUrl) {
      return {
        url: config.lastUsedUrl,
        source: 'config:lastUsed',
        shouldSave: false,
      };
    }
  }
  
  // 3. No configuration found, prompt user if allowed
  if (allowPrompt) {
    return await promptForSandboxUrl(workspace, piUI, config);
  }
  
  // 4. No URL available
  throw new Error(
    '未配置沙箱地址。请设置 OPENTEST_SANDBOX_URL 环境变量或运行 /record 配置默认地址。'
  );
}

/**
 * Get URL from environment variables
 * @param {string|null} preferredEnv Preferred environment name
 * @returns {string|null}
 */
function getUrlFromEnvironment(preferredEnv) {
  // Try preferred environment first
  if (preferredEnv) {
    const envVarName = `OPENTEST_SANDBOX_${preferredEnv.toUpperCase()}_URL`;
    if (process.env[envVarName]) {
      return process.env[envVarName];
    }
  }
  
  // Try generic sandbox URL
  if (process.env.OPENTEST_SANDBOX_URL) {
    return process.env.OPENTEST_SANDBOX_URL;
  }
  
  // Try common environment-specific variables
  const envVars = [
    'OPENTEST_SANDBOX_DEV_URL',
    'OPENTEST_SANDBOX_TEST_URL',
    'OPENTEST_SANDBOX_STAGING_URL',
    'OPENTEST_SANDBOX_PROD_URL',
  ];
  
  for (const varName of envVars) {
    if (process.env[varName]) {
      return process.env[varName];
    }
  }
  
  return null;
}

/**
 * Prompt user for sandbox URL and optionally save
 * @param {string} workspace Project workspace directory
 * @param {Object} piUI Pi UI object
 * @param {SandboxConfig|null} existingConfig Existing config if any
 * @returns {Promise<{url: string, source: string, shouldSave: boolean}>}
 */
async function promptForSandboxUrl(workspace, piUI, existingConfig) {
  if (piUI) {
    return promptWithPiUI(workspace, piUI, existingConfig);
  } else {
    return promptWithInquirer(workspace, existingConfig);
  }
}

/**
 * Prompt using Pi UI
 * @param {string} workspace Project workspace directory
 * @param {Object} piUI Pi UI object
 * @param {SandboxConfig|null} existingConfig Existing config
 * @returns {Promise<{url: string, source: string, shouldSave: boolean}>}
 */
async function promptWithPiUI(workspace, piUI, existingConfig) {
  // Ask for URL
  const url = await piUI.input(
    '请输入沙箱地址：',
    {
      placeholder: 'https://demo.example.com',
      default: existingConfig?.lastUsedUrl || '',
    }
  );
  
  if (!url || !isValidUrl(url)) {
    throw new Error('无效的 URL 地址');
  }
  
  // Ask if user wants to save as default
  const saveAsDefault = await piUI.confirm(
    '是否保存为默认沙箱地址？',
    '下次执行 /record 时将自动使用此地址'
  );
  
  if (saveAsDefault) {
    // Ask for environment name (optional)
    const hasEnvironments = await piUI.confirm(
      '是否为此地址指定环境名称？',
      '例如：dev、test、staging、prod'
    );
    
    let environment = null;
    if (hasEnvironments) {
      environment = await piUI.input(
        '请输入环境名称：',
        { placeholder: 'dev' }
      );
    }
    
    // Save configuration
    await saveUrlToConfig(workspace, url, environment, existingConfig);
    
    return {
      url,
      source: 'user:saved',
      shouldSave: false, // Already saved
    };
  }
  
  return {
    url,
    source: 'user:temporary',
    shouldSave: true, // Save as lastUsedUrl
  };
}

/**
 * Prompt using inquirer (for testing/standalone)
 * @param {string} workspace Project workspace directory
 * @param {SandboxConfig|null} existingConfig Existing config
 * @returns {Promise<{url: string, source: string, shouldSave: boolean}>}
 */
async function promptWithInquirer(workspace, existingConfig) {
  console.log(chalk.cyan('\n📍 配置沙箱地址\n'));
  
  if (existingConfig?.lastUsedUrl) {
    console.log(chalk.gray(`上次使用：${existingConfig.lastUsedUrl}\n`));
  }
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: '请输入沙箱地址：',
      default: existingConfig?.lastUsedUrl || '',
      validate: (input) => {
        if (!input) return '请输入 URL';
        if (!isValidUrl(input)) return '请输入有效的 http 或 https 地址';
        return true;
      },
    },
    {
      type: 'confirm',
      name: 'saveAsDefault',
      message: '是否保存为默认沙箱地址？',
      default: true,
    },
    {
      type: 'confirm',
      name: 'hasEnvironment',
      message: '是否为此地址指定环境名称？（例如：dev、test、prod）',
      default: false,
      when: (answers) => answers.saveAsDefault,
    },
    {
      type: 'input',
      name: 'environment',
      message: '请输入环境名称：',
      default: 'dev',
      when: (answers) => answers.hasEnvironment,
    },
  ]);
  
  if (answers.saveAsDefault) {
    await saveUrlToConfig(workspace, answers.url, answers.environment, existingConfig);
    console.log(chalk.green('\n✅ 配置已保存\n'));
    
    return {
      url: answers.url,
      source: 'user:saved',
      shouldSave: false,
    };
  }
  
  return {
    url: answers.url,
    source: 'user:temporary',
    shouldSave: true,
  };
}

/**
 * Save URL to configuration
 * @param {string} workspace Project workspace directory
 * @param {string} url URL to save
 * @param {string|null} environment Environment name
 * @param {SandboxConfig|null} existingConfig Existing config
 * @returns {Promise<void>}
 */
async function saveUrlToConfig(workspace, url, environment, existingConfig) {
  const config = existingConfig || {
    defaultUrl: null,
    environments: {},
    activeEnvironment: null,
    lastUsedUrl: null,
  };
  
  if (environment) {
    // Save as environment-specific
    config.environments = config.environments || {};
    config.environments[environment] = url;
    config.activeEnvironment = environment;
  } else {
    // Save as default
    config.defaultUrl = url;
  }
  
  config.lastUsedUrl = url;
  
  await saveSandboxConfig(workspace, config);
}

/**
 * Update last used URL
 * @param {string} workspace Project workspace directory
 * @param {string} url URL to save
 * @returns {Promise<void>}
 */
async function updateLastUsedUrl(workspace, url) {
  const config = await loadSandboxConfig(workspace);
  if (!config) return;
  
  config.lastUsedUrl = url;
  await saveSandboxConfig(workspace, config);
}

/**
 * Validate URL
 * @param {string} url URL to validate
 * @returns {boolean}
 */
function isValidUrl(url) {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Switch active environment
 * @param {string} workspace Project workspace directory
 * @param {string} environment Environment name
 * @returns {Promise<boolean>}
 */
async function switchEnvironment(workspace, environment) {
  const config = await loadSandboxConfig(workspace);
  
  if (!config) {
    throw new Error('未找到沙箱配置文件');
  }
  
  if (!config.environments || !config.environments[environment]) {
    throw new Error(`环境 "${environment}" 不存在`);
  }
  
  config.activeEnvironment = environment;
  await saveSandboxConfig(workspace, config);
  
  return true;
}

/**
 * List all configured environments
 * @param {string} workspace Project workspace directory
 * @returns {Promise<Array<{name: string, url: string, active: boolean}>>}
 */
async function listEnvironments(workspace) {
  const config = await loadSandboxConfig(workspace);
  
  if (!config) {
    return [];
  }
  
  const environments = [];
  
  // Add default
  if (config.defaultUrl) {
    environments.push({
      name: 'default',
      url: config.defaultUrl,
      active: !config.activeEnvironment,
    });
  }
  
  // Add named environments
  if (config.environments) {
    Object.entries(config.environments).forEach(([name, url]) => {
      environments.push({
        name,
        url,
        active: config.activeEnvironment === name,
      });
    });
  }
  
  return environments;
}

/**
 * Get configuration file path
 * @param {string} workspace Project workspace directory
 * @returns {string}
 */
function getConfigPath(workspace) {
  return path.join(workspace, DEFAULT_CONFIG_FILENAME);
}

module.exports = {
  loadSandboxConfig,
  saveSandboxConfig,
  resolveSandboxUrl,
  updateLastUsedUrl,
  switchEnvironment,
  listEnvironments,
  getConfigPath,
  isValidUrl,
};
