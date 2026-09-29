#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const figlet = require('figlet');
const { checkDependencies, installDependencies } = require('./install');
const { runTests } = require('./commands/run');
const { initProject } = require('./commands/init');
const { startServices } = require('./commands/start');
const { statusCheck } = require('./commands/status');
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
  .description('🚀 One-click setup and run OpenTest')
  .option('-p, --port <port>', 'API port', '8080')
  .option('--skip-checks', 'Skip dependency checks')
  .action(async (options) => {
    showBanner();
    
    console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    console.log(chalk.bold.green('🚀 Starting OpenTest...\n'));
    
    // Step 1: Check dependencies
    if (!options.skipChecks) {
      console.log(chalk.blue('📋 Step 1: Checking dependencies...'));
      const { allInstalled, missing } = await checkDependencies();
      
      if (!allInstalled) {
        console.log(chalk.yellow('\n⚠️  Missing dependencies detected:'));
        missing.forEach(dep => console.log(chalk.yellow(`  - ${dep}`)));
        console.log(chalk.blue('\n📦 Installing missing dependencies...\n'));
        await installDependencies(missing);
      } else {
        console.log(chalk.green('✓ All dependencies installed\n'));
      }
    }
    
    // Step 2: Start services
    console.log(chalk.blue('🐳 Step 2: Starting Docker services...'));
    await startServices(options);
    
    // Step 3: Show status
    console.log(chalk.blue('\n📊 Step 3: Service status...'));
    await statusCheck();
    
    console.log(chalk.green('\n✅ OpenTest is running!\n'));
    console.log(chalk.cyan('🌐 Access the dashboard: http://localhost:3000'));
    console.log(chalk.cyan('🔧 API endpoint: http://localhost:' + options.port));
    console.log(chalk.gray('\nPress Ctrl+C to stop\n'));
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

// Command: doctor - Check system health
program
  .command('doctor')
  .description('🏥 Check system health and dependencies')
  .action(async () => {
    showBanner();
    console.log(chalk.blue('Running system health check...\n'));
    
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

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  showBanner();
  program.outputHelp();
}
