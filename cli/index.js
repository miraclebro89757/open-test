#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const figlet = require('figlet');
const { checkForUpdates } = require('./update-checker');
const { registerConfigCommand } = require('./commands/config');
const { registerAgentCommand, startAgent } = require('./commands/agent');
const { registerBrowserCommand } = require('./commands/browser');
const { launchWeb } = require('./commands/web');
const { startGraphService, stopGraphService, logGraphService } = require('./services/local');
const { setupBrowserEnvironment } = require('./browser/setup');
const { describeRecordingBrowser } = require('./browser/recording-browser');
const pkg = require('../package.json');

// Create CLI program
const program = new Command();

// Display banner
function nodeSatisfies(current, required) {
  const parse = (value) => value.split('.').map((part) => Number(part));
  const [major, minor, patch] = parse(current);
  const [needMajor, needMinor, needPatch] = parse(required);
  if (major !== needMajor) return major > needMajor;
  if (minor !== needMinor) return minor > needMinor;
  return patch >= needPatch;
}

function showBanner() {
  console.log(
    chalk.cyan(
      figlet.textSync('OpenTest', {
        font: 'Standard',
        horizontalLayout: 'default'
      })
    )
  );
  console.log(chalk.gray(`v${pkg.version} - AI-Powered Test Automation\n`));
}

// Main CLI setup
program
  .name('open-test')
  .description('Terminal test agent: requirements to test cases to recorded automation')
  .version(pkg.version);

// Command: run - Quick start (one-click setup and run)
program
  .command('run')
  .description('Open the terminal test agent')
  .argument('[prompt...]', 'First message. Prefix a document with @.')
  .option('--print', 'Run one turn and exit')
  .option('--skip-browser-setup', 'Skip browser setup check')
  .action(async (prompt, options) => {
    // Check browser configuration on first run (unless explicitly skipped)
    if (!options.skipBrowserSetup) {
      await setupBrowserEnvironment();
      console.log('');
    }
    
    await startAgent(prompt, options);
  });

// Command: install - Install dependencies
program
  .command('install')
  .description('使用本机 Chrome；没有则安装 Playwright Chromium')
  .action(async () => {
    showBanner();
    await setupBrowserEnvironment();
    console.log('');
  });

// Command: update - Check for updates
program
  .command('update')
  .description('🔄 Check for updates')
  .action(async () => {
    showBanner();
    console.log(chalk.blue('Checking for updates...\n'));
    
    const updateInfo = await checkForUpdates(pkg.version);
    
    if (updateInfo.updateAvailable) {
      console.log(chalk.green('✨ Update available!\n'));
      console.log(chalk.cyan(`Current version: ${updateInfo.currentVersion}`));
      console.log(chalk.green(`Latest version:  ${updateInfo.latestVersion}\n`));
      console.log(chalk.bold('Update instructions:\n'));
      console.log(chalk.gray('Global install:'));
      console.log(chalk.cyan('  npm update -g open-test\n'));
      console.log(chalk.gray('Or use npx (always latest):'));
      console.log(chalk.cyan('  npx open-test@latest run\n'));
    } else {
      console.log(chalk.green('✅ You are using the latest version!'));
      console.log(chalk.cyan(`Version: ${pkg.version}\n`));
    }
  });

// Command: doctor - Check system health
program
  .command('doctor')
  .description('检查 Node 和录制浏览器')
  .action(async () => {
    showBanner();
    console.log(chalk.blue('Running system health check...\n'));
    
    // Check for updates
    console.log(chalk.bold('Version Information:'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    console.log(chalk.cyan(`Current version: ${pkg.version}`));
    
    const updateInfo = await checkForUpdates(pkg.version).catch(() => null);
    if (updateInfo && updateInfo.updateAvailable) {
      console.log(chalk.yellow(`Latest version:  ${updateInfo.latestVersion}`));
      console.log(chalk.green('\n✨ Update available!'));
      console.log(chalk.gray('Run: npm update -g open-test'));
    } else {
      console.log(chalk.green('✓ You are using the latest version'));
    }
    console.log();
    
    const nodeOk = nodeSatisfies(process.versions.node, '22.19.0');
    console.log(chalk.bold('Recording browser:'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    console.log(nodeOk
      ? chalk.green(`✓ Node.js ${process.version}`)
      : chalk.yellow(`⚠ Node.js ${process.version} is older than 22.19.0`));

    const browser = await describeRecordingBrowser();
    if (browser.ready && browser.source === 'chrome') {
      console.log(chalk.green(`✓ Chrome ${browser.version}`));
      console.log(chalk.gray(`  ${browser.path}`));
    } else if (browser.ready) {
      console.log(chalk.green(`✓ Playwright Chromium ${browser.version}`));
      console.log(chalk.gray('  Local Chrome was not found, so recording uses the downloaded browser'));
    } else {
      console.log(chalk.yellow('⚠ Chrome was not found and Playwright Chromium is not installed'));
      console.log(chalk.gray('  Run: npx opentest-ai install'));
    }
    console.log();

    if (nodeOk && browser.ready) {
      console.log(chalk.green.bold('✅ Recording browser is ready\n'));
    } else if (!browser.ready) {
      console.log(chalk.yellow.bold('⚠️  The recording browser is not ready'));
      console.log(chalk.blue('Run: npx opentest-ai install\n'));
    } else {
      console.log(chalk.yellow.bold('⚠️  Node.js is older than 22.19.0\n'));
    }
  });

// Command: services - start the local graph service shipped with the agent
program
  .command('services [action]')
  .description('启动随 agent 附带的本机 Neo4j')
  .action(async (action = 'up') => {
    try {
      if (action === 'stop') {
        stopGraphService();
        console.log('Neo4j 已停止。');
        return;
      }
      if (action === 'logs') {
        logGraphService();
        return;
      }
      if (action !== 'up') {
        console.error('用法：npx open-test services [up|stop|logs]');
        process.exitCode = 2;
        return;
      }
      const started = await startGraphService();
      console.log(started.message);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  });

registerConfigCommand(program);
registerAgentCommand(program);
registerBrowserCommand(program);

// Command: web - Launch pi-web Web UI
program
  .command('web')
  .description('🌐 Launch OpenTest Web UI (browser interface)')
  .option('-p, --port <port>', 'Server port', '30141')
  .option('-H, --hostname <hostname>', 'Bind hostname', '127.0.0.1')
  .option('--no-open', 'Don\'t open browser automatically')
  .action(async (options) => {
    showBanner();
    await launchWeb(options);
  });

if (process.argv.length === 2 && process.stdout.isTTY) {
  process.argv.push('agent');
}

program.parse(process.argv);

if (process.argv.length === 2) {
  showBanner();
  program.outputHelp();
}
