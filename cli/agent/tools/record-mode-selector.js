'use strict';

const inquirer = require('inquirer');
const chalk = require('chalk');
const { uiText, recordingProduces, recordingConfirmMessage } = require('../ui-copy');

/**
 * Recording mode options
 */
const RECORDING_MODES = {
  'ui+api': {
    label: 'UI + API（同时录制）',
    description: '同时录制 UI 脚本（Playwright）和 API 脚本（HAR）',
    icon: '🎬',
    produces: ['Playwright UI 脚本', 'pytest API 脚本', 'HAR 文件'],
    useCase: '完整测试场景，需要 UI 和 API 两种视角',
    recommended: true,
  },
  'ui-only': {
    label: 'UI Only（仅 UI）',
    description: '仅录制 UI 操作脚本（Playwright）',
    icon: '🖱️',
    produces: ['Playwright UI 脚本'],
    useCase: '纯前端交互测试，不关注后端接口',
  },
  'api-only': {
    label: 'API Only（仅 API）',
    description: '仅捕获和分析 API 请求（HAR）',
    icon: '🔌',
    produces: ['pytest API 脚本', 'HAR 文件'],
    useCase: '后端接口测试，不需要 UI 自动化',
  },
};

/**
 * Select recording mode with TUI
 * @param {Object} options Options
 * @param {boolean} options.hasUI Whether UI is available (for automated calls)
 * @param {string} options.defaultMode Default mode if no UI
 * @param {Object} options.piUI Pi UI object for integration
 * @returns {Promise<string>} Selected mode: 'ui+api' | 'ui-only' | 'api-only'
 */
async function selectRecordingMode(options = {}) {
  const { hasUI = true, defaultMode = 'ui+api', piUI = null } = options;
  
  // If no UI available, return default
  if (!hasUI) {
    return defaultMode;
  }
  
  // If Pi UI is provided, use Pi's choice system
  if (piUI) {
    return selectRecordingModeWithPiUI(piUI, defaultMode);
  }
  
  // Otherwise use inquirer for standalone/testing
  return selectRecordingModeWithInquirer(defaultMode);
}

/**
 * Select mode using Pi's UI system
 * @param {Object} piUI Pi UI object
 * @param {string} defaultMode Default mode
 * @returns {Promise<string>}
 */
async function selectRecordingModeWithPiUI(piUI, defaultMode) {
  const options = Object.entries(RECORDING_MODES).map(([mode, config]) => {
    const recommendation = config.recommended ? ` (${uiText('record.recommended')})` : '';
    return {
      id: mode,
      label: `${config.icon} ${uiText(`record.mode.${mode}.label`)}${recommendation}`,
      description: uiText(`record.mode.${mode}.description`),
    };
  });
  
  options.push({
    id: 'help',
    label: uiText('record.help'),
    description: uiText('record.helpDescription'),
  });
  
  const selected = await piUI.choose(
    uiText('record.choose'),
    options,
    { defaultId: defaultMode }
  );
  
  // If user selected help, show it and ask again
  if (selected === 'help') {
    // Show help using Pi's UI
    const helpText = buildHelpText();
    await piUI.display(helpText);
    return selectRecordingModeWithPiUI(piUI, defaultMode);
  }
  
  return selected;
}

/**
 * Select mode using inquirer (for standalone/testing)
 * @param {string} defaultMode Default mode
 * @returns {Promise<string>}
 */
async function selectRecordingModeWithInquirer(defaultMode) {
  // Build choices
  const choices = Object.entries(RECORDING_MODES).map(([mode, config]) => {
    const recommendation = config.recommended ? chalk.green(` (${uiText('record.recommended')})`) : '';
    const name = `${config.icon}  ${uiText(`record.mode.${mode}.label`)}${recommendation}\n    ${chalk.gray(uiText(`record.mode.${mode}.description`))}`;
    
    return {
      name,
      value: mode,
      short: uiText(`record.mode.${mode}.label`),
    };
  });
  
  // Add separator and help
  choices.push(new inquirer.Separator());
  choices.push({
    name: chalk.cyan(uiText('record.help')),
    value: 'help',
    short: uiText('record.help'),
  });
  
  // Prompt user
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: uiText('record.choose'),
      choices,
      pageSize: 10,
      default: defaultMode,
    },
  ]);
  
  // If user wants help, show it and ask again
  if (mode === 'help') {
    showModeHelp();
    return selectRecordingModeWithInquirer(defaultMode);
  }
  
  return mode;
}

