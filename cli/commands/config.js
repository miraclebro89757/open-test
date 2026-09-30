'use strict';

const { PRESETS, normalizeProvider } = require('../llm/presets');
const {
  defaultScope,
  formatConfigList,
  isPlaceholderKey,
  maskKey,
  resolveLLMConfig,
  useProfile,
  writeProfile,
} = require('../llm/config-store');
const { ping } = require('../llm/adapter');

function runtimeContext() {
  const context = { env: process.env };
  if (process.env.OPENTEST_CWD) context.cwd = process.env.OPENTEST_CWD;
  if (process.env.OPENTEST_HOME) context.homeDir = process.env.OPENTEST_HOME;
  return context;
}

function chalk() {
  return require('chalk');
}

function scopeFrom(options) {
  if (options.global && options.project) {
    throw new Error('Use either --global or --project, not both');
  }
  if (options.global) return 'user';
  if (options.project) return 'project';
  return undefined;
}

function printWarning(warning) {
  if (warning) console.log(chalk().yellow(`\n${warning}\n`));
}

async function setConfig(options) {
  const provider = normalizeProvider(options.provider);
  const preset = PRESETS[provider];
  const profileName = options.profile || preset.profile;
  const profile = {
    provider,
    baseUrl: options.baseUrl || preset.baseUrl,
    model: options.model || preset.model,
    apiKey: options.apiKey || (provider === 'ollama' ? preset.apiKey : ''),
    description: preset.description,
  };
  if (options.temperature !== undefined) profile.temperature = Number(options.temperature);
  if (options.maxTokens !== undefined) profile.maxTokens = Number(options.maxTokens);
  if (!profile.baseUrl || !profile.model) {
    throw new Error('Custom providers need both --base-url and --model');
  }
  if (provider !== 'ollama' && isPlaceholderKey(profile.apiKey)) {
    throw new Error('Pass a real --api-key. Placeholder keys are rejected.');
  }

  const written = writeProfile({
    ...runtimeContext(),
    scope: scopeFrom(options),
    profileName,
    profile,
    activate: true,
  });
  const paint = chalk();
  console.log(paint.green(`Saved profile ${profileName}`));
  console.log(paint.cyan(`File: ${written.filePath}`));
  console.log(paint.gray(`API key: ${maskKey(profile.apiKey)}`));
  printWarning(written.warning);
  return written;
}

async function useConfig(profileName, options) {
  const switched = useProfile({
    ...runtimeContext(),
    scope: scopeFrom(options),
    profileName,
  });
  const paint = chalk();
  console.log(paint.green(`Active profile: ${switched.activeProfile}`));
  console.log(paint.cyan(`File: ${switched.filePath}`));
  printWarning(switched.warning);
  return switched;
}

async function listConfig() {
  const resolved = resolveLLMConfig(runtimeContext());
  console.log(formatConfigList(resolved));
  return resolved;
}

async function pingConfig(options) {
  const resolved = resolveLLMConfig({
    ...runtimeContext(),
    overrides: options.profile ? { profile: options.profile } : null,
  });
  const paint = chalk();
  console.log(paint.gray(`Pinging ${resolved.activeProfile} · ${resolved.config.provider} · ${resolved.config.model}`));
  const result = await ping(resolved.config);
  if (result.ok) {
    console.log(paint.green(`${result.latencyMs}ms · ${result.message}`));
  } else {
    console.log(paint.red(`${result.latencyMs}ms · ${result.message}`));
    process.exitCode = 1;
  }
  return result;
}

