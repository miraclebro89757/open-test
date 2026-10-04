#!/usr/bin/env node

/**
 * 测试沙箱 URL 配置功能
 * 
 * 使用方法：
 * 1. node test-sandbox-config.js setup - 配置沙箱地址
 * 2. node test-sandbox-config.js list - 查看所有配置
 * 3. node test-sandbox-config.js switch <env> - 切换环境
 * 4. node test-sandbox-config.js show - 显示配置文件内容
 */

const chalk = require('chalk');
const {
  resolveSandboxUrl,
  loadSandboxConfig,
  saveSandboxConfig,
  switchEnvironment,
  listEnvironments,
  getConfigPath,
} = require('./cli/agent/tools/sandbox-config');

async function main() {
  const command = process.argv[2] || 'help';
  const arg = process.argv[3];
  
  const workspace = process.cwd();
  
  console.log(chalk.cyan.bold('\n🌐 沙箱 URL 配置测试工具\n'));
  
  switch (command) {
    case 'setup':
      await testSetup(workspace);
      break;
    
    case 'list':
      await testList(workspace);
      break;
    
    case 'switch':
      if (!arg) {
        console.log(chalk.red('请指定环境名称'));
        console.log(chalk.gray('例如：node test-sandbox-config.js switch dev\n'));
        return;
      }
      await testSwitch(workspace, arg);
      break;
    
    case 'show':
      await testShow(workspace);
      break;
    
    case 'resolve':
      await testResolve(workspace);
      break;
    
    case 'env':
      testEnvironmentVariables();
      break;
    
    case 'help':
    default:
      showHelp();
      break;
  }
}

/**
 * Test setup flow
 */
async function testSetup(workspace) {
  console.log(chalk.blue('📍 配置沙箱地址\n'));
  
  const config = await loadSandboxConfig(workspace);
  
  if (config) {
    console.log(chalk.yellow('当前配置：\n'));
    if (config.defaultUrl) {
      console.log(`  默认地址：${chalk.cyan(config.defaultUrl)}`);
    }
    if (config.environments && Object.keys(config.environments).length > 0) {
      console.log('\n  环境列表：');
      Object.entries(config.environments).forEach(([name, url]) => {
        const active = config.activeEnvironment === name ? chalk.green(' (活动)') : '';
        console.log(`    ${name}${active}: ${chalk.cyan(url)}`);
      });
    }
    console.log('');
  }
  
  try {
    const result = await resolveSandboxUrl(workspace, {
      allowPrompt: true,
      piUI: null, // Use inquirer
    });
    
    console.log(chalk.green('\n✅ 配置成功！\n'));
    console.log(`  URL: ${chalk.cyan(result.url)}`);
    console.log(`  来源: ${result.source}`);
    console.log(`  配置文件: ${chalk.gray(getConfigPath(workspace))}\n`);
    
  } catch (error) {
    console.log(chalk.red('\n❌ 配置失败\n'));
    console.error(error.message);
    console.log('');
  }
}

/**
 * List all environments
 */
async function testList(workspace) {
  console.log(chalk.blue('📍 已配置的环境\n'));
  
  const envs = await listEnvironments(workspace);
  
  if (envs.length === 0) {
    console.log(chalk.yellow('⚠️  未找到配置'));
    console.log(chalk.gray('   运行 ') + chalk.cyan('node test-sandbox-config.js setup') + chalk.gray(' 进行配置\n'));
    return;
  }
  
  console.log(chalk.bold('环境列表：\n'));
  
  envs.forEach(env => {
    const icon = env.active ? chalk.green('●') : chalk.gray('○');
    const status = env.active ? chalk.green(' (活动)') : '';
    console.log(`  ${icon} ${chalk.bold(env.name)}${status}`);
    console.log(`     ${chalk.cyan(env.url)}`);
    console.log('');
  });
  
  console.log(chalk.gray(`配置文件: ${getConfigPath(workspace)}\n`));
}

/**
 * Switch environment
 */
async function testSwitch(workspace, envName) {
  console.log(chalk.blue(`📍 切换到环境: ${envName}\n`));
  
  try {
    await switchEnvironment(workspace, envName);
    
    console.log(chalk.green('✅ 切换成功！\n'));
    
    // Show new active environment
    const envs = await listEnvironments(workspace);
    const active = envs.find(e => e.active);
    
    if (active) {
      console.log(chalk.bold('当前活动环境：'));
      console.log(`  ${active.name}: ${chalk.cyan(active.url)}\n`);
    }
    
  } catch (error) {
    console.log(chalk.red('❌ 切换失败\n'));
    console.error(error.message);
    console.log('');
  }
}

/**
 * Show config file content
 */