/**
 * Build help text for Pi UI display
 * @returns {string}
 */
function buildHelpText() {
  const lines = [`# ${uiText('record.help')}\n`];
  
  Object.entries(RECORDING_MODES).forEach(([mode, config]) => {
    const recommendation = config.recommended ? ` (${uiText('record.recommended')})` : '';
    lines.push(`## ${config.icon} ${uiText(`record.mode.${mode}.label`)}${recommendation}\n`);
    lines.push(`${uiText(`record.mode.${mode}.description`)}\n`);
    lines.push(`**${uiText('record.willRecord')}**`);
    recordingProduces(mode).forEach((item) => lines.push(`- ${item}`));
    lines.push(`\n${config.useCase}\n`);
  });
  
  return lines.join('\n');
}

/**
 * Select recording mode for command line (non-interactive)
 * @param {string} modeInput User input mode string
 * @returns {string} Validated mode
 */
function parseRecordingMode(modeInput) {
  const mode = String(modeInput || 'ui+api').toLowerCase().trim();
  
  // Aliases
  const aliases = {
    'both': 'ui+api',
    'all': 'ui+api',
    'ui-api': 'ui+api',
    'ui+api': 'ui+api',
    'ui': 'ui-only',
    'ui-only': 'ui-only',
    'api': 'api-only',
    'api-only': 'api-only',
  };
  
  const resolved = aliases[mode];
  
  if (!resolved) {
    throw new Error(
      `Invalid recording mode: "${modeInput}". ` +
      `Valid modes: ui+api, ui-only, api-only`
    );
  }
  
  return resolved;
}

/**
 * Show detailed help about recording modes
 */
function showModeHelp() {
  console.clear();
  console.log(chalk.cyan.bold(`\n${uiText('record.help')}\n`));
  
  Object.entries(RECORDING_MODES).forEach(([mode, config]) => {
    const recommendation = config.recommended ? chalk.green(` (${uiText('record.recommended')})`) : '';
    console.log(chalk.bold(`${config.icon}  ${uiText(`record.mode.${mode}.label`)}${recommendation}`));
    console.log(chalk.gray(`   ${uiText(`record.mode.${mode}.description`)}\n`));
    console.log(chalk.cyan(`   ${uiText('record.willRecord')}`));
    recordingProduces(mode).forEach((item) => {
      console.log(chalk.gray(`     • ${item}`));
    });
    console.log('');
  });
  
  console.log(chalk.gray(uiText('record.continue')));
  
  // Wait for user to press enter
  return new Promise(resolve => {
    process.stdin.once('data', () => {
      process.stdin.pause();
      console.clear();
      resolve();
    });
  });
}

/**
 * Display mode confirmation message
 * @param {string} mode Selected mode
 * @param {string} sandboxUrl Sandbox URL
 * @returns {string} Confirmation message
 */
function getModeConfirmationMessage(mode, sandboxUrl) {
  return recordingConfirmMessage(mode, sandboxUrl);
}

/**
 * Get mode description for tool result
 * @param {string} mode Recording mode
 * @returns {string} Description
 */
function getModeDescription(mode) {
  const text = uiText(`record.mode.${mode}.description`);
  return text === `record.mode.${mode}.description` ? mode : text;
}

/**
 * Get mode emoji icon
 * @param {string} mode Recording mode
 * @returns {string} Icon
 */
function getModeIcon(mode) {
  const config = RECORDING_MODES[mode];
  return config ? config.icon : '🎬';
}

/**
 * Check if mode produces UI script
 * @param {string} mode Recording mode
 * @returns {boolean}
 */
function producesUIScript(mode) {
  return mode === 'ui+api' || mode === 'ui-only';
}

/**
 * Check if mode produces API script
 * @param {string} mode Recording mode
 * @returns {boolean}
 */
function producesAPIScript(mode) {
  return mode === 'ui+api' || mode === 'api-only';
}

module.exports = {
  RECORDING_MODES,
  selectRecordingMode,
  parseRecordingMode,
  showModeHelp,
  getModeConfirmationMessage,
  getModeDescription,
  getModeIcon,
  producesUIScript,
  producesAPIScript,
};
