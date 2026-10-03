'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { createRequire } = require('module');
const { runPlaywright } = require('./tools/playwright');
const { playwrightInvoke } = require('./tools/playwright-cli');
const { recordScenario } = require('./tools/record');
const { selectRecordingMode, getModeConfirmationMessage } = require('./tools/record-mode-selector');
const { createLLMClient } = require('./tools/llm-client');
const { pickFolder, canPickFolder } = require('./tools/folder-picker');
const { healSelector, pendingInProject, keepHealVersion } = require('./tools/heal');
const { fetchDefects, renderDefects } = require('./tools/defects');
const { buildReport } = require('./tools/report');
const { productWorkspace } = require('./tools/workspace');
const { bundledPromptsDir, isBuiltinAnalysisPrompt } = require('./prompts');
const { installDocumentAutocomplete } = require('./document-complete');
const { readGraph, storeRequirementGraph, queryRequirementGraph } = require('./graph/store');
const {
  TASK_MODELS,
  formatProfileChoice,
  normalizeTaskId,
  readProfile,
  resolveLLMConfig,
  taskForStep,
  useProfile,
  writeTaskModel,
} = require('../llm/config-store');
const { piProviderId } = require('./pi-models');
const { updateCheckpoint, loadState } = require('./tasks/checkpoint');
const { noteDocumentRead, workspaceForFile, progressLines } = require('./tasks/progress');
const { readProject, setProject } = require('./project');
const { STEPS, CHOICES, prepareStep, confirmPoints } = require('./commands');

