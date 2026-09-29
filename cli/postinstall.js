#!/usr/bin/env node

const chalk = require('chalk');
const boxen = require('boxen');

// Post-install message
console.log(
  boxen(
    chalk.bold.cyan('🎉 OpenTest installed successfully!\n\n') +
    chalk.white('AI-powered test automation platform\n\n') +
    chalk.gray('Quick start:\n') +
    chalk.cyan('  npx open-test run      ') + chalk.gray('# One-click setup & start\n') +
    chalk.cyan('  npx open-test init     ') + chalk.gray('# Create new project\n') +
    chalk.cyan('  npx open-test doctor   ') + chalk.gray('# Check dependencies\n\n') +
    chalk.gray('Documentation: ') + chalk.blue('https://github.com/yourusername/open-test'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan'
    }
  )
);
