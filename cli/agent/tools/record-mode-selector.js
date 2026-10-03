'use strict';

const inquirer = require('inquirer');
const chalk = require('chalk');

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
    const recommendation = config.recommended ? ' (推荐)' : '';
    return {
      id: mode,
      label: `${config.icon} ${config.label}${recommendation}`,
      description: config.description,
    };
  });
  
  // Add help option
  options.push({
    id: 'help',
    label: '❓ 查看详细说明',
    description: '显示各模式的详细使用说明',
  });
  
  const selected = await piUI.choose(
    '请选择录制模式：',
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
    const recommendation = config.recommended ? chalk.green(' (推荐)') : '';
    const name = `${config.icon}  ${config.label}${recommendation}\n    ${chalk.gray(config.description)}`;
    
    return {
      name,
      value: mode,
      short: config.label,
    };
  });
  
  // Add separator and help
  choices.push(new inquirer.Separator());
  choices.push({
    name: chalk.cyan('❓ 查看详细说明'),
    value: 'help',
    short: '查看说明',
  });
  
  // Prompt user
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: '请选择录制模式：',
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
  const lines = ['# 录制模式详细说明\n'];
  
  Object.entries(RECORDING_MODES).forEach(([mode, config]) => {
    const recommendation = config.recommended ? ' (推荐)' : '';
    lines.push(`## ${config.icon} ${config.label}${recommendation}\n`);
    lines.push(`${config.description}\n`);
    lines.push('**产出物：**');
    config.produces.forEach(item => lines.push(`- ${item}`));
    lines.push(`\n**适用场景：** ${config.useCase}\n`);
  });
  
  lines.push('## 💡 如何选择？\n');
  lines.push('- **完整测试**：选择 UI + API（推荐），同时获得 UI 自动化脚本和 API 测试脚本');
  lines.push('- **纯前端**：选择 UI Only，只关注页面交互，不测试后端接口');
  lines.push('- **纯接口**：选择 API Only，只测试后端接口，不生成 UI 脚本\n');
  
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
  console.log(chalk.cyan.bold('\n📖 录制模式详细说明\n'));
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  
  Object.entries(RECORDING_MODES).forEach(([mode, config]) => {
    const recommendation = config.recommended ? chalk.green(' (推荐)') : '';
    console.log(chalk.bold(`${config.icon}  ${config.label}${recommendation}`));
    console.log(chalk.gray(`   ${config.description}\n`));
    
    console.log(chalk.cyan('   产出物：'));
    config.produces.forEach(item => {
      console.log(chalk.gray(`     • ${item}`));
    });
    
    console.log(chalk.cyan('\n   适用场景：'));
    console.log(chalk.gray(`     ${config.useCase}\n`));
    
    console.log(chalk.gray('   ─────────────────────────────────────────────\n'));
  });
  
  console.log(chalk.bold('💡 如何选择？\n'));
  console.log(chalk.gray('   • ') + chalk.white('完整测试') + chalk.gray('：选择 ') + chalk.cyan('UI + API') + chalk.gray('（推荐）'));
  console.log(chalk.gray('     同时获得 UI 自动化脚本和 API 测试脚本\n'));
  
  console.log(chalk.gray('   • ') + chalk.white('纯前端') + chalk.gray('：选择 ') + chalk.cyan('UI Only'));
  console.log(chalk.gray('     只关注页面交互，不测试后端接口\n'));
  
  console.log(chalk.gray('   • ') + chalk.white('纯接口') + chalk.gray('：选择 ') + chalk.cyan('API Only'));
  console.log(chalk.gray('     只测试后端接口，不生成 UI 脚本\n'));
  
  console.log(chalk.yellow('⚠️  注意事项\n'));
  console.log(chalk.gray('   • UI + API 模式会同时录制，但文件分开存储'));
  console.log(chalk.gray('   • API Only 模式下，录制窗口仅用于触发请求'));
  console.log(chalk.gray('   • 所有模式都支持后续单独运行和调试\n'));
  
  console.log(chalk.gray('按回车继续...'));
  
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
  const config = RECORDING_MODES[mode];
  
  const lines = [
    `${config.icon}  录制模式：${chalk.cyan(config.label)}`,
    ``,
    chalk.bold('将录制：'),
  ];
  
  config.produces.forEach(item => {
    lines.push(`  ${chalk.green('✓')} ${item}`);
  });
  
  lines.push('');
  lines.push(`沙箱地址：${chalk.cyan(sandboxUrl)}`);
  lines.push('');
  lines.push(chalk.gray('请按功能用例操作。'));
  lines.push(chalk.gray('关闭录制窗口后，会把脚本对上用例并标记是否自动化。'));
  
  return lines.join('\n');
}

/**
 * Get mode description for tool result
 * @param {string} mode Recording mode
 * @returns {string} Description
 */
function getModeDescription(mode) {
  const config = RECORDING_MODES[mode];
  return config ? config.description : mode;
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
