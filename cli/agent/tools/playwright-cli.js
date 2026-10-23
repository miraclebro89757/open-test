'use strict';

const fs = require('fs');
const path = require('path');

const PLAYWRIGHT_VERSION = '1.63.0';

function packageRoot() {
  return path.join(__dirname, '..', '..', '..');
}

function playwrightCli() {
  const cli = path.join(packageRoot(), 'node_modules', 'playwright', 'cli.js');
  if (!fs.existsSync(cli)) {
    throw new Error('Playwright 1.63.0 is not installed. Run npm install in the open-test directory.');
  }
  return cli;
}

function playwrightInvoke(extraArgs) {
  return { file: process.execPath, args: [playwrightCli(), ...extraArgs] };
}

module.exports = { PLAYWRIGHT_VERSION, packageRoot, playwrightCli, playwrightInvoke };