const execFileAsync = promisify(execFile);
const requirePi = createRequire(path.join(__dirname, '..', '..', 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json'));

function textResult(text, details) {
  return { content: [{ type: 'text', text }], details };
}

function markTask(workspace, { product, sourceFile, task, step, action, note }) {
  if (!workspace || !step) return null;
  return updateCheckpoint(workspace, { product, sourceFile, action, task, step, note });
}

let activeWorkspace = null;

function showProgress(ctx, workspace, readProgress) {
  const ui = ctx && ctx.ui;
  if (!ui || !ctx.hasUI) return;
  if (workspace) activeWorkspace = workspace;
  const target = workspace || activeWorkspace;
  let state = null;
  if (target && fs.existsSync(path.join(target, 'tasks', 'checkpoint.json'))) state = loadState(target);
  const lines = progressLines(state, readProgress);
  if (typeof ui.setWidget === 'function') ui.setWidget('opentest-progress', lines, { placement: 'aboveEditor' });
  if (typeof ui.setStatus === 'function') ui.setStatus('opentest', lines[0]);
  if (typeof ui.setWorkingMessage === 'function') ui.setWorkingMessage(lines[0]);
}

async function ensureChromium() {
  const command = playwrightInvoke(['install', 'chromium']);
  await execFileAsync(command.file, command.args, {
    cwd: path.join(__dirname, '..', '..'),
    timeout: 10 * 60 * 1000,
  });
}

function visibleWorkspace(requirementDir, productName) {
  const workspace = productWorkspace(requirementDir, productName);
  if (path.basename(workspace).startsWith('.')) {
    throw new Error('产品工作目录必须在 Finder 里可见');
  }
  return workspace;
}

function agentHome() {
  return process.env.OPENTEST_HOME || os.homedir();
}

async function reviewHeals(ctx, project) {
  const pending = pendingInProject(project);
  if (!pending.length) {
    ctx.ui.notify('没有待确认的自愈版本', 'info');
    return;
  }
  for (const entry of pending) {
    const choice = await ctx.ui.select(`${path.basename(entry.file)} 保留哪一版`, ['保留自愈后', '恢复自愈前']);
    if (!choice) return;
    keepHealVersion(entry, choice === '恢复自愈前' ? 'before' : 'after');
  }
  ctx.ui.notify('已按选择保留自愈版本', 'info');
}

/**
 * Switch the live session to a stored profile — no restart, context kept.
 *
 * Pi owns the mechanics: we look the profile's model up in its registry and
 * hand it to `ctx.setModel()`, which swaps the model on the running session.
 * This is the same path Pi's own `/model` picker and Ctrl+P cycling use, so a
 * switch made here is indistinguishable from one the user made themselves.
 */
async function activateProfile(ctx, profileName, model) {
  const registry = ctx.modelRegistry;
  if (!registry || typeof registry.find !== 'function') {
    return { ok: false, reason: 'unsupported' };
  }
  const target = registry.find(piProviderId(profileName), model);
  if (!target) {
    return { ok: false, reason: 'missing' };
  }
  const ok = await ctx.setModel(target);
  return { ok: ok !== false, model: target };
}

/**
 * Switch which stored profile this session uses, and persist it as the default
 * so the next launch starts there too.
 *
 * Only masked labels are ever rendered. The raw key stays on disk and is never
 * placed in a message, a tool result, or anything the model can read.
 */
async function switchModel(ctx, args) {
  const storeContext = { cwd: ctx.cwd, homeDir: process.env.OPENTEST_HOME || undefined };

  let resolved;
  try {
    resolved = resolveLLMConfig(storeContext);
  } catch (error) {
    ctx.ui.notify(`读取模型配置失败：${error.message}`, 'error');
    return;
  }

  const direct = String(args || '').trim();
  let target = direct;
  if (!target) {
    // Only profiles that exist on disk are switchable; failover placeholders are not.
    const saved = resolved.profiles.filter((item) => item.saved);
    if (!saved.length) {
      ctx.ui.notify('还没有任何模型配置。在终端运行：open-test config', 'warning');
      return;
    }
    const byName = new Map(saved.map((item) => [
      formatProfileChoice(item, item.name === resolved.activeProfile),
      item.name,
    ]));
    const picked = await ctx.ui.select('切换到哪个模型配置', [...byName.keys()]);
    if (!picked) return;
    target = byName.get(picked);
    if (!target) {
      ctx.ui.notify('没认出选中的配置，请重试', 'error');
      return;
    }
  }

  const chosen = resolved.profiles.find((item) => item.name === target);
  if (!chosen) {
    ctx.ui.notify(`❌ 没有名为 ${target} 的配置`, 'error');
    return;
  }

  const result = await activateProfile(ctx, target, chosen.model);
  if (result.reason === 'missing') {
    ctx.ui.notify(`Pi 没有登记 ${target}，请重启一次 open-test run 让配置生效`, 'error');
    return;
  }
  if (result.reason === 'unsupported') {
    ctx.ui.notify('当前 Pi 版本不支持运行时切换，请用 /model 或 Ctrl+P', 'warning');
    return;
  }
  if (!result.ok) {
    ctx.ui.notify(`切换失败：${target} 的 key 不可用`, 'error');
    return;
  }

  try {
    useProfile({ ...storeContext, profileName: target });
  } catch {
    // Persisting the default is a convenience; the live switch already happened.
  }
  ctx.ui.notify(`✅ 已切换到 ${target} · ${chosen.model}，上下文保留，无需重启`, 'info');
}

/**
 * Route a testing task to a specific profile, e.g. run bug analysis on the
 * strong model while case generation stays on the cheap one.
 */
async function taskModel(ctx, args) {
  const storeContext = { cwd: ctx.cwd, homeDir: process.env.OPENTEST_HOME || undefined };
  let resolved;
  try {
    resolved = resolveLLMConfig(storeContext);
  } catch (error) {
    ctx.ui.notify(`读取模型配置失败：${error.message}`, 'error');
    return;
  }
  const saved = resolved.profiles.filter((item) => item.saved);
  if (!saved.length) {
    ctx.ui.notify('还没有任何模型配置。在终端运行：open-test config', 'warning');
    return;
  }

  const words = String(args || '').trim().split(/\s+/).filter(Boolean);
  let taskId = normalizeTaskId(words[0] || '');
  if (!taskId) {
    const picked = await ctx.ui.select('哪个任务指定模型', TASK_MODELS.map((t) => t.label));
    if (!picked) return;
    taskId = normalizeTaskId(picked);
  }
  if (!taskId) {
    ctx.ui.notify(`没认出任务。可选：${TASK_MODELS.map((t) => t.label).join('、')}`, 'error');
    return;
  }

  let profileName = words[1] || '';
  if (!profileName) {
    const byName = new Map(saved.map((item) => [
      formatProfileChoice(item, item.name === resolved.activeProfile),
      item.name,
    ]));
    const picked = await ctx.ui.select(`${taskLabel(taskId)} 用哪个模型`, [
      ...byName.keys(),
      '沿用当前模型（不指定）',
    ]);
    if (!picked) return;
    profileName = picked === '沿用当前模型（不指定）' ? '' : byName.get(picked) || '';
  }

  try {
    const written = writeTaskModel({ ...storeContext, scope: 'user', task: taskId, profileName });
    const task = TASK_MODELS.find((item) => item.id === taskId);
    ctx.ui.notify(
      profileName
        ? `✅ ${task.label} 以后固定用 ${profileName}（${written.filePath}）`
        : `✅ 已取消 ${task.label} 的指定模型，沿用当前模型`,
      'info',
    );
  } catch (error) {
    ctx.ui.notify(`❌ ${error.message}`, 'error');
  }
}

function taskLabel(taskId) {
  const task = TASK_MODELS.find((item) => item.id === taskId);
  return task ? task.label : taskId;
}

/**
 * Apply the task's mapped profile before a step runs.
 *
 * Silent when a task has no mapping — that is the common case, and a model
 * change the user did not ask for should never be announced as one.
 */
async function applyTaskModel(ctx, step) {
  const task = taskForStep(step);
  if (!task) return null;
  let resolved;
  try {
    resolved = resolveLLMConfig({ cwd: ctx.cwd, homeDir: process.env.OPENTEST_HOME || undefined });
  } catch {
    return null;
  }
  const profileName = resolved.taskModels?.[task.id];
  if (!profileName) return null;
  const chosen = resolved.profiles.find((item) => item.name === profileName);
  if (!chosen || !chosen.saved) return null;
  const result = await activateProfile(ctx, profileName, chosen.model);
  if (result.ok) {
    ctx.ui.notify(`${task.label} 使用 ${profileName} · ${chosen.model}`, 'info');
    return result;
  }
  return null;
}

async function runStep(pi, name, ctx) {
  const project = readProject(agentHome()).current;
  if (!project) {
    ctx.ui.notify('先用 /project 选择项目目录', 'warning');
    return;
  }
  // Route before the choice prompt so the model is already correct even if the
  // user takes a while to decide.
  await applyTaskModel(ctx, name);
  const choice = await ctx.ui.select('这一步要做什么', CHOICES);
  if (!choice) return;
  const result = prepareStep({ name, choice, project });
  if (result.action === 'blocked') {
    ctx.ui.notify(result.message, 'warning');
    return;
  }
  if (result.action === 'view') {
    pi.sendUserMessage(`当前项目 ${project}。用户要查看已有的${result.step.title}，不要创建或修改文件。\n${result.files.join('\n')}`);
    if (name === 'points') {
      const ok = await ctx.ui.confirm('确认这些测试点？', '确认后才可以生成用例');
      if (ok) confirmPoints(project);
    }
    if (name === 'heal') await reviewHeals(ctx, project);
    return;
  }
  if (result.action !== 'create') return;
  pi.sendUserMessage(result.message);
  if (name === 'points' && typeof ctx.waitForIdle === 'function') {
    await ctx.waitForIdle();
    const ok = await ctx.ui.confirm('确认这些测试点？', '确认后才可以生成用例');
    if (ok) confirmPoints(project);
  }
  if (name === 'run' && typeof ctx.waitForIdle === 'function') {
    await ctx.waitForIdle();
    await reviewHeals(ctx, project);
  }
  if (name === 'heal') await reviewHeals(ctx, project);
}

async function promptForProjectPath(ctx) {
  const homeDir = os.homedir();
  const examplePath = path.join(homeDir, 'Desktop', '项目名');
  ctx.ui.notify(
    `💡 提示：\n` +
    `• 使用完整路径，例如：${examplePath}\n` +
    `• 可以使用 ~ 代表用户目录：~/Desktop/项目名\n` +
    `• 可以拖拽文件夹到终端获取路径`,
    'info'
  );
  return ctx.ui.input('项目目录（完整路径）', examplePath);
}

/**
 * Open the native macOS folder chooser, falling back to manual input when the
 * dialog is unavailable. Returns null when the user cancels or dismisses.
 */
async function browseForProject(ctx, currentPath, pick) {
  ctx.ui.notify('正在打开系统文件夹选择器…', 'info');
  const result = await pick({
    title: '选择项目目录',
    defaultPath: currentPath || os.homedir(),
  });

  if (result.ok) return result.path;
  if (result.reason === 'cancelled') {
    ctx.ui.notify('已取消选择', 'info');
    return null;
  }
  ctx.ui.notify(`${result.message}\n已切换为手动输入路径`, 'warning');
  return promptForProjectPath(ctx);
}

async function switchProject(ctx, args, deps = {}) {
  const pick = deps.pick || pickFolder;
  const pickerSupported = deps.pickerSupported === undefined ? canPickFolder() : deps.pickerSupported;

  let target = String(args || '').trim();
  if (!target) {
    const home = agentHome();
    const { recent, current } = readProject(home);
    const BROWSE = '📁 浏览本机文件夹...';
    const MANUAL = '输入新路径...';

    const options = [...recent];
    // Only offer the native picker where one actually exists.
    if (pickerSupported) options.push(BROWSE);
    options.push(MANUAL);

    const picked = await ctx.ui.select('切换项目', options);
    if (!picked) return;

    if (picked === BROWSE) {
      target = await browseForProject(ctx, current, pick);
      if (target === null) return;
    } else if (picked === MANUAL) {
      target = await promptForProjectPath(ctx);
    } else {
      target = picked; // Use recent project
    }
  }

  if (!target || target.trim() === '') return;

  try {
    const saved = setProject(target, agentHome());
    if (typeof ctx.ui.setStatus === 'function') ctx.ui.setStatus('opentest-project', path.basename(saved.current));
    ctx.ui.notify(`✅ 当前项目：${saved.current}`, 'info');
  } catch (error) {
    ctx.ui.notify(`❌ ${error.message}`, 'error');
  }
}

function registerWorkflow(pi) {
  if (typeof pi.registerCommand !== 'function') return;
  pi.registerCommand('project', {
    description: '切换当前项目，之后的步骤都在这个目录里',
    handler: (args, ctx) => switchProject(ctx, args),
  });
  // Deliberately NOT named `model`: Pi ships a built-in `/model` that already
  // switches the live session, and an extension command of the same name is
  // filtered out of autocomplete and flagged as a conflict. This one only adds
  // task-level routing on top of it.
  pi.registerCommand('task-model', {
    description: '给某个测试任务指定模型（如需求分析用强模型、用例生成用便宜模型）',
    handler: (args, ctx) => taskModel(ctx, args),
  });
  STEPS.forEach(([name, shortcut, title]) => {
    pi.registerCommand(name, {
      description: title,
      handler: (_args, ctx) => runStep(pi, name, ctx),
    });
    if (typeof pi.registerShortcut === 'function') {
      pi.registerShortcut(shortcut, {
        description: title,
        handler: (ctx) => runStep(pi, name, ctx),
      });
    }
  });
  if (typeof pi.registerShortcut === 'function') {
    pi.registerShortcut('ctrl+shift+9', {
      description: '切换项目',
      handler: (ctx) => switchProject(ctx, ''),
    });
  }
}

function blockBuiltinPromptEdit(event, cwd) {
  if (!event || (event.toolName !== 'write' && event.toolName !== 'edit')) return null;
  const filePath = event.input && (event.input.path || event.input.filePath);
  if (!isBuiltinAnalysisPrompt(filePath, bundledPromptsDir(), cwd)) return null;
  return {
    block: true,
    reason: '内置需求分析 prompt 只读。要换规则，在用户 prompts 目录新建模板。',
  };
}

/**
 * Keep a log of every model this session used, in order.
 *
 * Session context survives a model switch, so "which model produced this
 * output" is only answerable if the switches were recorded. Pi writes its own
 * `ModelChangeEntry` into the session file; this is the in-session view, and it
 * is what a report can cite when asked which model ran which task.
 */
const modelHistory = [];

function recordModelChange(event) {
  if (!event || !event.model || typeof event.model.id !== 'string') return;
  const label = `${event.model.provider}/${event.model.id}`;
  const previous = event.previousModel ? `${event.previousModel.provider}/${event.previousModel.id}` : null;
  const last = modelHistory[modelHistory.length - 1];
  if (last && last.label === label) return;
  modelHistory.push({ label, previous, source: event.source || 'set', at: new Date().toISOString() });
}

function modelHistorySnapshot() {
  return modelHistory.map((entry) => ({ ...entry }));
}

module.exports = async function opentestExtension(pi) {
  installDocumentAutocomplete(pi);
  if (typeof pi.on === 'function') {
    pi.on('tool_call', (event, ctx) => blockBuiltinPromptEdit(event, ctx && ctx.cwd));
    pi.on('turn_start', (_event, ctx) => showProgress(ctx, activeWorkspace));
    pi.on('model_select', (event) => recordModelChange(event));
    pi.on('tool_execution_start', (event, ctx) => {
      const args = event.args || {};
      if (event.toolName === 'read' && args.path) {
        const readProgress = noteDocumentRead(args.path, args, ctx && ctx.cwd);
        showProgress(ctx, workspaceForFile(args.path, ctx && ctx.cwd) || activeWorkspace, readProgress);
        return;
      }
      showProgress(ctx, activeWorkspace);
    });
  }
  const { Type } = await import(requirePi.resolve('typebox'));

  pi.registerTool({
    name: 'task_checkpoint',
    label: 'Task checkpoint',
    description: '查看或更新产品任务断点。分析、测试点、用例、录制、自愈、缺陷和简报都用这一份进度。',
    promptSnippet: 'Resume every task from the shared checkpoint',
    promptGuidelines: ['Call task_checkpoint with action status before any task. Do not redo steps already marked done. Plan steps once, then complete or fail the current step.'],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      sourceFile: Type.Optional(Type.String({ description: 'Requirement file path' })),
      action: Type.Optional(Type.String({ description: 'status, plan, complete, or fail' })),
      task: Type.Optional(Type.String({ description: 'analysis, test-points, cases, record, heal, defects, report, signoff, or git-diff' })),
      steps: Type.Optional(Type.String({ description: 'Step ids for plan, one per line' })),
      step: Type.Optional(Type.String({ description: 'Step id for complete or fail' })),
      note: Type.Optional(Type.String({ description: 'Failure note or a short result' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = updateCheckpoint(workspace, {
        product: params.productName,
        sourceFile: params.sourceFile,
        action: params.action || 'status',
        task: params.task,
        steps: params.steps,
        step: params.step,
        note: params.note,
      });
      showProgress(ctx, workspace);
      return textResult(result.text, result);
    },
  });

  pi.registerTool({
    name: 'run_playwright_test',
    label: 'Playwright',
    description: '在当前项目里执行一个 Playwright spec，并返回通过、失败和错误摘要。',
    promptSnippet: 'Run one local Playwright spec',
    promptGuidelines: ['Use run_playwright_test when the user asks to execute a Playwright spec. Do not use bash for it.'],
    parameters: Type.Object({
      specFile: Type.String({ description: 'Spec path inside the project, such as tests/login.spec.ts' }),
      headed: Type.Optional(Type.Boolean({ description: 'Open a visible browser window' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      await ensureChromium();
      const result = await runPlaywright({
        cwd: ctx.cwd,
        specFile: params.specFile,
        headed: params.headed,
        execFile: (file, args, options) => execFileAsync(file, args, options).then(
          (out) => ({ ...out, exitCode: 0 }),
          (error) => ({ stdout: error.stdout, stderr: error.stderr, exitCode: error.code ?? 1 }),
        ),
      });
      return textResult(result.text, result);
    },
  });

  pi.registerTool({
    name: 'record_playwright_scenario',
    label: 'Record scenario',
    description: '打开沙箱里的 Playwright 录制窗口，引导用户操作，并把录制对上功能用例的自动化标记。支持三种录制模式：ui+api（同时录制 UI 和 API）、ui-only（仅 UI）、api-only（仅 API）。',
    promptSnippet: 'Record a sandbox scenario with Playwright and tag matching cases',
    promptGuidelines: [
      'Ask for the sandbox http(s) URL, then use record_playwright_scenario. Do not invent the URL.',
      'Use mode="ui+api" (default) to record both UI (Playwright) and API (HAR) scripts simultaneously.',
      'Use mode="ui-only" for UI automation only, or mode="api-only" for API recording only.',
      'The terminal asks the user before opening the browser.',
    ],
    executionMode: 'sequential',
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      sandboxUrl: Type.String({ description: 'Sandbox base URL, http or https' }),
      caseId: Type.Optional(Type.String({ description: 'Functional case id to attach when several cases share the same wording' })),
      mode: Type.Optional(Type.String({ 
        description: 'Recording mode: "ui+api" (default, records both UI and API), "ui-only" (UI only), or "api-only" (API only)',
        enum: ['ui+api', 'ui-only', 'api-only'],
      })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      await ensureChromium();
      
      // Interactive mode selection if no mode specified and UI available
      let selectedMode = params.mode || 'ui+api';
      if (!params.mode && ctx.hasUI) {
        selectedMode = await selectRecordingMode({ hasUI: true });
      }
      
      // Resolve a real LLM client for HAR analysis; null when unconfigured,
      // which makes the analyzer fall back to rules instead of faking a reply.
      const llmClient = createLLMClient({ cwd: ctx.cwd });
      
      const result = await recordScenario({
        workspace,
        sandboxUrl: params.sandboxUrl,
        caseId: params.caseId,
        mode: selectedMode,
        llmClient,
        execFile: (file, args, options) => execFileAsync(file, args, options),
        confirm: async (summary) => {
          if (!ctx.hasUI) return false;
          // Enhanced confirmation with mode info
          const enhancedSummary = getModeConfirmationMessage(selectedMode, params.sandboxUrl);
          return ctx.ui.confirm('录制沙箱场景', enhancedSummary);
        },
      });
      
      if (result.recorded && result.matches.length) {
        result.matches.forEach((item) => markTask(workspace, {
          product: params.productName, task: 'record', step: item.id, action: 'complete',
        }));
      } else if (result.recorded && params.caseId) {
        markTask(workspace, {
          product: params.productName, task: 'record', step: params.caseId, action: 'fail', note: result.message,
        });
      }
      showProgress(ctx, workspace);
      return textResult(result.message, result);
    },
  });

  pi.registerTool({
    name: 'heal_selector',
    label: 'Heal selector',
    description: '跑自动化时自动替换失效选择器，并留下替换前和替换后两个版本。',
    promptSnippet: 'Replace a failed selector immediately and keep both versions',
    promptGuidelines: ['Call heal_selector as soon as a selector fails during a run. Do not ask the user first. The user chooses which version to keep with /heal.'],
    executionMode: 'sequential',
    parameters: Type.Object({
      filePath: Type.String({ description: 'Test file inside the project' }),
      oldSelector: Type.String({ description: 'Selector to replace' }),
      newSelector: Type.String({ description: 'Replacement selector' }),
      requirementDir: Type.Optional(Type.String({ description: 'Directory containing the requirement document' })),
      productName: Type.Optional(Type.String({ description: 'Visible product name, such as 筑安通' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const result = await healSelector({
        cwd: ctx.cwd,
        filePath: params.filePath,
        oldSelector: params.oldSelector,
        newSelector: params.newSelector,
        readFile: fs.promises.readFile,
        writeFile: fs.promises.writeFile,
      });
      if (params.requirementDir && params.productName && result.changed) {
        const workspace = visibleWorkspace(params.requirementDir, params.productName);
        markTask(workspace, {
          product: params.productName,
          task: 'heal',
          step: `${path.basename(params.filePath)}:${params.oldSelector}`,
          action: result.success ? 'complete' : 'fail',
          note: result.message,
        });
        showProgress(ctx, workspace);
      }
      return textResult(result.message, result);
    },
  });

  pi.registerTool({
    name: 'fetch_zentao_jira',
    label: 'Fetch defects',
    description: '用本机环境变量直连禅道或 Jira，读取未在对话里粘贴的缺陷列表。',
    promptSnippet: 'Read Zentao or Jira defects from configured credentials',
    promptGuidelines: ['Use fetch_zentao_jira when the user asks for Zentao or Jira bugs. Do not invent defects when it reports that credentials are missing.'],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      source: Type.Optional(Type.String({ description: 'auto, zentao, or jira' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = await fetchDefects({ source: params.source || 'auto' });
      if (result.configured) {
        const file = path.join(workspace, 'defects', 'latest.md');
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(file, renderDefects(result.bugs));
      }
      markTask(workspace, {
        product: params.productName,
        task: 'defects',
        step: 'fetch',
        action: result.configured ? 'complete' : 'fail',
        note: result.message,
      });
      showProgress(ctx, workspace);
      return textResult(`${result.message}\n${renderDefects(result.bugs)}`, { ...result, workspace });
    },
  });

  pi.registerTool({
    name: 'write_executive_report',
    label: 'Executive report',
    description: '根据产品工作目录里已经写好的用例和缺陷，生成测试简报。',
    promptSnippet: 'Summarize one product workspace into a report',
    promptGuidelines: ['Use write_executive_report after cases exist. Pass the visible product workspace. Do not invent pass rates.'],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      name: Type.Optional(Type.String({ description: 'Report file name without a directory' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const report = buildReport(workspace);
      const safeName = path.basename(params.name || 'brief.md').replace(/[^\w.\-\u4e00-\u9fff]/g, '');
      const file = path.join(workspace, 'reports', safeName.endsWith('.md') ? safeName : `${safeName || 'brief'}.md`);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, report.text);
      markTask(workspace, {
        product: params.productName, task: 'report', step: path.basename(file), action: 'complete',
      });
      showProgress(ctx, workspace);
      return textResult(`${report.text}\n写入 ${file}`, { ...report, path: file });
    },
  });

  pi.registerTool({
    name: 'store_requirement_graph',
    label: 'Requirement graph',
    description: '把需求分析得到的功能、场景、规则和关系写成产品图谱。图太大时分批调用，后续批次用 append。',
    promptSnippet: 'Store a requirement graph in batches',
    promptGuidelines: ['Call store_requirement_graph once per document section, with at most 20 nodes and 20 relationships. Use append after the first batch. Pass taskStep only on the last batch of that section. Do not draft the whole graph in the reply.'],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      sourceFile: Type.String({ description: 'Requirement file path' }),
      graph: Type.Optional(Type.String({ description: 'One JSON batch. Do not put the entire graph in one call.' })),
      graphPath: Type.Optional(Type.String({ description: 'JSON file inside the product workspace, used instead of graph' })),
      mode: Type.Optional(Type.String({ description: 'replace or append. Use append for later batches.' })),
      taskStep: Type.Optional(Type.String({ description: 'Section title. Pass it only on the last batch of that section.' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      try {
        const result = await storeRequirementGraph({
          workspace,
          product: params.productName,
          sourceFile: params.sourceFile,
          graph: params.graph,
          graphPath: params.graphPath,
          mode: params.mode || 'replace',
          cwd: workspace,
          env: process.env,
        });
        markTask(workspace, {
          product: params.productName,
          sourceFile: params.sourceFile,
          task: 'analysis',
          step: params.taskStep,
          action: 'complete',
        });
        showProgress(ctx, workspace);
        const skipped = result.excluded.length ? `跳过未确认 ${result.excluded.length} 项。` : '';
        return textResult(`${result.neo4j.message}\n节点 ${result.nodeCount}，关系 ${result.edgeCount}。${skipped}\n${result.dir}`, result);
      } catch (error) {
        markTask(workspace, {
          product: params.productName,
          sourceFile: params.sourceFile,
          task: 'analysis',
          step: params.taskStep,
          action: 'fail',
          note: error.message,
        });
        showProgress(ctx, workspace);
        throw error;
      }
    },
  });

  pi.registerTool({
    name: 'query_requirement_graph',
    label: 'Query graph',
    description: '从产品图谱查询一个功能的影响面，或一个场景的前置条件、规则和状态。',
    promptSnippet: 'Query impact or scenario context from the product graph',
    promptGuidelines: ['Use query_requirement_graph before writing cases. Do not add rules that are absent from the result.'],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      featureId: Type.Optional(Type.String({ description: 'Feature id for impact' })),
      featureName: Type.Optional(Type.String({ description: 'Feature name when the id is unknown' })),
      scenarioId: Type.Optional(Type.String({ description: 'Scenario id for case-writing context' })),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const graph = readGraph(workspace);
      const result = queryRequirementGraph(graph, params);
      const text = result.text || result.message || JSON.stringify({
        featureName: result.featureName,
        affectedScenarios: result.affectedScenarios,
        activeRules: result.activeRules,
        affectedTestSpecs: result.affectedTestSpecs,
      }, null, 2);
      return textResult(text, result);
    },
  });

  registerWorkflow(pi);
};

module.exports.blockBuiltinPromptEdit = blockBuiltinPromptEdit;
module.exports.switchProject = switchProject;
module.exports.switchModel = switchModel;
module.exports.taskModel = taskModel;
module.exports.applyTaskModel = applyTaskModel;
module.exports.activateProfile = activateProfile;
module.exports.recordModelChange = recordModelChange;
module.exports.modelHistorySnapshot = modelHistorySnapshot;
