#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const figlet = require('figlet');
const { checkDependencies, installDependencies } = require('./install');
const { checkForUpdates } = require('./update-checker');
const { registerConfigCommand } = require('./commands/config');
const { registerAgentCommand, startAgent } = require('./commands/agent');
const { registerBrowserCommand } = require('./commands/browser');
const { launchWeb } = require('./commands/web');
const { startGraphService, stopGraphService, logGraphService } = require('./services/local');
const { setupBrowserEnvironment } = require('./browser/setup');
const { loadBrowserConfig } = require('./browser/config-store');
const pkg = require('../package.json');

// Create CLI program
const program = new Command();

// Display banner
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
      const browserConfig = await loadBrowserConfig();
      if (!browserConfig.configured) {
        console.log(chalk.yellow('\n⚠️  首次运行需要配置浏览器环境\n'));
        await setupBrowserEnvironment();
        console.log(''); // Add spacing
      }
    }
    
    await startAgent(prompt, options);
  });

// Command: install - Install dependencies
program
  .command('install')
  .description('📦 Install all dependencies')
  .action(async () => {
    showBanner();
    console.log(chalk.blue('Installing OpenTest dependencies...\n'));
    const { missing } = await checkDependencies();
    if (missing.length > 0) {
      await installDependencies(missing);
    } else {
      console.log(chalk.green('✓ All dependencies already installed'));
    }
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
  .description('🏥 Check system health and dependencies')
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
    
    const { checkDependencies } = require('./install');
    const { allInstalled, installed, missing } = await checkDependencies();
    
    console.log(chalk.bold('System Dependencies:'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    
    // Show installed
    if (installed.length > 0) {
      console.log(chalk.green('✓ Installed:'));
      installed.forEach(dep => console.log(chalk.green(`  ✓ ${dep}`)));
      console.log();
    }
    
    // Show missing
    if (missing.length > 0) {
      console.log(chalk.yellow('⚠ Missing:'));
      missing.forEach(dep => console.log(chalk.yellow(`  ✗ ${dep}`)));
      console.log();
    }
    
    // Browser environment check
    const { loadBrowserConfig } = require('./browser/config-store');
    const { detectEnvironment } = require('./browser/env-detector');
    
    console.log(chalk.bold('Browser Environment:'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    
    const browserConfig = await loadBrowserConfig();
    const env = await detectEnvironment();
    
    if (browserConfig.configured && browserConfig.type !== 'none') {
      console.log(chalk.green('✓ Configured:'));
      const browserName = browserConfig.browser?.name || 'Playwright Chromium';
      const browserVersion = browserConfig.browser?.version || 'unknown';
      console.log(chalk.green(`  ✓ ${browserName} v${browserVersion}`));
    } else {
      console.log(chalk.yellow('⚠ Not configured'));
      console.log(chalk.gray('  Run: npx open-test browser setup'));
    }
    
    // Show detected browsers
    if (env.systemBrowsers.length > 0 || env.playwright.installed) {
      console.log(chalk.gray('\n  Available browsers:'));
      env.systemBrowsers.forEach(browser => {
        console.log(chalk.gray(`    • ${browser.name} v${browser.version}`));
      });
      if (env.playwright.installed) {
        console.log(chalk.gray(`    • Playwright Chromium v${env.playwright.version}`));
      }
    }
    console.log();
    
    // Overall status
    if (allInstalled && browserConfig.configured) {
      console.log(chalk.green.bold('✅ System is healthy!\n'));
    } else if (allInstalled) {
      console.log(chalk.yellow.bold('⚠️  System is ready, browser setup recommended'));
      console.log(chalk.blue('Run: npx open-test browser setup\n'));
    } else {
      console.log(chalk.yellow.bold('⚠️  Some dependencies are missing'));
      console.log(chalk.blue('Run: npx open-test install\n'));
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
