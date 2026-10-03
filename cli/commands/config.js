'use strict';

const { PRESETS, PROVIDERS, PROVIDER_GUIDE, normalizeProvider } = require('../llm/presets');
const {
  TASK_MODELS,
  defaultScope,
  formatConfigList,
  formatProfileChoice,
  isPlaceholderKey,
  maskKey,
  readProfile,
  resolveLLMConfig,
  sanitizeApiKey,
  useProfile,
  validateApiKeyInput,
  writeProfile,
  writeTaskModel,
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

function buildProfile(options) {
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
  return { provider, profileName, profile };
}

/** Persist one profile. Shared by the wizard and the non-interactive `config set`. */
function saveProfile(options) {
  const { provider, profileName, profile } = buildProfile(options);
  return writeProfile({
    ...runtimeContext(),
    scope: scopeFrom(options),
    profileName,
    profile,
    activate: true,
  });
}

async function setConfig(options) {
  const { profileName, profile } = buildProfile(options);
  const written = saveProfile(options);
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

/**
 * Show or set the task -> profile routing map.
 *
 * This is the same mapping `/task-model` edits inside the agent; exposing it
 * here means routing can be set up before the agent is ever launched.
 */
async function routingConfig(task, profileName, options) {
  const store = runtimeContext();
  const paint = chalk();
  if (!task) {
    const resolved = resolveLLMConfig(store);
    console.log(paint.bold('Task routing (a task with no mapping uses the session model):'));
    for (const item of TASK_MODELS) {
      const target = resolved.taskModels[item.id];
      console.log(`  ${target ? paint.cyan(item.label) : paint.gray(item.label)}  →  ${target || paint.gray('(跟随当前模型)')}`);
    }
    console.log('');
    console.log(paint.gray(`Set one with: ${'open-test config routing <task> <profile>'}`));
    console.log(paint.gray(`Tasks: ${TASK_MODELS.map((item) => item.id).join(', ')}`));
    return resolved.taskModels;
  }

  const written = writeTaskModel({
    ...store,
    scope: scopeFrom(options),
    task,
    profileName,
  });
  const label = TASK_MODELS.find((item) => item.id === written.task)?.label || written.task;
  if (written.profileName) {
    console.log(paint.green(`${label} → ${written.profileName}`));
  } else {
    console.log(paint.gray(`${label} 改为跟随当前模型`));
  }
  console.log(paint.cyan(`File: ${written.filePath}`));
  return written;
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

/** Print "here is where the key comes from, and here is what one looks like". */
function printKeyGuide(guide) {
  const paint = chalk();
  console.log('');
  console.log(paint.bold(`  ${guide.label}`));
  if (guide.needsKey) {
    if (guide.keyUrl) {
      console.log(paint.cyan(`  拿 key 的地方：${guide.keyUrl}`));
      console.log(paint.gray(`  怎么拿：${guide.keySteps}`));
    } else {
      console.log(paint.gray(`  怎么拿：${guide.keySteps}`));
    }
    console.log(paint.gray(`  长这样（示例，不要照抄）：${guide.keyExample}`));
    console.log(paint.gray('  只粘贴中间那串字符，别带引号、别带 Bearer、别带空格'));
  } else {
    console.log(paint.gray('  本地模型不需要 key，直接回车继续'));
  }
  console.log('');
}

function existingProfiles() {
  try {
    // Failover placeholders are not writable, so only offer real ones.
    return resolveLLMConfig(runtimeContext()).profiles.filter((item) => item.saved);
  } catch (error) {
    return [];
  }
}

function providerChoices(preselect) {
  const ordered = preselect
    ? [...PROVIDERS.filter((id) => id === preselect), ...PROVIDERS.filter((id) => id !== preselect)]
    : PROVIDERS;
  return ordered.map((id) => {
    const guide = PROVIDER_GUIDE[id];
    const suffix = guide.needsKey ? '' : '（不需要 key）';
    return { name: `${guide.label} —— ${guide.blurb}${suffix}`, value: id };
  });
}

async function askApiKey(inquirer, guide) {
  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: `粘贴 ${guide.label} 的 API key（复制完直接回车）`,
      validate: (value) => validateApiKeyInput(value),
      filter: (value) => sanitizeApiKey(value),
    },
  ]);
  return answers.apiKey;
}

/**
 * When profiles already exist, ask whether to add another or replace one.
 * Returns seed defaults for the wizard, or CANCELLED to abort.
 */
const CANCELLED = Symbol('cancelled');

async function chooseAddOrReplace(inquirer, profiles) {
  const paint = chalk();
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: '你已经配过模型了，这次要做什么？',
      choices: [
        { name: '新增一套配置（保留现有的，之后用 /model 挑着用）', value: 'add' },
        { name: '替换其中一套（改掉它的 key / 模型 / 地址）', value: 'replace' },
      ],
    },
  ]);
  if (mode !== 'replace') return null;

  const resolved = resolveLLMConfig(runtimeContext());
  const { name } = await inquirer.prompt([
    {
      type: 'list',
      name: 'name',
      message: '要替换哪一套？',
      pageSize: 10,
      choices: profiles.map((item) => ({
        name: formatProfileChoice(item, item.name === resolved.activeProfile),
        value: item.name,
      })),
    },
  ]);

  // Reuse what is already on disk so a key rotation only asks for the new key.
  const stored = readProfile({ ...runtimeContext(), profileName: name });
  if (!stored) return { profileName: name };
  console.log(paint.gray(`  正在替换 ${name}（${stored.provider} · ${stored.model}）`));
  return {
    profileName: name,
    provider: stored.provider,
    model: stored.model,
    baseUrl: stored.baseUrl,
    apiKey: stored.apiKey,
  };
}

