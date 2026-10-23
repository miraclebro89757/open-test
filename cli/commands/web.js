'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { readPiModel } = require('../agent/pi-config');
const { prepareGraphService } = require('../services/local');

function packageRoot() {
  return path.join(__dirname, '..', '..');
}

/**
 * How to start the bundled Pi Web.
 *
 * With a production build (`npm run build`) the server is Pi Web's own
 * launcher. Without one, fall back to `next dev` so a fresh checkout works.
 */
function webCommand({ root = packageRoot(), port, hostname, noOpen, exists = fs.existsSync }) {
  if (exists(path.join(root, '.next', 'BUILD_ID'))) {
    const args = [path.join(root, 'bin', 'pi-web.js'), '--port', String(port), '--hostname', hostname];
    if (noOpen) args.push('--no-open');
    return { mode: 'start', file: process.execPath, args };
  }
  const nextBin = require.resolve('next/dist/bin/next', { paths: [root] });
  return {
    mode: 'dev',
    file: process.execPath,
    args: [nextBin, 'dev', '-H', hostname, '-p', String(port)],
  };
}

/**
 * Launch the Web UI.
 *
 * Models are configured in the Web UI's own model page and saved in Pi's agent
 * directory. This command does not point the server anywhere else, so the
 * Terminal Agent and the browser always share one configuration.
 *
 * @param {Object} options
 * @param {number|string} [options.port=30141]
 * @param {string} [options.hostname='127.0.0.1']
 * @param {boolean} [options.noOpen=false]
 */
async function launchWeb(options = {}) {
  const port = options.port || process.env.PORT || 30141;
  const hostname = options.hostname || process.env.PI_WEB_HOSTNAME || '127.0.0.1';
  const noOpen = options.noOpen || options.open === false || process.env.PI_WEB_NO_OPEN === '1';

  console.log('\nStarting the OpenTest Web UI...\n');

  const model = readPiModel({ env: process.env });
  if (!model.configured) {
    console.log('No default model yet. After the page opens, use Models at the bottom left to add an API key and pick a default.');
    console.log(`   Saved in ${model.dir}. The terminal agent uses the same configuration.\n`);
  }

  // Neo4j is optional; the Web UI works with local files only.
  const env = { ...process.env };
  try {
    const graph = await prepareGraphService({
      env: process.env,
      homeDir: process.env.OPENTEST_HOME,
      interactive: false,
      confirm: async () => false,
    });
    if (graph.env) Object.assign(env, graph.env);
  } catch (error) {
    console.log(`Graph service did not start (optional): ${error.message}`);
  }
  env.PORT = String(port);
  env.PI_WEB_HOSTNAME = hostname;
  if (noOpen) env.PI_WEB_NO_OPEN = '1';

  const command = webCommand({ port, hostname, noOpen });
  console.log('Starting:');
  console.log(`   Address: http://${hostname}:${port}`);
  console.log(`   Mode: ${command.mode === 'start' ? 'production build' : 'development (no .next build was found; npm run build switches to production)'}`);
  console.log(`   Config: ${model.dir}\n`);

  const child = spawn(command.file, command.args, {
    stdio: 'inherit',
    env,
    cwd: packageRoot(),
  });

  child.on('error', (error) => {
    console.error('Web UI failed to start:', error.message);
    process.exit(1);
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\nWeb UI exited with code ${code}`);
      process.exit(code);
    }
  });

  const cleanup = () => {
    if (child && !child.killed) {
      console.log('\nClosing the Web UI...');
      child.kill();
    }
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
}

module.exports = { launchWeb, webCommand };
