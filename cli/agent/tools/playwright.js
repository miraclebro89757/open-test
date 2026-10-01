'use strict';

const path = require('path');
const { resolveInside } = require('./paths');
const { playwrightInvoke } = require('./playwright-cli');

const SPEC = /\.(spec|test)\.(js|mjs|cjs|ts|tsx)$/;

async function runPlaywright({ cwd, specFile, headed = false, execFile }) {
  const abs = resolveInside(cwd, specFile);
  if (!SPEC.test(abs)) {
    throw new Error('specFile must be a Playwright spec, such as tests/login.spec.ts');
  }
  const args = ['test', abs, '--reporter=json'];
  if (headed === true) args.push('--headed');
  const command = playwrightInvoke(args);
  return execFile(command.file, command.args, {
    cwd,
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CI: '1', npm_config_yes: 'false' },
  }).then((result) => summarize(abs, result));
}

function summarize(specFile, result) {
  const stdout = result.stdout || '';
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = null;
  }
  const text = parsed
    ? JSON.stringify({
      specFile: path.basename(specFile),
      expected: parsed.stats?.expected ?? 0,
      unexpected: parsed.stats?.unexpected ?? 0,
      skipped: parsed.stats?.skipped ?? 0,
      errors: (parsed.errors || []).slice(0, 5),
    })
    : stdout.slice(0, 4000) || result.stderr?.slice(0, 2000) || 'playwright produced no output';
  return {
    exitCode: result.exitCode ?? 0,
    text,
  };
}

module.exports = { runPlaywright };
