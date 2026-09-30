'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { createRequire } = require('module');
const { runPlaywright } = require('./tools/playwright');
const { healSelector } = require('./tools/heal');
const { fetchDefects, renderDefects } = require('./tools/defects');
const { buildReport, signRelease } = require('./tools/report');
const { gitDiffImpact } = require('./tools/git-diff');
const { productWorkspace } = require('./tools/workspace');
const { bundledPromptsDir, isBuiltinAnalysisPrompt } = require('./prompts');
const { installDocumentAutocomplete } = require('./document-complete');

const execFileAsync = promisify(execFile);
const requirePi = createRequire(path.join(__dirname, '..', '..', 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json'));

function textResult(text, details) {
  return { content: [{ type: 'text', text }], details };
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
  }
  const { Type } = await import(requirePi.resolve('typebox'));

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
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const result = await healSelector({
        cwd: ctx.cwd,
        ...params,
        readFile: fs.promises.readFile,
        writeFile: fs.promises.writeFile,
        confirm: async ({ filePath, oldSelector, newSelector }) => {
          if (!ctx.hasUI) return false;
          return ctx.ui.confirm('自愈选择器', `${filePath}\n${oldSelector}\n→ ${newSelector}`);
        },
      });
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
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const result = await fetchDefects({ source: params.source || 'auto' });
      if (result.configured) {
        const file = path.join(workspace, 'defects', 'latest.md');
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(file, renderDefects(result.bugs));
      }
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
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const workspace = visibleWorkspace(params.requirementDir, params.productName);
      const report = buildReport(workspace);
      const safeName = path.basename(params.name || 'brief.md').replace(/[^\w.\-\u4e00-\u9fff]/g, '');
      const file = path.join(workspace, 'reports', safeName.endsWith('.md') ? safeName : `${safeName || 'brief'}.md`);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, report.text);
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
      return textResult(`${result.message}\n${result.files.join('\n')}`, result);
    },
  });
};

module.exports.blockBuiltinPromptEdit = blockBuiltinPromptEdit;
