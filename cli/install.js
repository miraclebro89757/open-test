const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');

// Check if a command exists
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Check if Docker is running
function isDockerRunning() {
  try {
    execSync('docker info', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Check all required dependencies
async function checkDependencies() {
  const dependencies = [
    { name: 'docker', command: 'docker', required: true },
    { name: 'docker-compose', command: 'docker compose version', required: true },
    { name: 'node', command: 'node', required: true },
    { name: 'cargo', command: 'cargo', required: false }, // Optional for tests
  ];

  const installed = [];
  const missing = [];

  for (const dep of dependencies) {
    const spinner = ora(`Checking ${dep.name}...`).start();
    
    try {
      if (dep.command.includes('compose')) {
        execSync(dep.command, { stdio: 'pipe' });
      } else {
        const exists = commandExists(dep.command);
        if (!exists) throw new Error('Not found');
      }
      
      spinner.succeed(chalk.green(`${dep.name} installed`));
      installed.push(dep.name);
    } catch (error) {
      if (dep.required) {
        spinner.fail(chalk.red(`${dep.name} not found (required)`));
        missing.push(dep.name);
      } else {
        spinner.warn(chalk.yellow(`${dep.name} not found (optional)`));
      }
    }
  }

  // Check if Docker is running
  if (installed.includes('docker')) {
    const spinner = ora('Checking Docker daemon...').start();
    if (isDockerRunning()) {
      spinner.succeed(chalk.green('Docker daemon running'));
    } else {
      spinner.fail(chalk.red('Docker daemon not running'));
      missing.push('docker-daemon');
    }
  }

  return {
    allInstalled: missing.length === 0,
    installed,
    missing
  };
}

// Install dependencies with instructions
async function installDependencies(missing) {
  console.log(chalk.bold('\n📦 Installation Instructions:\n'));

  for (const dep of missing) {
    switch (dep) {
      case 'docker':
        console.log(chalk.blue('Docker:'));
        console.log(chalk.gray('  macOS:   brew install --cask docker'));
        console.log(chalk.gray('  Linux:   https://docs.docker.com/engine/install/'));
        console.log(chalk.gray('  Windows: https://docs.docker.com/desktop/install/windows-install/'));
        break;

      case 'docker-compose':
        console.log(chalk.blue('\nDocker Compose:'));
        console.log(chalk.gray('  Usually included with Docker Desktop'));
        console.log(chalk.gray('  Or: https://docs.docker.com/compose/install/'));
        break;

      case 'docker-daemon':
        console.log(chalk.blue('\nDocker Daemon:'));
        console.log(chalk.gray('  Please start Docker Desktop'));
        console.log(chalk.gray('  macOS: Open Docker Desktop app'));
        console.log(chalk.gray('  Linux: sudo systemctl start docker'));
        break;

      case 'cargo':
        console.log(chalk.blue('\nRust/Cargo (optional, for tests):'));
        console.log(chalk.gray('  curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh'));
        break;

      case 'node':
        console.log(chalk.blue('\nNode.js:'));
        console.log(chalk.gray('  macOS:   brew install node'));
        console.log(chalk.gray('  Or: https://nodejs.org/'));
        break;
    }
  }

  console.log(chalk.yellow('\n⚠️  Please install the missing dependencies and run again.\n'));
  
  // Exit if required dependencies are missing
  if (missing.some(dep => ['docker', 'docker-compose', 'node'].includes(dep))) {
    process.exit(1);
  }
}

module.exports = {
  checkDependencies,
  installDependencies,
  commandExists,
  isDockerRunning
};