async function testShow(workspace) {
  console.log(chalk.blue('📍 配置文件内容\n'));
  
  const config = await loadSandboxConfig(workspace);
  
  if (!config) {
    console.log(chalk.yellow('⚠️  未找到配置文件'));
    console.log(chalk.gray('   位置: ') + chalk.cyan(getConfigPath(workspace)));
    console.log(chalk.gray('   运行 ') + chalk.cyan('node test-sandbox-config.js setup') + chalk.gray(' 进行配置\n'));
    return;
  }
  
  console.log(chalk.gray(`配置文件: ${getConfigPath(workspace)}\n`));
  console.log(JSON.stringify(config, null, 2));
  console.log('');
}

/**
 * Test URL resolution
 */
async function testResolve(workspace) {
  console.log(chalk.blue('📍 测试 URL 解析\n'));
  
  try {
    const result = await resolveSandboxUrl(workspace, {
      allowPrompt: false,
    });
    
    console.log(chalk.green('✅ 解析成功！\n'));
    console.log(`  URL: ${chalk.cyan(result.url)}`);
    console.log(`  来源: ${result.source}\n`);
    
  } catch (error) {
    console.log(chalk.yellow('⚠️  无法自动解析 URL\n'));
    console.log(chalk.gray('原因: ') + error.message);
    console.log('');
    console.log(chalk.gray('提示: 运行 ') + chalk.cyan('node test-sandbox-config.js setup') + chalk.gray(' 进行配置\n'));
  }
}

/**
 * Show environment variables
 */
function testEnvironmentVariables() {
  console.log(chalk.blue('📍 环境变量\n'));
  
  const envVars = [
    'OPENTEST_SANDBOX_URL',
    'OPENTEST_SANDBOX_DEV_URL',
    'OPENTEST_SANDBOX_TEST_URL',
    'OPENTEST_SANDBOX_STAGING_URL',
    'OPENTEST_SANDBOX_PROD_URL',
  ];
  
  console.log(chalk.bold('支持的环境变量：\n'));
  
  let found = false;
  
  envVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(chalk.green(`  ✓ ${varName}`));
      console.log(chalk.gray(`    ${value}`));
      found = true;
    } else {
      console.log(chalk.gray(`  ○ ${varName}`));
      console.log(chalk.gray(`    未设置`));
    }
    console.log('');
  });
  
  if (!found) {
    console.log(chalk.yellow('⚠️  未设置任何环境变量\n'));
    console.log(chalk.gray('示例：\n'));
    console.log(chalk.cyan('  export OPENTEST_SANDBOX_URL=https://demo.example.com'));
    console.log(chalk.cyan('  export OPENTEST_SANDBOX_DEV_URL=https://dev.example.com'));
    console.log(chalk.cyan('  export OPENTEST_SANDBOX_TEST_URL=https://test.example.com\n'));
  }
  
  console.log(chalk.bold('优先级：'));
  console.log(chalk.gray('  1. 环境变量（最高）'));
  console.log(chalk.gray('  2. 项目配置（环境特定）'));
  console.log(chalk.gray('  3. 项目配置（默认地址）'));
  console.log(chalk.gray('  4. 上次使用的地址'));
  console.log(chalk.gray('  5. 提示用户输入\n'));
}

/**
 * Show help
 */
function showHelp() {
  console.log(chalk.bold('用法：'));
  console.log(chalk.gray('  node test-sandbox-config.js [command] [args]\n'));
  
  console.log(chalk.bold('命令：'));
  console.log(chalk.cyan('  setup         ') + '配置沙箱地址（交互式）');
  console.log(chalk.cyan('  list          ') + '查看所有已配置的环境');
  console.log(chalk.cyan('  switch <env>  ') + '切换活动环境');
  console.log(chalk.cyan('  show          ') + '显示配置文件内容');
  console.log(chalk.cyan('  resolve       ') + '测试 URL 解析（不提示）');
  console.log(chalk.cyan('  env           ') + '显示环境变量状态');
  console.log(chalk.cyan('  help          ') + '显示帮助信息\n');
  
  console.log(chalk.bold('示例：'));
  console.log(chalk.gray('  # 配置沙箱地址'));
  console.log(chalk.cyan('  node test-sandbox-config.js setup\n'));
  
  console.log(chalk.gray('  # 查看所有环境'));
  console.log(chalk.cyan('  node test-sandbox-config.js list\n'));
  
  console.log(chalk.gray('  # 切换到测试环境'));
  console.log(chalk.cyan('  node test-sandbox-config.js switch test\n'));
  
  console.log(chalk.gray('  # 查看配置文件'));
  console.log(chalk.cyan('  node test-sandbox-config.js show\n'));
  
  console.log(chalk.gray('  # 测试 URL 解析'));
  console.log(chalk.cyan('  node test-sandbox-config.js resolve\n'));
  
  console.log(chalk.gray('  # 查看环境变量'));
  console.log(chalk.cyan('  node test-sandbox-config.js env\n'));
}

main().catch(error => {
  console.error(chalk.red('\n❌ 错误:\n'));
  console.error(error);
  process.exit(1);
});
