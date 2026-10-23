'use strict';

const { launchAgent } = require('../agent/launch');
const { readPiModel, describeModel } = require('../agent/pi-config');
const { DEFAULT_ANALYSIS_PROMPT } = require('../agent/prompts');
const { prepareGraphService } = require('../services/local');
const readline = require('readline');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const text = String(answer || '').trim();
      resolve(text === 'y' || text === 'Y' || text === '是');
    });
  });
}

async function startAgent(prompt, options = {}) {
  const words = prompt || [];
  if (!process.stdout.isTTY && words.length === 0) {
    console.error('Pass a message, or run this in a terminal: npx open-test @requirements.md');
    process.exitCode = 2;
    return;
  }
  // One model configuration for both entries: Pi's own agent directory, which
  // Pi Web edits from its model page.
  const model = readPiModel({ env: process.env });
  if (!model.configured) {
    console.log('No default model yet. Set one in the Web UI: npx open-test web, then open Models at the bottom left.');
    console.log(`The configuration is in ${model.dir} and is shared by the terminal and the Web UI. Inside the agent, /login and /model work too.`);
  }
  const homeDir = process.env.OPENTEST_HOME || undefined;
  const graph = await prepareGraphService({
    env: process.env,
    homeDir,
    interactive: Boolean(process.stdout.isTTY && !options.print),
    confirm: ask,
  });
  if (model.configured) {
    console.log(`Model ${describeModel(model)} (change it on the Models page in the Web UI; the terminal uses the same setting)`);
  }
  console.log(graph.message);
  console.log('Open it from any directory. Type @ and a requirements file, for example @/Users/you/docs/requirements.md');
  console.log(`Requirement analysis uses /${DEFAULT_ANALYSIS_PROMPT}. That template is read-only. Custom templates go in ${model.dir}/prompts/.`);
  console.log('Switch models with /model or Ctrl+P. The session stays. Ctrl+C exits. Output is written next to the requirements file, in a visible folder named after the product, for example ~/Desktop/projects/MyProduct/.');
  let child;
  try {
    child = launchAgent({
      words,
      print: Boolean(options.print),
      cwd: process.cwd(),
      env: graph.env,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  child.on('exit', (code, signal) => {
    if (signal) {
      process.exitCode = 1;
      return;
    }
    process.exitCode = code === null ? 1 : code;
  });
}

function registerAgentCommand(program) {
  program
    .command('agent')
    .description('Open the test agent. Point at a requirement with @path.')
    .argument('[prompt...]', 'First message. Prefix a document with @.')
    .option('--print', 'Run one turn and exit')
    .action(async (prompt, options) => {
      await startAgent(prompt, options);
    });
}

module.exports = { registerAgentCommand, startAgent };
