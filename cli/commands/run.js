const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');

async function runTests(suite, options = {}) {
  const spinner = ora('Preparing test environment...').start();

  try {
    // Check if tests directory exists
    const testsPath = path.join(process.cwd(), 'tests');
    const fs = require('fs');
    
    if (!fs.existsSync(testsPath)) {
      spinner.fail(chalk.red('Tests directory not found'));
      console.log(chalk.yellow('\nRun: npx open-test init [project-name]'));
      process.exit(1);
    }

    // Check if Cargo is available
    try {
      execSync('cargo --version', { stdio: 'pipe' });
    } catch {
      spinner.fail(chalk.red('Cargo not found'));
      console.log(chalk.yellow('\nInstall Rust: https://rustup.rs'));
      console.log(chalk.gray('curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh'));
      process.exit(1);
    }

    spinner.text = 'Running tests...';

    // Determine which test suite to run
    let testCommand = 'cargo test --all';
    
    if (suite) {
      const suiteMap = {
        'worker': 'test_worker_pool',
        'semantic': 'test_semantic_engine',
        'event': 'test_event_bus',
        'e2e': 'integration_test',
        'integration': 'integration_test'
      };

      const testFile = suiteMap[suite.toLowerCase()];
      if (testFile) {
        testCommand = `cargo test --test ${testFile}`;
      } else {
        spinner.warn(chalk.yellow(`Unknown suite: ${suite}, running all tests`));
      }
    }

    // Add verbose flag if needed
    if (options.verbose) {
      testCommand += ' -- --nocapture';
    }

    spinner.stop();

    // Run tests with live output
    console.log(chalk.blue(`\n🧪 Running tests...\n`));
    console.log(chalk.gray(`Command: ${testCommand}\n`));
    console.log(chalk.gray('━'.repeat(70)));
    console.log();

    execSync(testCommand, {
      cwd: testsPath,
      stdio: 'inherit'
    });

    console.log();
    console.log(chalk.gray('━'.repeat(70)));
    console.log(chalk.green('\n✅ Tests completed!\n'));

  } catch (error) {
    console.log();
    console.log(chalk.gray('━'.repeat(70)));
    console.log(chalk.red('\n❌ Tests failed\n'));
    process.exit(1);
  }
}

module.exports = { runTests };
