#!/usr/bin/env node

const chalk = require('chalk');
const boxen = require('boxen');

// Post-install message
console.log(
  boxen(
    chalk.bold.cyan('🎉 OpenTest installed successfully!\n\n') +
    chalk.white('Terminal test agent\n\n') +
    chalk.gray('Quick start:\n') +
    chalk.cyan('  npx open-test config   ') + chalk.gray('# Configure a model (one-time)\n') +
    chalk.cyan('  npx open-test run      ') + chalk.gray('# Open the agent, then @ a requirement\n') +
    chalk.cyan('  npx open-test doctor   ') + chalk.gray('# Check dependencies\n\n') +
    chalk.gray('Documentation: ') + chalk.blue('https://github.com/miraclebro89757/open-test'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan'
    }
  )
);
