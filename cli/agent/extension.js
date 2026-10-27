'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { createRequire } = require('module');
const { runPlaywright } = require('./tools/playwright');
const { runRecordingSession, createPlaywrightRecordingSession } = require('./tools/record-session');
const { ensureRecordingBrowser } = require('../browser/recording-browser');
const { getModeConfirmationMessage } = require('./tools/record-mode-selector');
const { uiText } = require('./ui-copy');
const { resolveSandboxUrl, updateLastUsedUrl } = require('./tools/sandbox-config');
const { createLLMClient } = require('./tools/llm-client');
const { pickFolder, canPickFolder } = require('./tools/folder-picker');
const { fetchDefects, renderDefects, saveDefects } = require('./tools/defects');
const { buildReport } = require('./tools/report');
const { productWorkspace } = require('./tools/workspace');
const { bundledPromptsDir, isBuiltinAnalysisPrompt } = require('./prompts');
const { installDocumentAutocomplete } = require('./document-complete');
const { readGraph, storeRequirementGraph, queryRequirementGraph } = require('./graph/store');
const { alignRequirementVersions, queryBaselineFeature } = require('./evolution');
const { ingestRequirementSources } = require('./sources/ingest');
const { readRequirementFigures, formatFigureResult, createVisionReader, assertAnalysisStepFiguresRead } = require('./sources/figures');
const { syncCaseSheet } = require('./sources/case-sheet');
const { updateCheckpoint, loadState } = require('./tasks/checkpoint');
const { assertStepStandards } = require('./standards/review');
const { noteDocumentRead, workspaceForFile, progressLines } = require('./tasks/progress');
const { readProject, setProject } = require('./project');
const { STEPS, prepareStep, confirmPoints } = require('./commands');

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

function visibleWorkspace(requirementDir, productName) {
  const workspace = productWorkspace(requirementDir, productName);
  if (path.basename(workspace).startsWith('.')) {
    throw new Error('The product workspace must be a visible folder');
  }
  return workspace;
}

function agentHome() {
  return process.env.OPENTEST_HOME || os.homedir();
}

/**
 * The product directory the step commands work in.
 *
 * The terminal remembers one with /project. The Web UI has no such command: a
 * session is already opened on a directory, and that directory is the product
 * workspace, the same way Pi Web scopes every session to a project.
 */
function currentProject(ctx, options = {}) {
  if (options.host === 'web') return (ctx && ctx.cwd) || '';
  return readProject(agentHome()).current;
}

async function runStep(pi, name, ctx, options = {}) {
  const project = currentProject(ctx, options);
  if (!project) {
    ctx.ui.notify(uiText(options.host === 'web' ? 'step.needProjectWeb' : 'step.needProjectCli'), 'warning');
    return;
  }
  
  // Special handling for explore command
  if (name === 'explore') {
    
    // Get sandbox URL (will use config or prompt user)
    const message = `启动智能探索：用户操作一遍浏览器，Agent 自动生成测试脚本。

使用 explore_and_generate 工具，参数：
- requirementDir: 项目目录
- productName: 从项目路径提取产品名称
- sandboxUrl: 不传（让工具自动解析配置）

工具会：
1. 启动浏览器
2. 用户操作后关闭浏览器
3. Agent 自动分析并生成脚本

请调用 explore_and_generate 工具开始探索。`;
    
    pi.sendUserMessage(message);
    return;
  }
  
  // Original logic for other steps
  const createChoice = uiText('step.create');
  const viewChoice = uiText('step.view');
  const choice = await ctx.ui.select(uiText('step.what'), [createChoice, viewChoice]);
  if (!choice) return;
  const canonical = choice === viewChoice ? '查看已有文档' : choice === createChoice ? '创建新任务' : choice;
  const result = prepareStep({ name, choice: canonical, project });
  if (result.action === 'blocked') {
    ctx.ui.notify(uiText('step.pointsBlocked'), 'warning');
    return;
  }
  if (result.action === 'view') {
    pi.sendUserMessage(`当前项目 ${project}。用户要查看已有的${result.step.title}，不要创建或修改文件。\n${result.files.join('\n')}`);
    if (name === 'points') {
      const ok = await ctx.ui.confirm(uiText('step.pointsTitle'), uiText('step.pointsBody'));
      if (ok) confirmPoints(project);
    }
    return;
  }
  if (result.action !== 'create') return;
  pi.sendUserMessage(result.message);
  if (name === 'points' && typeof ctx.waitForIdle === 'function') {
    await ctx.waitForIdle();
    const ok = await ctx.ui.confirm(uiText('step.pointsTitle'), uiText('step.pointsBody'));
    if (ok) confirmPoints(project);
  }
}

