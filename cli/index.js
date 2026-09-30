#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const figlet = require('figlet');
const { checkDependencies, installDependencies } = require('./install');
const { runTests } = require('./commands/run');
const { initProject } = require('./commands/init');
const { startServices } = require('./commands/start');
const { statusCheck } = require('./commands/status');
const { checkForUpdates } = require('./update-checker');
const { registerConfigCommand } = require('./commands/config');
const { registerAgentCommand, startAgent } = require('./commands/agent');
const { startGraphService, stopGraphService, logGraphService } = require('./services/local');
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
  .description('AI-powered test automation platform')
  .version(pkg.version);

// Command: run - Quick start (one-click setup and run)
program
  .command('run')
  .description('Open the terminal test agent')
  .argument('[prompt...]', 'First message. Prefix a document with @.')
  .option('--print', 'Run one turn and exit')
    .action(async (prompt, options) => {
      await startAgent(prompt, options);
    });

// Command: init - Initialize new project
program
  .command('init [project-name]')
  .description('📂 Initialize a new OpenTest project')
  .option('-t, --template <template>', 'Project template', 'basic')
  .action(async (projectName, options) => {
    showBanner();
    await initProject(projectName, options);
  });

// Command: start - Start services only
program
  .command('start')
  .description('🐳 Start OpenTest services')
  .option('-d, --detached', 'Run in detached mode')
  .action(async (options) => {
    await startServices(options);
  });

// Command: stop - Stop services
program
  .command('stop')
  .description('⏹️  Stop OpenTest services')
  .action(async () => {
    const { execSync } = require('child_process');
    console.log(chalk.blue('Stopping OpenTest services...'));
    try {
      execSync('docker compose down', { stdio: 'inherit' });
      console.log(chalk.green('✓ Services stopped'));
    } catch (error) {
      console.error(chalk.red('Failed to stop services'));
      process.exit(1);
    }
  });

// Command: status - Check service status
program
  .command('status')
  .description('📊 Check OpenTest service status')
  .action(async () => {
    showBanner();
    await statusCheck();
  });

// Command: test - Run tests
program
  .command('test [suite]')
  .description('🧪 Run integration tests')
  .option('-v, --verbose', 'Verbose output')
  .action(async (suite, options) => {
    await runTests(suite, options);
  });

// Command: logs - View service logs
program
  .command('logs [service]')
  .description('📜 View service logs')
  .option('-f, --follow', 'Follow log output')
  .action(async (service, options) => {
    const { execSync } = require('child_process');
    const cmd = service 
      ? `docker compose logs ${options.follow ? '-f' : ''} ${service}`
      : `docker compose logs ${options.follow ? '-f' : ''}`;
    
    try {
      execSync(cmd, { stdio: 'inherit' });
    } catch (error) {
      console.error(chalk.red('Failed to view logs'));
    }
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
      console.log(chalk.gray('See full guide:'));
      console.log(chalk.cyan('  cat UPGRADE_GUIDE.md\n'));
    } else {
      console.log(chalk.green('✅ You are using the latest version!'));
      console.log(chalk.cyan(`Version: ${pkg.version}\n`));
    }
  });

// Command: upgrade - Upgrade OpenTest (global install only)
program
  .command('upgrade')
  .description('⬆️  Upgrade OpenTest to latest version')
  .option('-f, --force', 'Force upgrade even if latest')
  .action(async (options) => {
    showBanner();
    console.log(chalk.blue('Upgrading OpenTest...\n'));
    
    const updateInfo = await checkForUpdates(pkg.version);
    
    if (!updateInfo.updateAvailable && !options.force) {
      console.log(chalk.green('✅ Already using latest version'));
      console.log(chalk.cyan(`Version: ${pkg.version}\n`));
      return;
    }
    
    const { execSync } = require('child_process');
    const ora = require('ora');
    const spinner = ora('Upgrading...').start();
    
    try {
      execSync('npm update -g open-test', { stdio: 'pipe' });
      spinner.succeed(chalk.green('Upgraded successfully!'));
      
      if (updateInfo.latestVersion) {
        console.log(chalk.cyan(`New version: ${updateInfo.latestVersion}\n`));
      }
      
      console.log(chalk.gray('Verify with:'));
      console.log(chalk.cyan('  open-test --version\n'));
    } catch (error) {
      spinner.fail(chalk.red('Upgrade failed'));
      console.log(chalk.yellow('\n💡 Try manual upgrade:'));
      console.log(chalk.cyan('  npm update -g open-test'));
      console.log(chalk.gray('\nOr use npx (always latest):'));
      console.log(chalk.cyan('  npx open-test@latest run\n'));
    }
  });

// Command: changelog - View changelog
program
  .command('changelog')
  .description('📋 View update changelog')
  .action(() => {
    console.log(chalk.cyan('\n📋 OpenTest Changelog\n'));
    console.log(chalk.gray('View full changelog at:'));
    console.log(chalk.blue('https://github.com/yourusername/open-test/releases\n'));
    console.log(chalk.gray('Or read UPGRADE_GUIDE.md for migration instructions.'));
    console.log();
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
    
    // Overall status
    if (allInstalled) {
      console.log(chalk.green.bold('✅ System is healthy!\n'));
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

if (process.argv.length === 2 && process.stdout.isTTY) {
  process.argv.push('agent');
}

program.parse(process.argv);

if (process.argv.length === 2) {
  showBanner();
  program.outputHelp();
}
