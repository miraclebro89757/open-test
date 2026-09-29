const { execSync } = require('child_process');
const chalk = require('chalk');
const boxen = require('boxen');

async function statusCheck() {
  try {
    // Get container status
    const output = execSync('docker compose ps --format json', {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const services = output
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (services.length === 0) {
      console.log(boxen(
        chalk.yellow('⚠️  No services running\n\n') +
        chalk.gray('Start services with: npx open-test run'),
        { 
          padding: 1, 
          borderColor: 'yellow',
          borderStyle: 'round'
        }
      ));
      return;
    }

    // Display service status
    console.log(chalk.bold('\n📊 Service Status:\n'));
    console.log(chalk.gray('━'.repeat(70)));
    console.log(
      chalk.bold.white(
        '  Service'.padEnd(20) + 
        'State'.padEnd(15) + 
        'Health'.padEnd(15) + 
        'Ports'
      )
    );
    console.log(chalk.gray('━'.repeat(70)));

    services.forEach(svc => {
      const name = svc.Service || svc.Name || 'unknown';
      const state = svc.State || 'unknown';
      const health = svc.Health || 'N/A';
      const ports = svc.Publishers 
        ? svc.Publishers.map(p => `${p.PublishedPort}->${p.TargetPort}`).join(', ')
        : 'N/A';

      // Color based on state
      let stateColor = chalk.gray;
      if (state === 'running') stateColor = chalk.green;
      else if (state === 'exited') stateColor = chalk.red;
      else if (state === 'starting') stateColor = chalk.yellow;

      let healthColor = chalk.gray;
      if (health === 'healthy') healthColor = chalk.green;
      else if (health === 'unhealthy') healthColor = chalk.red;
      else if (health === 'starting') healthColor = chalk.yellow;

      console.log(
        `  ${chalk.cyan(name.padEnd(18))} ` +
        `${stateColor(state.padEnd(13))} ` +
        `${healthColor(health.padEnd(13))} ` +
        chalk.gray(ports)
      );
    });

    console.log(chalk.gray('━'.repeat(70)));

    // Summary
    const running = services.filter(s => s.State === 'running').length;
    const total = services.length;
    const healthy = services.filter(s => s.Health === 'healthy').length;

    console.log();
    if (running === total) {
      console.log(chalk.green(`✅ All services running (${running}/${total})`));
    } else {
      console.log(chalk.yellow(`⚠️  ${running}/${total} services running`));
    }

    if (healthy > 0) {
      console.log(chalk.green(`✅ ${healthy} service(s) healthy`));
    }

    // Check service URLs
    console.log();
    await checkServiceHealth();

  } catch (error) {
    console.log(chalk.red('❌ Failed to get service status'));
    console.log(chalk.yellow('💡 Make sure Docker is running'));
    console.log(chalk.gray('   Run: npx open-test doctor'));
  }
}

async function checkServiceHealth() {
  const http = require('http');
  const https = require('https');

  const endpoints = [
    { name: 'API', url: 'http://localhost:8080/health' },
    { name: 'Frontend', url: 'http://localhost:3000' },
    { name: 'Worker Pool', url: 'http://localhost:9000/health' },
  ];

  console.log(chalk.bold('🔗 Endpoint Health:\n'));

  for (const endpoint of endpoints) {
    try {
      await checkUrl(endpoint.url);
      console.log(chalk.green(`  ✓ ${endpoint.name.padEnd(15)} ${endpoint.url}`));
    } catch (error) {
      console.log(chalk.gray(`  ○ ${endpoint.name.padEnd(15)} ${endpoint.url} (not ready)`));
    }
  }
  console.log();
}

function checkUrl(url, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    const req = lib.get(url, { timeout }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve(true);
      } else {
        reject(new Error(`Status ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

module.exports = { statusCheck };