async function runWizard() {
  if (!process.stdin.isTTY) {
    console.error(
      '配置向导需要在一个交互式终端里运行。\n' +
        '无终端环境请直接用命令：\n' +
        '  open-test config set --provider deepseek --api-key sk-你的key --model deepseek-chat\n' +
        '  open-test config ping    # 验证能不能连通'
    );
    process.exitCode = 2;
    return;
  }

  const inquirer = require('inquirer');
  const context = runtimeContext();
  const paint = chalk();

  const profiles = existingProfiles();
  const seed = profiles.length ? await chooseAddOrReplace(inquirer, profiles) : null;
  if (seed === CANCELLED) return;

  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: '你要用哪家大模型？',
      pageSize: 10,
      choices: providerChoices(seed && seed.provider),
    },
  ]);

  const guide = PROVIDER_GUIDE[provider];
  const preset = PRESETS[provider];
  printKeyGuide(guide);

  // Replacing with the same provider can keep the key already on disk, so a
  // rotation does not force the user to paste a secret they cannot read back.
  let apiKey;
  const reusable = seed && seed.provider === provider && seed.apiKey
    && seed.apiKey !== 'ollama-no-key-required' && guide.needsKey;
  if (reusable) {
    const { reuse } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reuse',
        message: '沿用这一套原来的 key 吗？（key 只存在本地，不会经过大模型）',
        default: true,
      },
    ]);
    apiKey = reuse ? seed.apiKey : await askApiKey(inquirer, guide);
  } else if (guide.needsKey) {
    apiKey = await askApiKey(inquirer, guide);
  } else {
    apiKey = preset.apiKey;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'profile',
      message: '给这组配置起个名字（之后 /status 里能看到这个名字，直接回车用默认）',
      default: (seed && seed.profileName) || preset.profile,
      validate: (value) => (String(value || '').trim() ? true : '名字不能为空'),
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: provider === 'custom'
        ? '服务地址 Base URL（必填，照着对方给你的填）'
        : '服务地址 Base URL（不确定就直接回车用默认）',
      default: (seed && seed.provider === provider && seed.baseUrl) || preset.baseUrl,
      placeholder: guide.baseUrlExample,
      validate: (value) => (String(value || '').trim()
        ? true
        : `这一项必填，示例：${guide.baseUrlExample}`),
    },
    {
      type: 'input',
      name: 'model',
      message: provider === 'custom'
        ? '模型名 model（必填，照着对方给你的填）'
        : '模型名 model（不确定就直接回车用默认）',
      default: (seed && seed.provider === provider && seed.model) || preset.model,
      placeholder: guide.modelExample,
      validate: (value) => (String(value || '').trim()
        ? true
        : `这一项必填，示例：${guide.modelExample}`),
    },
    {
      type: 'list',
      name: 'scope',
      message: '这组配置存在哪里？',
      choices: [
        { name: '只给我自己用（~/.opentest/config.json，不会进 git）', value: 'user' },
        { name: '存进当前项目（./opentest.config.json，可以提交给同事共用）', value: 'project' },
      ],
      default: defaultScope(context.cwd || process.cwd()) === 'project' ? 1 : 0,
    },
  ]);

  const written = saveProfile({
    provider,
    profile: answers.profile,
    baseUrl: answers.baseUrl,
    model: answers.model,
    apiKey,
    project: answers.scope === 'project',
    global: answers.scope === 'user',
  });

  const replacing = Boolean(seed && seed.profileName === answers.profile);
  console.log('');
  console.log(paint.green(`  ✅ 已${replacing ? '替换' : '保存'}配置：${answers.profile}`));
  console.log(paint.gray(`  文件：${written.filePath}`));
  console.log(paint.gray(`  key：${maskKey(apiKey)}`));
  printWarning(written.warning);

  const { yes } = await inquirer.prompt([
    { type: 'confirm', name: 'yes', message: '现在测一下能不能连通？', default: true },
  ]);

  if (!yes) {
    console.log(paint.gray('\n  随时可以运行：open-test config ping'));
    console.log(paint.gray('  多配几套之后，进 agent 用 /model 随时切换\n'));
    return;
  }

  const result = await pingConfig({ profile: answers.profile });
  console.log('');
  if (result.ok) {
    console.log(paint.green('  🎉 配置完成。接下来运行：open-test run\n'));
  } else {
    console.log(paint.yellow('  连不上也没关系，配置已经存好了。常见原因：'));
    console.log(paint.gray('  · key 复制时少了尾巴几位 —— 重新跑 open-test config 重新填一次'));
    console.log(paint.gray('  · 账户余额用完了 —— 去官网充值后再 ping 一次'));
    console.log(paint.gray('  · 网络需要代理 —— 配好 HTTPS_PROXY 再重试'));
    console.log(paint.gray('  · 模型名写错了 —— open-test config list 看当前配置\n'));
  }
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
    .command('routing [task] [profile]')
    .description('Show or set which model each testing task uses')
    .option('-g, --global', 'Write ~/.opentest/config.json')
    .option('--project', 'Write ./opentest.config.json')
    .action(guard(async (task, profile, options) => {
      await routingConfig(task, profile, options);
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
  $ open-test config routing
  $ open-test config routing requirementAnalysis team-deepseek
  $ open-test config routing reportGeneration
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
  routingConfig,
  pingConfig,
};
