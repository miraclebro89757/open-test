const { execSync, spawn } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');

async function startServices(options = {}) {
  const spinner = ora('Starting OpenTest services...').start();

  try {
    // Check if docker-compose.yml exists
    const composePath = path.join(process.cwd(), 'docker-compose.yml');
    if (!fs.existsSync(composePath)) {
      spinner.fail(chalk.red('docker-compose.yml not found'));
      console.log(chalk.yellow('\nRun: npx open-test init [project-name]'));
      process.exit(1);
    }

    // Pull images first
    spinner.text = 'Pulling Docker images...';
    execSync('docker compose pull', { stdio: 'pipe' });

    // Build images
    spinner.text = 'Building images...';
    execSync('docker compose build', { stdio: 'pipe' });

    // Start services
    spinner.text = 'Starting containers...';
    const composeCmd = options.detached 
      ? 'docker compose up -d'
      : 'docker compose up -d'; // Always detached for CLI

    execSync(composeCmd, { stdio: 'inherit' });

    spinner.succeed(chalk.green('Services started successfully!'));

    // Wait for services to be healthy
    await waitForServices();

    console.log(chalk.green('\n✅ OpenTest is ready!\n'));
    displayServiceInfo();

  } catch (error) {
    spinner.fail(chalk.red('Failed to start services'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

async function waitForServices() {
  const spinner = ora('Waiting for services to be ready...').start();
  
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    try {
      const output = execSync('docker compose ps --format json', { 
        encoding: 'utf8',
        stdio: 'pipe' 
      });

      // Parse service statuses
      const services = output
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line));

      const allRunning = services.every(svc => 
        svc.State === 'running' || svc.Health === 'healthy'
      );

      if (allRunning && services.length > 0) {
        spinner.succeed(chalk.green('All services ready'));
        return;
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
      spinner.text = `Waiting for services... (${attempts}/${maxAttempts})`;

    } catch (error) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  spinner.warn(chalk.yellow('Services starting (may take a moment)'));
}

function displayServiceInfo() {
  console.log(chalk.bold('🌐 Service URLs:\n'));
  console.log(chalk.cyan('  Frontend:    http://localhost:3000'));
  console.log(chalk.cyan('  API:         http://localhost:8080'));
  console.log(chalk.cyan('  Worker Pool: http://localhost:9000'));
  console.log();
  console.log(chalk.bold('📊 Databases:\n'));
  console.log(chalk.gray('  PostgreSQL:    localhost:5432'));
  console.log(chalk.gray('  Redis:         localhost:6379'));
  console.log(chalk.gray('  Neo4j:         localhost:7474'));
  console.log(chalk.gray('  Elasticsearch: localhost:9200'));
  console.log();
  console.log(chalk.bold('🔧 Useful Commands:\n'));
  console.log(chalk.gray('  Status:  npx open-test status'));
  console.log(chalk.gray('  Logs:    npx open-test logs [service]'));
  console.log(chalk.gray('  Stop:    npx open-test stop'));
  console.log(chalk.gray('  Test:    npx open-test test'));
  console.log();
}

module.exports = { startServices };