async function promptForProjectPath(ctx) {
  const homeDir = os.homedir();
  const examplePath = path.join(homeDir, 'Desktop', '项目名');
  ctx.ui.notify(uiText('project.pathHint', { example: examplePath }), 'info');
  return ctx.ui.input(uiText('project.pathTitle'), examplePath);
}

/**
 * Open the native macOS folder chooser, falling back to manual input when the
 * dialog is unavailable. Returns null when the user cancels or dismisses.
 */
async function browseForProject(ctx, currentPath, pick) {
  ctx.ui.notify(uiText('project.opening'), 'info');
  const result = await pick({
    title: uiText('project.pickerTitle'),
    defaultPath: currentPath || os.homedir(),
  });

  if (result.ok) return result.path;
  if (result.reason === 'cancelled') {
    ctx.ui.notify(uiText('project.cancelled'), 'info');
    return null;
  }
  ctx.ui.notify(`${result.message}\n${uiText('project.manualFallback')}`, 'warning');
  return promptForProjectPath(ctx);
}

async function switchProject(ctx, args, deps = {}) {
  const pick = deps.pick || pickFolder;
  const pickerSupported = deps.pickerSupported === undefined ? canPickFolder() : deps.pickerSupported;

  let target = String(args || '').trim();
  if (!target) {
    const home = agentHome();
    const { recent, current } = readProject(home);
    const BROWSE = uiText('project.browse');
    const MANUAL = uiText('project.manual');

    const options = [...recent];
    // Only offer the native picker where one actually exists.
    if (pickerSupported) options.push(BROWSE);
    options.push(MANUAL);

    const picked = await ctx.ui.select(uiText('project.switch'), options);
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
    ctx.ui.notify(uiText('project.current', { path: saved.current }), 'info');
  } catch (error) {
    ctx.ui.notify(`❌ ${error.message}`, 'error');
  }
}

