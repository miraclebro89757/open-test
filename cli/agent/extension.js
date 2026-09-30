'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { createRequire } = require('module');
const { runPlaywright } = require('./tools/playwright');
const { recordScenario } = require('./tools/record');
const { healSelector } = require('./tools/heal');
const { fetchDefects, renderDefects } = require('./tools/defects');
const { buildReport, signRelease } = require('./tools/report');
const { gitDiffImpact } = require('./tools/git-diff');
const { productWorkspace } = require('./tools/workspace');
const { bundledPromptsDir, isBuiltinAnalysisPrompt } = require('./prompts');
const { installDocumentAutocomplete } = require('./document-complete');
const { readGraph, storeRequirementGraph, queryRequirementGraph } = require('./graph/store');
const { updateCheckpoint, loadState } = require('./tasks/checkpoint');
const { noteDocumentRead, workspaceForFile, progressLines } = require('./tasks/progress');

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
    throw new Error('产品工作目录必须在 Finder 里可见');
  }
  return workspace;
}

function blockBuiltinPromptEdit(event, cwd) {
  if (!event || (event.toolName !== 'write' && event.toolName !== 'edit')) return null;
  const filePath = event.input && (event.input.path || event.input.filePath);
  if (!isBuiltinAnalysisPrompt(filePath, bundledPromptsDir(), cwd)) return null;
  return {
    block: true,
    reason: '内置需求分析 prompt 只读。在输入框用 / 选择其他版本，或在用户 prompts 目录新建模板。',
  };
}

module.exports = async function opentestExtension(pi) {
  installDocumentAutocomplete(pi);
  if (typeof pi.on === 'function') {
    pi.on('tool_call', (event, ctx) => blockBuiltinPromptEdit(event, ctx && ctx.cwd));
    pi.on('turn_start', (_event, ctx) => showProgress(ctx, activeWorkspace));
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
    description: '查看或更新产品任务断点。分析、测试点、用例、录制、自愈、缺陷、简报、签字和变更影响都用这一份进度。',
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
    description: '打开沙箱里的 Playwright 录制窗口，引导用户操作，并把录制对上功能用例的自动化标记。',
    promptSnippet: 'Record a sandbox scenario with Playwright and tag matching cases',
    promptGuidelines: ['Ask for the sandbox http(s) URL, then use record_playwright_scenario. Do not invent the URL. The terminal asks the user before opening the browser.'],
    executionMode: 'sequential',
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      sandboxUrl: Type.String({ description: 'Sandbox base URL, http or https' }),
      caseId: Type.Optional(Type.String({ description: 'Functional case id to attach when several cases share the same wording' })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = await recordScenario({
        workspace,
        sandboxUrl: params.sandboxUrl,
        caseId: params.caseId,
        execFile: (file, args, options) => execFileAsync(file, args, options),
        confirm: async (summary) => {
          if (!ctx.hasUI) return false;
          return ctx.ui.confirm('录制沙箱场景', summary);
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
    description: '替换用例文件中的一个失效选择器。写入前必须在终端得到用户确认。',
    promptSnippet: 'Replace one failed selector after terminal confirmation',
    promptGuidelines: ['Use heal_selector instead of edit when replacing a failed DOM selector. The terminal asks the user before writing.'],
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
        confirm: async ({ filePath, oldSelector, newSelector }) => {
          if (!ctx.hasUI) return false;
          return ctx.ui.confirm('自愈选择器', `${filePath}\n${oldSelector}\n→ ${newSelector}`);
        },
      });
      if (params.requirementDir && params.productName && result.message !== '已取消，文件未修改。') {
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
    name: 'sign_release',
    label: 'Sign release',
    description: '在终端确认后，把发版签字写到该产品工作目录的 reports/signoff.md。',
    promptSnippet: 'Ask in the terminal before saving a release sign-off',
    promptGuidelines: ['Use sign_release only when the user asks to approve a release. Pass the visible product workspace. The terminal confirmation is required.'],
    executionMode: 'sequential',
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
      summary: Type.String({ description: 'Decision text shown in the terminal confirmation' }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = await signRelease({
        workspace,
        summary: params.summary,
        username: os.userInfo().username,
        writeFile: async (file, body) => {
          await fs.promises.mkdir(path.dirname(file), { recursive: true });
          await fs.promises.writeFile(file, body);
        },
        confirm: async (summary) => {
          if (!ctx.hasUI) return false;
          return ctx.ui.confirm('发版签字', summary);
        },
      });
      if (result.signed) {
        markTask(workspace, {
          product: params.productName, task: 'signoff', step: 'sign', action: 'complete', note: result.message,
        });
      }
      showProgress(ctx, workspace);
      return textResult(result.message, result);
    },
  });

  pi.registerTool({
    name: 'git_diff_impact',
    label: 'Diff impact',
    description: '查看当前 git 变更，并指出该产品 cases 目录里提到这些文件的用例。',
    promptSnippet: 'List changed files and matching cases in the product workspace',
    promptGuidelines: ['Use git_diff_impact when the user asks which cases are affected by the current change. Pass the visible product workspace.'],
    parameters: Type.Object({
      requirementDir: Type.String({ description: 'Directory containing the requirement document' }),
      productName: Type.String({ description: 'Visible product name, such as 筑安通' }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = gitDiffImpact({
        cwd: ctx.cwd,
        workspace,
        execFileSync: require('child_process').execFileSync,
      });
      markTask(workspace, {
        product: params.productName, task: 'git-diff', step: 'diff', action: 'complete', note: result.message,
      });
      showProgress(ctx, workspace);
      return textResult(`${result.message}\n${result.files.join('\n')}`, result);
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
};

module.exports.blockBuiltinPromptEdit = blockBuiltinPromptEdit;
