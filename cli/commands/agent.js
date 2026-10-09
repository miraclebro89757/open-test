'use strict';

const { isUsableConfig, maskKey, readProfile, resolveLLMConfig } = require('../llm/config-store');
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

/**
 * Every usable saved profile, with its real key read from local config.
 *
 * Handing all of them to `launchAgent` is what lets Pi switch models mid
 * session — the keys are read here in the parent process and passed to Pi as
 * per-profile env vars, never written into `models.json`.
 */
function collectProfiles(resolved) {
  const store = runtimeContext();
  return resolved.profiles
    .filter((item) => item.saved && item.usable)
    .map((item) => {
      const stored = readProfile({ ...store, profileName: item.name });
      return {
        name: item.name,
        provider: stored?.provider || item.provider,
        baseUrl: stored?.baseUrl || item.baseUrl,
        model: stored?.model || item.model,
        apiKey: stored?.apiKey,
        usable: true,
      };
    })
    .filter((item) => item.model && item.baseUrl);
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
  const profiles = collectProfiles(resolved);
  if (profiles.length > 1) {
    console.log(`已登记 ${profiles.length} 个模型，运行中可用 /model 或 Ctrl+P 直接切换，不用重启：`);
    for (const item of profiles) console.log(`  · ${item.name} · ${item.model}`);
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
  console.log('切换模型用 /model 或 Ctrl+P，会话上下文保留。Ctrl+C 退出。产物写在需求文档旁边、以产品名命名的可见目录，例如 ~/Desktop/projects/MyProduct/。');
  let child;
  try {
    child = launchAgent({
      config,
      profiles,
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
