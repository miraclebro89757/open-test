'use strict';

const { isUsableConfig, maskKey, resolveLLMConfig } = require('../llm/config-store');
const { launchAgent } = require('../agent/launch');
const { DEFAULT_ANALYSIS_PROMPT } = require('../agent/prompts');
const { prepareGraphService } = require('../services/local');
const readline = require('readline');

function runtimeContext() {
  const context = { env: process.env };
  if (process.env.OPENTEST_CWD) context.cwd = process.env.OPENTEST_CWD;
  if (process.env.OPENTEST_HOME) context.homeDir = process.env.OPENTEST_HOME;
  return context;
}

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
  let resolved;
  try {
    resolved = resolveLLMConfig(runtimeContext());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const config = { ...resolved.config, profile: resolved.activeProfile };
  if (!isUsableConfig(config)) {
    console.error('No usable model. Run: npx open-test config');
    process.exitCode = 1;
    return;
  }
  const homeDir = process.env.OPENTEST_HOME || undefined;
  const graph = await prepareGraphService({
    env: process.env,
    homeDir,
    interactive: Boolean(process.stdout.isTTY && !options.print),
    confirm: ask,
  });
  console.log(`${config.profile} · ${config.provider} · ${config.model} · ${maskKey(config.apiKey)}`);
  console.log(graph.message);
  console.log('在任意目录打开。输入 @ 后接需求文档路径，例如 @/Users/you/docs/requirements.md');
  console.log(`需求分析用 /${DEFAULT_ANALYSIS_PROMPT}，这个模板只读。自定义模板放在 ~/.opentest/pi-agent/prompts/。`);
  console.log('Ctrl+C 退出。产物写在需求文档旁边、以产品名命名的可见目录，例如 ~/Desktop/易训/筑安通/。');
  let child;
  try {
    child = launchAgent({
      config,
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