async function runWizard() {
  if (!process.stdin.isTTY) {
    console.error(
      'Interactive config needs a terminal.\n' +
        'Use: open-test config set --provider <provider> --api-key <key> --model <model>'
    );
    process.exitCode = 2;
    return;
  }

  const inquirer = require('inquirer');
  const context = runtimeContext();
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'LLM provider',
      choices: [
        { name: 'OpenRouter (free testing)', value: 'openrouter' },
        { name: 'DeepSeek official', value: 'deepseek' },
        { name: 'CC Switch / aggregator', value: 'cc-switch' },
        { name: 'Local Ollama', value: 'ollama' },
        { name: 'Custom OpenAI-compatible', value: 'custom' },
      ],
    },
    {
      type: 'input',
      name: 'profile',
      message: 'Profile name',
      default: (current) => PRESETS[current.provider].profile,
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL',
      default: (current) => PRESETS[current.provider].baseUrl,
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model id',
      default: (current) => PRESETS[current.provider].model,
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'API key',
      when: (current) => current.provider !== 'ollama',
    },
    {
      type: 'list',
      name: 'scope',
      message: 'Where should this profile be saved?',
      choices: [
        { name: 'This project (./opentest.config.json)', value: 'project' },
        { name: 'This user (~/.opentest/config.json)', value: 'user' },
      ],
      default: defaultScope(context.cwd || process.cwd()),
    },
  ]);

  await setConfig({
    provider: answers.provider,
    profile: answers.profile,
    baseUrl: answers.baseUrl,
    model: answers.model,
    apiKey: answers.apiKey,
    project: answers.scope === 'project',
    global: answers.scope === 'user',
  });

  const pingNow = await inquirer.prompt([
    { type: 'confirm', name: 'yes', message: 'Ping this profile now?', default: true },
  ]);
  if (pingNow.yes) await pingConfig({ profile: answers.profile });
}

function guard(action) {
  return async (...args) => {
    try {
      await action(...args);
    } catch (err) {
      console.error(chalk().red(err.message || String(err)));
      process.exitCode = 1;
    }
  };
}

function registerConfigCommand(program) {
  const config = program
    .command('config')
    .description('Configure LLM providers (OpenRouter, DeepSeek, CC Switch, Ollama)')
    .action(guard(async () => {
      await runWizard();
    }));

  config
    .command('use <profile>')
    .description('Switch the active LLM profile')
    .option('-g, --global', 'Write ~/.opentest/config.json')
    .option('--project', 'Write ./opentest.config.json')
    .action(guard(async (profile, options) => {
      await useConfig(profile, options);
    }));

  config
    .command('set')
    .description('Write one provider profile')
    .requiredOption('--provider <provider>', 'openrouter | deepseek | cc-switch | ollama | custom')
    .option('--api-key <key>', 'API key')
    .option('--model <model>', 'Model id')
    .option('--base-url <url>', 'OpenAI-compatible base URL')
    .option('--profile <name>', 'Profile name')
    .option('--temperature <number>', 'Sampling temperature', parseFloat)
    .option('--max-tokens <number>', 'Max tokens', (value) => parseInt(value, 10))
    .option('-g, --global', 'Write ~/.opentest/config.json')
    .option('--project', 'Write ./opentest.config.json')
    .action(guard(async (options) => {
      await setConfig(options);
    }));

  config
    .command('ping')
    .description('Check that the active profile can complete a chat request')
    .option('--profile <name>', 'Ping this profile instead of the active one')
    .action(guard(async (options) => {
      await pingConfig(options);
    }));

  config
    .command('list')
    .description('Show profiles with API keys masked')
    .action(guard(async () => {
      await listConfig();
    }));

  config.addHelpText(
    'after',
    `
Examples:
  $ open-test config
  $ open-test config use free-openrouter
  $ open-test config use deepseek-prod
  $ open-test config set --provider deepseek --api-key sk-xxxx --model deepseek-chat
  $ open-test config set --provider openrouter --api-key sk-or-xxxx --model deepseek/deepseek-r1:free
  $ open-test config ping
  $ open-test config list
`
  );
}

module.exports = {
  registerConfigCommand,
  setConfig,
  useConfig,
  listConfig,
  pingConfig,
};