function registerWorkflow(pi, options = {}) {
  if (typeof pi.registerCommand !== 'function') return;
  const web = options.host === 'web';
  if (!web) {
    pi.registerCommand('project', {
      description: '切换当前项目，之后的步骤都在这个目录里',
      handler: (args, ctx) => switchProject(ctx, args),
    });
  }
  STEPS.forEach(([name, shortcut, title]) => {
    pi.registerCommand(name, {
      description: title,
      handler: (_args, ctx) => runStep(pi, name, ctx, options),
    });
    if (!web && typeof pi.registerShortcut === 'function') {
      pi.registerShortcut(shortcut, {
        description: title,
        handler: (ctx) => runStep(pi, name, ctx, options),
      });
    }
  });
  if (!web && typeof pi.registerShortcut === 'function') {
    pi.registerShortcut('ctrl+alt+p', {
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

async function installOpentest(pi, options = {}) {
  if (options.host !== 'web') installDocumentAutocomplete(pi);
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
    description: '查看或更新产品任务断点。分析、测试点、用例、录制、缺陷和简报都用这一份进度。',
    promptSnippet: 'Resume every task from the shared checkpoint',
    promptGuidelines: ['Call task_checkpoint with action status before any task. There is no start action. Do not redo steps already marked done. Plan steps once, write the current step, then complete or fail it. Do not complete an analysis section while its figures are still unread. Completing a test-points or cases step reviews 待确认 items against the case standard. Fix the file and complete again before the next step. Do not rewrite confirmed points or cases that have no 待确认 line.'],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as MyProduct' }),
      sourceFile: Type.Optional(Type.String({ description: 'Requirement file path' })),
      action: Type.Optional(Type.String({ description: 'status to read progress, plan to register steps, complete after the file is written, fail, or drop. There is no start.' })),
      task: Type.Optional(Type.String({ description: 'analysis, test-points, cases, record, defects, report, signoff, or git-diff' })),
      steps: Type.Optional(Type.String({ description: 'Step ids for plan, one per line' })),
      step: Type.Optional(Type.String({ description: 'Step id for complete or fail' })),
      note: Type.Optional(Type.String({ description: 'Failure note or a short result' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      if ((params.action || 'status') === 'complete' && params.task === 'analysis') {
        assertAnalysisStepFiguresRead(workspace, params.step);
      }
      if ((params.action || 'status') === 'complete' && (params.task === 'test-points' || params.task === 'cases')) {
        assertStepStandards(workspace, params.task, params.step);
      }
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
      const browser = await ensureRecordingBrowser();
      const result = await runPlaywright({
        cwd: ctx.cwd,
        specFile: params.specFile,
        headed: params.headed,
        executablePath: browser.executablePath,
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
    description: '打开一次沙箱浏览器，采集 Playwright UI 操作。每段写入 recordings/，不生成脚本，不录 API。',
    promptSnippet: 'Capture a Playwright UI recording into recordings/',
    promptGuidelines: [
      'Ask for the sandbox http(s) URL, then use record_playwright_scenario. Do not invent the URL. This captures UI actions only and writes recordings/<id>/capture.json. Do not write a Playwright spec, a pytest file, or a HAR.',
      'Pass caseId when the user named a case. Omit it to list cases that need a Playwright recording: high-priority core user journeys.',
      'API recording is not available. Do not pass mode="api-only" or mode="ui+api".',
      'The terminal asks the user before opening the browser.',
    ],
    executionMode: 'sequential',
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as MyProduct' }),
      sandboxUrl: Type.Optional(Type.String({ description: 'Sandbox base URL (http or https). If not provided, will use configured default or prompt user.' })),
      caseId: Type.Optional(Type.String({ description: 'Functional case id to attach when several cases share the same wording' })),
      mode: Type.Optional(Type.String({ 
        description: 'UI capture only. Leave this unset. api-only is refused.',
        enum: ['ui+api', 'ui-only', 'api-only'],
      })),
      cleanupPre: Type.Optional(Type.Boolean({ description: 'Generated API script cleans test data before the test. Default true.' })),
      cleanupPost: Type.Optional(Type.Boolean({ description: 'Generated API script cleans test data after the test. Default true.' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      if (params.mode === 'api-only') return textResult('API recording is not available yet.');
      const browser = await ensureRecordingBrowser();
      
      // Resolve sandbox URL (from config, env, or prompt)
      let sandboxUrl = params.sandboxUrl;
      if (!sandboxUrl) {
        const resolved = await resolveSandboxUrl(workspace, {
          piUI: ctx.ui,
          allowPrompt: ctx.hasUI,
        });
        sandboxUrl = resolved.url;
        
        // Update last used URL if it was temporary
        if (resolved.shouldSave) {
          await updateLastUsedUrl(workspace, sandboxUrl);
        }
      }
      
      const result = await runRecordingSession({
        workspace,
        sandboxUrl,
        caseId: params.caseId,
        confirm: async () => {
          if (!ctx.hasUI) return false;
          return ctx.ui.confirm(uiText('record.confirmTitle'), getModeConfirmationMessage('ui-only', sandboxUrl));
        },
        mode: 'ui-only',
        openSession: async (options) => createPlaywrightRecordingSession({
          ...options,
          executablePath: browser.executablePath || undefined,
        }),
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
    name: 'fetch_zentao_jira',
    label: 'Fetch defects',
    description: '用本机环境变量直连禅道或 Jira，读取未在对话里粘贴的缺陷列表。',
    promptSnippet: 'Read Zentao or Jira defects from configured credentials',
    promptGuidelines: ['Use fetch_zentao_jira when the user asks for Zentao or Jira bugs. Do not invent defects when it reports that credentials are missing.'],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as MyProduct' }),
      source: Type.Optional(Type.String({ description: 'auto, zentao, or jira' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = await fetchDefects({ source: params.source || 'auto' });
      if (result.configured) {
        saveDefects(workspace, result);
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
      productName: Type.String({ description: 'Visible product name, such as MyProduct' }),
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
    name: 'ingest_requirement_sources',
    label: 'Ingest sources',
    description: '从钉钉文档 MCP 采集根文档和直接关联文档，写成 knowledge/source-pack/。不覆盖图谱，也不下载整座知识库。',
    promptSnippet: 'Ingest a DingTalk requirement tree into a frozen source pack',
    promptGuidelines: [
      'Call ingest_requirement_sources when the user gives a DingTalk docs URL instead of a local file.',
      'Do not download nested documents by hand. After the pack exists, read knowledge/source-pack/ and do not pull document text from DingTalk again. A section with images still calls read_requirement_figures, which only refreshes the live image URL.',
      'Depth 2 means the root plus directly linked documents. Unreadable links become clarifications.',
    ],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the product workspace parent' }),
      productName: Type.String({ description: 'Visible product name, such as 易训' }),
      url: Type.String({ description: 'Root DingTalk document URL' }),
      depth: Type.Optional(Type.Number({ description: 'Document levels to ingest. Default 2: root plus direct links.' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = await ingestRequirementSources({
        workspace,
        product: params.productName,
        url: params.url,
        depth: params.depth,
      });
      updateCheckpoint(workspace, { product: params.productName, sourceFile: params.url, action: 'status' });
      showProgress(ctx, workspace);
      const unread = result.unread ? `，${result.unread} 条没读到的关联已写入待澄清` : '';
      return textResult(
        `已采集 ${result.ingested} 篇文档到 knowledge/source-pack/${unread}。分析时读这份源包，不要再去钉钉拉正文。这一节有图时调用 read_requirement_figures，它只刷新当时有效的图地址。`,
        result,
      );
    },
  });

  pi.registerTool({
    name: 'sync_case_sheet',
    label: 'Sync case sheet',
    description: '把本地功能用例推到钉钉个人空间表格，或把表格上的人工修改收回本地。不要用钉钉文档 MCP 写表格。',
    promptSnippet: 'Push or pull cases through the DingTalk spreadsheet MCP dingtalk-excel',
    promptGuidelines: [
      'Call sync_case_sheet with action push after writing or updating cases, so the tester can review them in 钉钉表格.',
      'Sheet headers are fixed, in this order: 编号、标题、模块、需求版本、优先级、对应测试点、前置条件、步骤、期望结果、状态、执行结果. Do not invent 用例编号、所属功能 or 自动化 as sheet columns. Do not create a second spreadsheet when knowledge/case-sheet.json already binds one.',
      'The sheet status column is only 正常 or 废弃. Local 待确认/已接受 stay review marks and show as 正常. 模块 is the case filename. 执行结果 comes from the latest run, do not type it.',
      'Call action pull after the tester edits the sheet. Apply those edits to cases/*.md. Table-derived lessons stay 待确认; do not enable them.',
      'If local markdown and the sheet both changed since the last push, write 待澄清 and do not merge. Do not delete local cases when a row disappears.',
    ],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the product workspace parent' }),
      productName: Type.String({ description: 'Visible product name, such as 易训' }),
      action: Type.Optional(Type.String({ description: 'push writes cases to the personal-space sheet. pull reads human edits back. Default push.' })),
      url: Type.Optional(Type.String({ description: 'Existing DingTalk spreadsheet URL. Omit to create one in 我的文档.' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = await syncCaseSheet({
        workspace,
        product: params.productName,
        action: params.action,
        url: params.url,
      });
      showProgress(ctx, workspace);
      if (result.action === 'pull') {
        const conflict = result.conflicts ? `，${result.conflicts} 条两边都改了已写入待澄清` : '';
        const lesson = result.lessons ? `，${result.lessons} 条表格改动记成待确认的用例经验` : '';
        return textResult(
          `已从钉钉表格收回 ${result.updated} 条修改${result.imported ? `，新导入 ${result.imported} 条` : ''}${conflict}${lesson}。本地 cases/*.md 仍是准。`,
          result,
        );
      }
      return textResult(
        `已把 ${result.written} 条用例推到钉钉个人空间表格。用表格筛选「需求版本」做评审，改完后再 pull。${result.url || ''}`,
        result,
      );
    },
  });

  pi.registerTool({
    name: 'read_requirement_figures',
    label: 'Read figures',
    description: '读需求源包里某一节标题下的图。向钉钉要当时有效的图地址，连同标题和紧挨着的正文一起交给视觉模型。',
    promptSnippet: 'Read the figures under one requirement heading before writing that section graph',
    promptGuidelines: [
      'After reading a section that contains images, call read_requirement_figures with that heading before store_requirement_graph.',
      'The tool refreshes the signed image URL from DingTalk. Do not use image links stored in the source pack; they expire.',
      'Write figure-only menus, fields, buttons, columns, and empty states into the graph, sourced to the figure. If the reading says 不一致, append a clarification that keeps both sides. Do not pick one.',
      'Do not complete the section while its figures are still unread.',
    ],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the product workspace parent' }),
      productName: Type.String({ description: 'Visible product name, such as 易训' }),
      heading: Type.String({ description: 'Section heading the images belong to. Images under that heading are that requirement\'s layout or diagram.' }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = await readRequirementFigures({
        workspace,
        heading: params.heading,
        fetcher: {
          async fetch(nodeId) {
            const { createDingTalkFetcherFromConfig } = require('./sources/dingtalk-mcp');
            const live = await createDingTalkFetcherFromConfig();
            return live.fetch(nodeId);
          },
        },
        vision: createVisionReader(),
      });
      showProgress(ctx, workspace);
      return textResult(formatFigureResult(result), {
        heading: result.heading,
        readings: result.readings.map((note) => ({ key: note.key, heading: note.heading, reading: note.reading })),
      });
    },
  });

  pi.registerTool({
    name: 'store_requirement_graph',
    label: 'Requirement graph',
    description: '把需求分析得到的功能、场景、规则和关系写成产品图谱。图太大时分批调用，后续批次用 append。',
    promptSnippet: 'Store a requirement graph in batches',
    promptGuidelines: ['If knowledge/source-pack/ exists, read that pack instead of live DingTalk text. When the section has images, call read_requirement_figures first. Call store_requirement_graph once per document section, with sectionHeading set to that heading, and at most 20 nodes and 20 relationships. Use append after the first batch. Do not pass taskStep in that call. Append that section\'s new clarifications to knowledge/需求评审.md, then complete the section with task_checkpoint and stop for the tester. Do not draft the whole graph in the reply.'],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as MyProduct' }),
      sourceFile: Type.String({ description: 'Requirement file path' }),
      graph: Type.Optional(Type.String({ description: 'One JSON batch. Do not put the entire graph in one call.' })),
      graphPath: Type.Optional(Type.String({ description: 'JSON file inside the product workspace, used instead of graph' })),
      mode: Type.Optional(Type.String({ description: 'replace or append. Use append for later batches.' })),
      taskStep: Type.Optional(Type.String({ description: 'Section title. Leave it empty while clarifications for this section are still unwritten.' })),
      sectionHeading: Type.Optional(Type.String({ description: 'Heading of the section being stored. Required when the source pack contains figures. Unread figures under this heading reject the write.' })),
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
          sectionHeading: params.sectionHeading,
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
      productName: Type.String({ description: 'Visible product name, such as MyProduct' }),
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

  pi.registerTool({
    name: 'align_requirement_versions',
    label: 'Align versions',
    description: '把同一产品的基线文档和重构文档对齐成待审核的版本演进方案。不覆盖图谱，也不改已有用例。',
    promptSnippet: 'Align a baseline PRD with a newer delta PRD in one product workspace',
    promptGuidelines: [
      'Call align_requirement_versions when the user gives both a baseline document and a refactor or delta document.',
      'Pass both file paths. Do not read only the newer file. Different products stay in different workspaces.',
      'The tool writes a review plan under knowledge/evolution/. It does not overwrite the graph or edit existing cases.',
      'A feature missing from the new document is unmentioned, not deleted. Deprecation waits for a person to confirm.',
      'Use query_baseline_feature when the delta names a feature without rules. Same-page “与某某一致” is not a baseline lookup.',
    ],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      baselinePath: Type.String({ description: 'Older full PRD path, such as V1.1.3' }),
      deltaPath: Type.String({ description: 'Newer refactor or delta PRD path' }),
      baselineVersion: Type.Optional(Type.String({ description: 'Baseline version. Read from 产品版本 when omitted.' })),
      deltaVersion: Type.Optional(Type.String({ description: 'Delta version. Read from 产品版本 when omitted.' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = await alignRequirementVersions({
        workspace,
        product: params.productName,
        baselinePath: params.baselinePath,
        deltaPath: params.deltaPath,
        baselineVersion: params.baselineVersion,
        deltaVersion: params.deltaVersion,
      });
      showProgress(ctx, workspace);
      return textResult(result.summary, {
        workspace,
        evolutionId: result.plan.evolution_id,
        status: result.plan.status,
        baselineVersion: result.baselineVersion,
        deltaVersion: result.deltaVersion,
        unmentioned: result.plan.requirement_changes.filter((item) => item.change_type === 'unmentioned').map((item) => item.name),
        pendingAssets: result.plan.test_asset_actions.filter((item) => item.requires_review).map((item) => item.asset_id),
      });
    },
  });

  pi.registerTool({
    name: 'query_baseline_feature',
    label: 'Baseline lookup',
    description: '从当前产品版本包里的基线文档检索一个功能的规则。只读这份基线，不读别的产品。',
    promptSnippet: 'Look up a feature in the baseline PRD recorded for this product',
    promptGuidelines: [
      'Call query_baseline_feature when the delta names a feature but does not restate its rules, or when it says 沿用当前.',
      'Do not use it for comparisons that point at another heading in the same delta, such as 与添加人员一致.',
      'The tool reads only the baseline path stored in this workspace version pack.',
    ],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      module: Type.String({ description: 'Feature name, such as 巡检管理 or 人员导入' }),
      aspect: Type.Optional(Type.String({ description: 'Slice to retrieve, such as 日/周/月 or 批量导入异常' })),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = queryBaselineFeature({
        workspace,
        module: params.module,
        aspect: params.aspect,
      });
      const text = result.found
        ? [`【基线】${result.heading}`, ...result.rules.map((rule, index) => `${index + 1}. ${rule}`)].join('\n')
        : `基线里没有定位到 ${params.module}${params.aspect ? ` / ${params.aspect}` : ''}。不要把缺失补成已确认规则。`;
      return textResult(text, result);
    },
  });

  pi.registerTool({
    name: 'explore_and_generate',
    label: 'Explore & Generate',
    description: '启动浏览器让用户操作一遍，Agent 自动分析并生成测试脚本。包含事件捕获、语义分析、脚本生成三个阶段。',
    promptSnippet: 'Let user explore in browser, then Agent generates test script automatically',
    promptGuidelines: [
      'Call explore_and_generate when user wants to record a test by doing it once',
      'The tool captures raw events, extracts semantic actions, and generates Playwright script',
      'Supports AI-enhanced analysis when LLM client is available',
      'User closes browser window to finish recording',
    ],
    executionMode: 'sequential',
    parameters: Type.Object({
      sandboxUrl: Type.Optional(Type.String({ description: 'Starting URL for exploration. If not provided, will use project config or prompt user.' })),
      requirementDir: Type.Optional(Type.String({ description: 'Directory containing the requirement document' })),
      productName: Type.Optional(Type.String({ description: 'Visible product name, such as 筑安通' })),
      caseId: Type.Optional(Type.String({ description: 'Test case ID to associate with this recording' })),
      headless: Type.Optional(Type.Boolean({ description: 'Run browser in headless mode (default: false)' })),
      timeout: Type.Optional(Type.Number({ description: 'Recording timeout in milliseconds (default: 900000 / 15 min)' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { exploreAndGenerate } = require('./tools/explore-and-generate');
      
      // Resolve workspace
      let workspace = ctx.cwd;
      if (params.requirementDir && params.productName) {
        workspace = visibleWorkspace(params.requirementDir, params.productName);
      }
      
      // Resolve sandbox URL
      let url = params.sandboxUrl;
      if (!url) {
        url = await resolveSandboxUrl(workspace, {
          piUI: ctx.ui,
          allowPrompt: true,
        });
      }
      
      // Create LLM client for AI-enhanced analysis
      const llmClient = await createLLMClient();
      
      // Update last used URL
      if (url) {
        await updateLastUsedUrl(workspace, url);
      }
      
      // Execute explore and generate
      const result = await exploreAndGenerate({
        url,
        workspace,
        caseId: params.caseId,
        llmClient,
        headless: params.headless !== undefined ? params.headless : false,
        timeout: params.timeout || 15 * 60 * 1000,
      });
      
      // Update checkpoint
      if (params.requirementDir && params.productName) {
        markTask(workspace, {
          product: params.productName,
          task: 'automation',
          step: 'explore',
          action: 'done',
          note: `Generated ${result.summary.testName}`,
        });
        showProgress(ctx, workspace);
      }
      
      // Format result
      const summary = [
        'Exploration finished.',
        '',
        'Summary:',
        `   - Recorded events: ${result.summary.eventCount}`,
        `   - Semantic actions: ${result.summary.actionCount}`,
        `   - User flows: ${result.summary.flowCount}`,
        `   - Test intent: ${result.summary.testIntent}`,
        `   - Analysis: ${result.summary.analysisSource === 'ai' ? 'model' : 'rules'}`,
        '',
        'Files:',
        `   - Test script: ${path.basename(result.summary.files.script)}`,
        `   - Notes: ${path.basename(result.summary.files.readme)}`,
        `   - Session data: ${path.basename(result.summary.files.sessionDir)}`,
      ].join('\n');
      
      return textResult(summary, result);
    },
  });

  registerWorkflow(pi, options);
}

// The terminal loads this file as a plain extension. The Web UI calls
// createExtension({ host: 'web' }) so the step commands use the session's
// directory instead of the terminal's remembered /project.
module.exports = (pi) => installOpentest(pi, { host: 'terminal' });
module.exports.createExtension = (options = {}) => (pi) => installOpentest(pi, options);
module.exports.currentProject = currentProject;
module.exports.blockBuiltinPromptEdit = blockBuiltinPromptEdit;
module.exports.switchProject = switchProject;
module.exports.recordModelChange = recordModelChange;
module.exports.modelHistorySnapshot = modelHistorySnapshot;
