#!/usr/bin/env node

/**
 * 测试录制模式选择功能
 * 
 * 使用方法：
 * 1. node test-recording-mode.js select - 交互式选择模式
 * 2. node test-recording-mode.js parse ui+api - 解析模式字符串
 * 3. node test-recording-mode.js help - 查看模式说明
 * 4. node test-recording-mode.js info - 查看所有模式信息
 */

const chalk = require('chalk');
const {
  selectRecordingMode,
  parseRecordingMode,
  showModeHelp,
  getModeConfirmationMessage,
  getModeDescription,
  getModeIcon,
  producesUIScript,
  producesAPIScript,
  RECORDING_MODES,
} = require('./cli/agent/tools/record-mode-selector');

async function main() {
  const command = process.argv[2] || 'select';
  const arg = process.argv[3];
  
  console.log(chalk.cyan.bold('\n🎬 录制模式选择测试工具\n'));
  
  switch (command) {
    case 'select':
      await testSelect();
      break;
    
    case 'parse':
      testParse(arg);
      break;
    
    case 'help':
      await testHelp();
      break;
    
    case 'info':
      showInfo();
      break;
    
    case 'confirm':
      testConfirmation(arg);
      break;
    
    default:
      showUsage();
      break;
  }
}

/**
 * Test interactive mode selection
 */
async function testSelect() {
  console.log(chalk.blue('📍 交互式模式选择\n'));
  console.log(chalk.gray('请选择录制模式...\n'));
  
  try {
    const mode = await selectRecordingMode({ hasUI: true });
    
    console.log('');
    console.log(chalk.green('✅ 选择成功！\n'));
    console.log(chalk.bold('选择结果：'));
    console.log(`  模式: ${chalk.cyan(mode)}`);
    console.log(`  图标: ${getModeIcon(mode)}`);
    console.log(`  描述: ${getModeDescription(mode)}`);
    console.log(`  产出 UI 脚本: ${producesUIScript(mode) ? chalk.green('是') : chalk.yellow('否')}`);
    console.log(`  产出 API 脚本: ${producesAPIScript(mode) ? chalk.green('是') : chalk.yellow('否')}`);
    console.log('');
    
  } catch (error) {
    if (error.message === 'User force closed the prompt with 0 null') {
      console.log(chalk.yellow('\n⚠️  用户取消了选择\n'));
    } else {
      throw error;
    }
  }
}

/**
 * Test mode parsing
 */
function testParse(input) {
  console.log(chalk.blue('📍 模式解析测试\n'));
  
  if (!input) {
    console.log(chalk.yellow('⚠️  请提供模式字符串'));
    console.log(chalk.gray('例如：node test-recording-mode.js parse ui+api\n'));
    return;
  }
  
  try {
    const mode = parseRecordingMode(input);
    
    console.log(chalk.green('✅ 解析成功！\n'));
    console.log(chalk.bold('输入：') + chalk.gray(input));
    console.log(chalk.bold('解析结果：') + chalk.cyan(mode));
    console.log(`图标：${getModeIcon(mode)}`);
    console.log(`描述：${getModeDescription(mode)}\n`);
    
  } catch (error) {
    console.log(chalk.red('❌ 解析失败\n'));
    console.error(chalk.red(error.message));
    console.log('');
    console.log(chalk.gray('有效的模式：ui+api, ui-only, api-only'));
    console.log(chalk.gray('别名：both/all → ui+api, ui → ui-only, api → api-only\n'));
  }
}

/**
 * Test help display
 */
async function testHelp() {
  console.log(chalk.blue('📍 显示帮助文档\n'));
  await showModeHelp();
}

/**
 * Show all modes information
 */
function showInfo() {
  console.log(chalk.blue('📍 所有录制模式信息\n'));
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  
  Object.entries(RECORDING_MODES).forEach(([mode, config]) => {
    const recommended = config.recommended ? chalk.green(' (推荐)') : '';
    
    console.log(chalk.bold(`${config.icon}  ${mode}${recommended}`));
    console.log(chalk.cyan(`   标签: ${config.label}`));
    console.log(chalk.gray(`   描述: ${config.description}`));
    
    console.log(chalk.cyan('   产出物:'));
    config.produces.forEach(item => {
      console.log(chalk.gray(`     • ${item}`));
    });
    
    console.log(chalk.cyan('   适用场景:'));
    console.log(chalk.gray(`     ${config.useCase}`));
    
    console.log(chalk.cyan('   特性:'));
    console.log(chalk.gray(`     产出 UI: ${producesUIScript(mode) ? '✓' : '✗'}`));
    console.log(chalk.gray(`     产出 API: ${producesAPIScript(mode) ? '✓' : '✗'}`));
    
    console.log(chalk.gray('\n   ─────────────────────────────────────────────\n'));
  });
  
  console.log(chalk.bold('💡 模式别名\n'));
  console.log(chalk.gray('   both, all, ui-api → ') + chalk.cyan('ui+api'));
  console.log(chalk.gray('   ui → ') + chalk.cyan('ui-only'));
  console.log(chalk.gray('   api → ') + chalk.cyan('api-only'));
  console.log('');
}

/**
 * Test confirmation message
 */
function testConfirmation(mode = 'ui+api') {
  console.log(chalk.blue('📍 确认消息预览\n'));
  
  try {
    const parsedMode = parseRecordingMode(mode);
    const sandboxUrl = 'https://demo.example.com/app';
    const message = getModeConfirmationMessage(parsedMode, sandboxUrl);
    
    console.log(chalk.bold('确认消息内容：\n'));
    console.log(message);
    console.log('');
    
  } catch (error) {
    console.log(chalk.red('❌ 无效的模式\n'));
    console.error(chalk.red(error.message));
    console.log('');
  }
}

/**
 * Show usage
 */
function showUsage() {
  console.log(chalk.bold('用法：'));
  console.log(chalk.gray('  node test-recording-mode.js [command] [arg]\n'));
  
  console.log(chalk.bold('命令：'));
  console.log(chalk.cyan('  select        ') + '交互式选择录制模式（默认）');
  console.log(chalk.cyan('  parse <mode>  ') + '解析模式字符串');
  console.log(chalk.cyan('  help          ') + '显示详细帮助文档');
  console.log(chalk.cyan('  info          ') + '显示所有模式信息');
  console.log(chalk.cyan('  confirm <mode>') + '预览确认消息\n');
  
  console.log(chalk.bold('示例：'));
  console.log(chalk.gray('  # 交互式选择'));
  console.log(chalk.cyan('  node test-recording-mode.js select\n'));
  
  console.log(chalk.gray('  # 解析模式'));
  console.log(chalk.cyan('  node test-recording-mode.js parse ui+api'));
  console.log(chalk.cyan('  node test-recording-mode.js parse both'));
  console.log(chalk.cyan('  node test-recording-mode.js parse ui\n'));
  
  console.log(chalk.gray('  # 查看帮助'));
  console.log(chalk.cyan('  node test-recording-mode.js help\n'));
  
  console.log(chalk.gray('  # 查看所有信息'));
  console.log(chalk.cyan('  node test-recording-mode.js info\n'));
  
  console.log(chalk.gray('  # 预览确认消息'));
  console.log(chalk.cyan('  node test-recording-mode.js confirm ui+api\n'));
}

main().catch(error => {
  console.error(chalk.red('\n❌ 错误:\n'));
  console.error(error);
  process.exit(1);
});
