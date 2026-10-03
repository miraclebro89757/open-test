'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { healSelector } = require('./tools/heal');
const { runPlaywright } = require('./tools/playwright');
const { recordScenario } = require('./tools/record');
const { fetchDefects } = require('./tools/defects');
const { buildReport, signRelease } = require('./tools/report');
const { gitDiffImpact } = require('./tools/git-diff');
const { productWorkspace, sanitizeProductName } = require('./tools/workspace');
const { atToken, createDocumentAutocomplete, documentSuggestions, parentToken, pathSuggestions, mergeSuggestions } = require('./document-complete');
const { blockBuiltinPromptEdit } = require('./extension');
const { analysisPromptFile } = require('./prompts');

test('heal selector writes immediately and keeps the previous text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-heal-'));
  const file = path.join(dir, 'login.spec.ts');
  fs.writeFileSync(file, "page.locator('#old')");
  const healed = await healSelector({
    cwd: dir,
    filePath: 'login.spec.ts',
    oldSelector: '#old',
    newSelector: '#new',
    readFile: fs.promises.readFile,
    writeFile: fs.promises.writeFile,
    now: () => 1,
  });
  assert.equal(healed.changed, true);
  assert.equal(fs.readFileSync(file, 'utf8'), "page.locator('#new')");
  assert.equal(fs.readFileSync(healed.before, 'utf8'), "page.locator('#old')");
});

test('heal selector rejects a path outside the project', async () => {
  await assert.rejects(() => healSelector({
    cwd: '/work',
    filePath: '../secret.spec.ts',
    oldSelector: 'a',
    newSelector: 'b',
    readFile: async () => 'a',
    writeFile: async () => {},
  }), /outside/);
});

test('playwright tool only accepts a spec path', async () => {
  await assert.rejects(() => runPlaywright({
    cwd: '/work',
    specFile: 'package.json',
    execFile: async () => ({ stdout: '', exitCode: 0 }),
  }), /Playwright spec/);
});

test('playwright tool returns parsed stats', async () => {
  const result = await runPlaywright({
    cwd: '/work',
    specFile: 'tests/login.spec.ts',
    execFile: async () => ({
      stdout: JSON.stringify({ stats: { expected: 2, unexpected: 1, skipped: 0 }, errors: [] }),
      exitCode: 1,
    }),
  });
  assert.match(result.text, /"unexpected":1/);
});

test('recording maps the sandbox script onto the matching functional case', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-record-'));
  fs.mkdirSync(path.join(workspace, 'cases'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'cases', 'login.md'), [
    '### WEB-INSP-001 存在巡检管理菜单',
    '- 步骤：展开【项目】后点击【巡检管理】',
    '',
    '### WEB-INSP-002 未创建项目时展示缺省页',
    '- 步骤：查看缺省页',
    '',
  ].join('\n'));
  const result = await recordScenario({
    workspace,
    sandboxUrl: 'https://sandbox.example/app',
    confirm: async () => true,
    now: () => 1,
    execFile: async (_file, args) => {
      const output = args[args.indexOf('-o') + 1];
      fs.writeFileSync(output, "page.getByRole('link', { name: '巡检管理' }).click();\n");
    },
  });
  const saved = fs.readFileSync(path.join(workspace, 'cases', 'login.md'), 'utf8');
  assert.equal(result.recorded, true);
  assert.deepEqual(result.matches.map((item) => item.id), ['WEB-INSP-001']);
  assert.match(saved, /WEB-INSP-001[\s\S]*- 自动化：是/);
  assert.match(saved, /automation\/record-1\.spec\.ts/);
  assert.match(saved, /WEB-INSP-002[\s\S]*- 自动化：否/);
});

test('recording does not open the sandbox when confirmation is declined', async () => {
  let opened = false;
  const result = await recordScenario({
    workspace: fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-record-no-')),
    sandboxUrl: 'https://sandbox.example/app',
    confirm: async () => false,
    execFile: async () => { opened = true; },
  });
  assert.equal(result.recorded, false);
  assert.equal(opened, false);
});

test('defect fetch does not invent bugs without credentials', async () => {
  const result = await fetchDefects({ env: {}, fetchImpl: async () => { throw new Error('network'); } });
  assert.equal(result.configured, false);
  assert.deepEqual(result.bugs, []);
});

test('report counts only local case headings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-report-'));
  const workspace = path.join(dir, '易训');
  fs.mkdirSync(path.join(workspace, 'cases'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'cases', 'login.md'), '## TC-1\n## TC-2\n');
  const report = buildReport(workspace);
  assert.equal(report.caseCount, 2);
  assert.match(report.text, /用例标题 2 条/);
});

test('release sign-off is not written when confirmation is declined', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-sign-'));
  let written = false;
  const result = await signRelease({
    workspace: path.join(dir, '易训'),
    summary: '通过',
    confirm: async () => false,
    writeFile: async () => { written = true; },
    username: 'qa',
  });
  assert.equal(result.signed, false);
  assert.equal(written, false);
});

test('product workspace is a visible directory named after the product', () => {
  assert.equal(productWorkspace('/Users/me/Desktop/易训', '筑安通'), '/Users/me/Desktop/易训/筑安通');
  assert.equal(productWorkspace('/Users/me/Desktop/易训', '.筑安通'), '/Users/me/Desktop/易训/筑安通');
  assert.equal(sanitizeProductName('绩效管理'), '绩效管理');
  assert.throws(() => sanitizeProductName('...'), /产品项目名/);
  assert.notEqual(path.basename(productWorkspace('/tmp/docs', '筑安通')).startsWith('.'), true);
});

test('git diff impact matches case files by changed basename', () => {
  const result = gitDiffImpact({
    cwd: '/work',
    execFileSync: () => ' M src/login.ts\n',
    readCases: () => [{ name: 'login.md', text: 'covers login.ts' }, { name: 'pay.md', text: 'covers pay.ts' }],
  });
  assert.deepEqual(result.cases, ['login.md']);
});

test('builtin analysis prompt cannot be overwritten', () => {
  const builtin = analysisPromptFile();
  const blocked = blockBuiltinPromptEdit({ toolName: 'edit', input: { path: builtin } }, '/work');
  assert.equal(blocked.block, true);
  const custom = blockBuiltinPromptEdit({
    toolName: 'write',
    input: { path: '/Users/me/.opentest/pi-agent/prompts/my-review.md' },
  }, '/work');
  assert.equal(custom, null);
});

test('extension registers the terminal tools', async () => {
  const extension = require('./extension');
  const names = [];
  const commands = [];
  await extension({
    registerTool(tool) { names.push(tool.name); },
    registerCommand(name) { commands.push(name); },
    registerShortcut() {},
    on() {},
  });
  assert.deepEqual(names, [
    'task_checkpoint',
    'run_playwright_test',
    'record_playwright_scenario',
    'heal_selector',
    'fetch_zentao_jira',
    'write_executive_report',
    'store_requirement_graph',
    'query_requirement_graph',
  ]);
  assert.deepEqual(commands, [
    'project', 'task-model', 'status', 'analyze', 'points', 'cases', 'record', 'run', 'heal', 'defects', 'report',
  ]);
});

test('@ with no path lists the document folder and its entries', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-docs-home-'));
  fs.mkdirSync(path.join(home, 'Documents', '项目'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Documents', '登录需求.md'), '# 登录');
  fs.mkdirSync(path.join(home, 'Desktop'));
  const items = documentSuggestions('', home);
  assert.equal(items[0].label, '文档/');
  assert.equal(items[0].value, '@~/Documents/');
  assert.equal(items.some((item) => item.label === '项目/'), true);
  assert.equal(items.some((item) => item.value === '@~/Documents/登录需求.md'), true);
  assert.equal(documentSuggestions('登录', home).some((item) => item.label === '登录需求.md'), true);
  const nested = pathSuggestions('~/Documents/项目/', home);
  assert.equal(nested[0].label, '../');
  assert.equal(nested[0].value, '@~/Documents/');
  fs.writeFileSync(path.join(home, 'Documents', '项目', '登录.md'), '# 登录');
  const inside = pathSuggestions('~/Documents/项目/', home);
  assert.equal(inside.some((item) => item.value === '@~/Documents/项目/登录.md'), true);
  assert.equal(parentToken('@~/Documents/项目/'), '@~/Documents/');
  assert.equal(parentToken('@~/Documents/'), '@');
});

test('@ autocomplete forwards options.signal to the built-in provider', async () => {
  const signal = new AbortController().signal;
  const calls = [];
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-at-home-'));
  const provider = createDocumentAutocomplete({
    async getSuggestions(_lines, _line, _col, options) {
      calls.push(options);
      return { prefix: '@', items: [{ value: '@cli/', label: 'cli/' }] };
    },
    applyCompletion() {
      return { lines: ['@'], cursorLine: 0, cursorCol: 1 };
    },
  }, home);
  const bare = await provider.getSuggestions(['@'], 0, 1, { signal });
  const drilled = await provider.getSuggestions(['@~/Documents/'], 0, '@~/Documents/'.length, { signal });
  assert.equal(calls[0].signal, signal);
  assert.equal(calls[1].signal, signal);
  assert.equal(bare.items.some((item) => item.label === 'cli/'), true);
  assert.deepEqual(drilled.items, [{ value: '@cli/', label: 'cli/' }]);
});

test('@ token is taken from the end of the line and merged ahead of project files', () => {
  assert.equal(atToken('请读 @'), '@');
  assert.equal(atToken('请读 @需求'), '@需求');
  const merged = mergeSuggestions(
    [{ value: '@~/Documents/', label: '文档/', description: '~/Documents' }],
    { prefix: '@', items: [{ value: '@cli/', label: 'cli/' }] },
    '@',
  );
  assert.equal(merged.items[0].label, '文档/');
  assert.equal(merged.items[1].label, 'cli/');
});

// --- /project folder selection -------------------------------------------------

function projectHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-project-home-'));
}

function fakeCtx(answer) {
  const notices = [];
  return {
    notices,
    offered: null,
    ui: {
      async select(_title, options) { this.offered = options; return answer(options); },
      async input() { throw new Error('input should not be reached'); },
      notify(message, type) { notices.push({ message, type }); },
      setStatus() {},
    },
  };
}

test('/project offers the native folder browser on macOS', async () => {
  const { switchProject } = require('./extension');
  const home = projectHome();
  const previous = process.env.OPENTEST_HOME;
  process.env.OPENTEST_HOME = home;
  try {
    const ctx = fakeCtx(() => undefined);
    await switchProject(ctx, '', { pickerSupported: true, pick: async () => ({ ok: true, path: '/tmp' }) });
    assert.equal(ctx.ui.offered.includes('📁 浏览本机文件夹...'), true);
    assert.equal(ctx.ui.offered.includes('输入新路径...'), true);
  } finally {
    if (previous === undefined) delete process.env.OPENTEST_HOME;
    else process.env.OPENTEST_HOME = previous;
  }
});

test('/project hides the native browser where no picker exists', async () => {
  const { switchProject } = require('./extension');
  const previous = process.env.OPENTEST_HOME;
  process.env.OPENTEST_HOME = projectHome();
  try {
    const ctx = fakeCtx(() => undefined);
    await switchProject(ctx, '', { pickerSupported: false, pick: async () => ({ ok: true, path: '/tmp' }) });
    assert.equal(ctx.ui.offered.includes('📁 浏览本机文件夹...'), false);
    assert.deepEqual(ctx.ui.offered, ['输入新路径...']);
  } finally {
    if (previous === undefined) delete process.env.OPENTEST_HOME;
    else process.env.OPENTEST_HOME = previous;
  }
});

test('/project switches to the folder chosen in the native dialog', async () => {
  const { switchProject } = require('./extension');
  const home = projectHome();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-picked-'));
  const previous = process.env.OPENTEST_HOME;
  process.env.OPENTEST_HOME = home;
  const requested = [];
  try {
    const ctx = fakeCtx((options) => options.includes('📁 浏览本机文件夹...') ? '📁 浏览本机文件夹...' : undefined);
    await switchProject(ctx, '', {
      pickerSupported: true,
      pick: async (opts) => { requested.push(opts); return { ok: true, path: target }; },
    });

    assert.equal(requested.length, 1);
    assert.equal(requested[0].title, '选择项目目录');
    assert.equal(typeof requested[0].defaultPath, 'string');
    const saved = JSON.parse(fs.readFileSync(path.join(home, '.opentest', 'project.json'), 'utf8'));
    assert.equal(saved.current, target);
    assert.equal(ctx.notices.some((n) => n.message.includes('当前项目')), true);
  } finally {
    if (previous === undefined) delete process.env.OPENTEST_HOME;
    else process.env.OPENTEST_HOME = previous;
  }
});

test('/project leaves the project untouched when the dialog is cancelled', async () => {
  const { switchProject } = require('./extension');
  const home = projectHome();
  const previous = process.env.OPENTEST_HOME;
  process.env.OPENTEST_HOME = home;
  try {
    const ctx = fakeCtx(() => '📁 浏览本机文件夹...');
    await switchProject(ctx, '', {
      pickerSupported: true,
      pick: async () => ({ ok: false, reason: 'cancelled' }),
    });
    assert.equal(fs.existsSync(path.join(home, '.opentest', 'project.json')), false);
    assert.equal(ctx.notices.some((n) => n.message.includes('已取消选择')), true);
  } finally {
    if (previous === undefined) delete process.env.OPENTEST_HOME;
    else process.env.OPENTEST_HOME = previous;
  }
});

test('/project falls back to manual input when the native dialog fails', async () => {
  const { switchProject } = require('./extension');
  const home = projectHome();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-fallback-'));
  const previous = process.env.OPENTEST_HOME;
  process.env.OPENTEST_HOME = home;
  try {
    const ctx = fakeCtx(() => '📁 浏览本机文件夹...');
    ctx.ui.input = async () => target;
    await switchProject(ctx, '', {
      pickerSupported: true,
      pick: async () => ({ ok: false, reason: 'error', message: 'osascript: boom' }),
    });

    assert.equal(ctx.notices.some((n) => n.type === 'warning' && n.message.includes('osascript: boom')), true);
    const saved = JSON.parse(fs.readFileSync(path.join(home, '.opentest', 'project.json'), 'utf8'));
    assert.equal(saved.current, target);
  } finally {
    if (previous === undefined) delete process.env.OPENTEST_HOME;
    else process.env.OPENTEST_HOME = previous;
  }
});

test('/project still switches from the recent list without touching the picker', async () => {
  const { switchProject } = require('./extension');
  const home = projectHome();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-recent-'));
  const previous = process.env.OPENTEST_HOME;
  process.env.OPENTEST_HOME = home;
  try {
    fs.mkdirSync(path.join(home, '.opentest'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.opentest', 'project.json'),
      JSON.stringify({ current: '', recent: [fs.realpathSync(target)] })
    );
    let called = false;
    const ctx = fakeCtx((options) => options[0]);
    await switchProject(ctx, '', {
      pickerSupported: true,
      pick: async () => { called = true; return { ok: true, path: '/tmp' }; },
    });

    assert.equal(called, false, 'recent entries must not open the dialog');
    assert.deepEqual(ctx.ui.offered, [fs.realpathSync(target), '📁 浏览本机文件夹...', '输入新路径...']);
    const saved = JSON.parse(fs.readFileSync(path.join(home, '.opentest', 'project.json'), 'utf8'));
    assert.equal(saved.current, fs.realpathSync(target));
  } finally {
    if (previous === undefined) delete process.env.OPENTEST_HOME;
    else process.env.OPENTEST_HOME = previous;
  }
});

// --- runtime model switching + the key-never-reaches-the-model guarantee -------

const SECRET = 'sk-3d9a2f7c4b1e8d6a0f5b2c7e4a9d1f3b6c8e0a2d';

function seedProfiles(home, profiles, active) {
  fs.mkdirSync(path.join(home, '.opentest'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.opentest', 'config.json'),
    JSON.stringify({ active_profile: active, profiles, failover_order: [] }, null, 2)
  );
}

/**
 * Captures everything the TUI would render, and stands in for Pi's model
 * registry so we can observe a real `setModel` call rather than a config write.
 */
function recordingCtx(answer, { models = [], setModelResult = true } = {}) {
  const seen = [];
  const switched = [];
  return {
    seen,
    switched,
    ui: {
      async select(title, options) { seen.push(...options); return answer(options); },
      async input() { throw new Error('input should not be reached'); },
      notify(message) { seen.push(String(message)); },
      setStatus() {},
    },
    modelRegistry: {
      find(provider, id) { return models.find((m) => m.provider === provider && m.id === id); },
    },
    async setModel(model) { switched.push(model); return setModelResult; },
  };
}

function withHome(home, fn) {
  const previous = process.env.OPENTEST_HOME;
  process.env.OPENTEST_HOME = home;
  return Promise.resolve(fn()).finally(() => {
    if (previous === undefined) delete process.env.OPENTEST_HOME;
    else process.env.OPENTEST_HOME = previous;
  });
}

const ALPHA = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: SECRET };
const BETA = { provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-r1:free', apiKey: 'sk-or-v1-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d' };
const REGISTRY = [
  { provider: 'opentest-alpha', id: 'deepseek-chat' },
  { provider: 'opentest-beta', id: 'deepseek/deepseek-r1:free' },
];

test('switching models changes the live session instead of only the config', async () => {
  const { switchModel } = require('./extension');
  const home = projectHome();
  seedProfiles(home, { alpha: ALPHA, beta: BETA }, 'alpha');

  await withHome(home, async () => {
    const ctx = recordingCtx(() => undefined, { models: REGISTRY });
    await switchModel(ctx, 'beta');
    // The running session is switched, not merely told to restart.
    assert.equal(ctx.switched.length, 1);
    assert.equal(ctx.switched[0].provider, 'opentest-beta');
    assert.equal(ctx.switched[0].id, 'deepseek/deepseek-r1:free');
    assert.equal(ctx.seen.some((line) => line.includes('重新运行')), false, 'no restart should be demanded');
    // And it is still persisted so the next launch starts there.
    const saved = JSON.parse(fs.readFileSync(path.join(home, '.opentest', 'config.json'), 'utf8'));
    assert.equal(saved.active_profile, 'beta');
    assert.equal(saved.profiles.alpha.apiKey, SECRET, 'switching must not rewrite stored keys');
  });
});

test('the extension does not shadow the built-in /model command', async () => {
  const extension = require('./extension');
  const commands = [];
  await extension({
    registerTool() {},
    registerCommand(name) { commands.push(name); },
    registerShortcut() {},
    on() {},
  });
  // Pi ships its own /model and filters same-named extension commands out of
  // autocomplete; registering ours would be dead code plus a conflict warning.
  assert.equal(commands.includes('model'), false);
  assert.equal(commands.includes('task-model'), true);
});

test('switching offers every profile with the active one marked', async () => {
  const { switchModel } = require('./extension');
  const home = projectHome();
  seedProfiles(home, { alpha: ALPHA, beta: BETA }, 'alpha');

  await withHome(home, async () => {
    const ctx = recordingCtx(() => undefined, { models: REGISTRY });
    await switchModel(ctx, '');
    assert.equal(ctx.seen.length, 2);
    assert.equal(ctx.seen.some((line) => line.includes('alpha') && line.includes('✅')), true);
    assert.equal(ctx.seen.some((line) => line.includes('beta') && line.includes('✅')), false);
  });
});

test('switching never renders a raw API key, only a mask', async () => {
  const { switchModel } = require('./extension');
  const home = projectHome();
  seedProfiles(home, { alpha: ALPHA }, 'alpha');

  await withHome(home, async () => {
    const ctx = recordingCtx(() => undefined, { models: REGISTRY });
    await switchModel(ctx, '');
    const rendered = ctx.seen.join('\n');
    assert.equal(rendered.includes(SECRET), false, 'raw key must never reach the screen');
    assert.equal(rendered.includes('sk-3d9…0a2d'), true, 'the mask should be shown instead');
  });
});

test('a profile pi has not registered asks for one restart, not a silent failure', async () => {
  const { switchModel } = require('./extension');
  const home = projectHome();
  seedProfiles(home, { alpha: ALPHA, beta: BETA }, 'alpha');

  await withHome(home, async () => {
    // Registry knows only alpha — beta was added after this session started.
    const ctx = recordingCtx(() => undefined, { models: [REGISTRY[0]] });
    await switchModel(ctx, 'beta');
    assert.equal(ctx.switched.length, 0);
    assert.equal(ctx.seen.some((line) => line.includes('重启')), true);
  });
});

test('a profile whose key pi rejects is reported as unusable', async () => {
  const { switchModel } = require('./extension');
  const home = projectHome();
  seedProfiles(home, { alpha: ALPHA, beta: BETA }, 'alpha');

  await withHome(home, async () => {
    const ctx = recordingCtx(() => undefined, { models: REGISTRY, setModelResult: false });
    await switchModel(ctx, 'beta');
    assert.equal(ctx.seen.some((line) => line.includes('key 不可用')), true);
  });
});

test('switching points the user at the wizard when nothing is configured', async () => {
  const { switchModel } = require('./extension');
  await withHome(projectHome(), async () => {
    const ctx = recordingCtx(() => undefined, { models: REGISTRY });
    await switchModel(ctx, '');
    assert.equal(ctx.seen.some((line) => line.includes('open-test config')), true);
  });
});

test('switching rejects an unknown profile instead of writing it', async () => {
  const { switchModel } = require('./extension');
  const home = projectHome();
  seedProfiles(home, { alpha: ALPHA }, 'alpha');

  await withHome(home, async () => {
    const before = fs.readFileSync(path.join(home, '.opentest', 'config.json'), 'utf8');
    const ctx = recordingCtx(() => undefined, { models: REGISTRY });
    await switchModel(ctx, 'does-not-exist');
    assert.equal(fs.readFileSync(path.join(home, '.opentest', 'config.json'), 'utf8'), before);
    assert.equal(ctx.seen.some((line) => line.includes('❌')), true);
  });
});

test('a mapped task switches the model before the step runs', async () => {
  const { applyTaskModel } = require('./extension');
  const { writeTaskModel } = require('../llm/config-store');
  const home = projectHome();
  seedProfiles(home, { alpha: ALPHA, beta: BETA }, 'alpha');

  await withHome(home, async () => {
    writeTaskModel({ cwd: home, homeDir: home, scope: 'user', task: 'bugAnalysis', profileName: 'beta' });
    const ctx = recordingCtx(() => undefined, { models: REGISTRY });
    // /defects is bug analysis -> should land on beta.
    await applyTaskModel(ctx, 'defects');
    assert.equal(ctx.switched.length, 1);
    assert.equal(ctx.switched[0].provider, 'opentest-beta');
  });
});

test('an unmapped task leaves the model alone and says nothing', async () => {
  const { applyTaskModel } = require('./extension');
  const home = projectHome();
  seedProfiles(home, { alpha: ALPHA, beta: BETA }, 'alpha');

  await withHome(home, async () => {
    const ctx = recordingCtx(() => undefined, { models: REGISTRY });
    await applyTaskModel(ctx, 'cases');
    assert.equal(ctx.switched.length, 0, 'no mapping means no switch');
    assert.equal(ctx.seen.length, 0, 'and no announcement either');
  });
});

test('/task-model persists a routing choice', async () => {
  const { taskModel } = require('./extension');
  const { readTaskModels } = require('../llm/config-store');
  const home = projectHome();
  seedProfiles(home, { alpha: ALPHA, beta: BETA }, 'alpha');

  await withHome(home, async () => {
    const ctx = recordingCtx(() => undefined, { models: REGISTRY });
    await taskModel(ctx, '需求分析 beta');
    assert.deepEqual(readTaskModels({ cwd: home, homeDir: home }), { requirementAnalysis: 'beta' });
  });
});

test('model switches are recorded so a report can cite which model ran', () => {
  const { recordModelChange, modelHistorySnapshot } = require('./extension');
  recordModelChange({ type: 'model_select', model: { provider: 'opentest-alpha', id: 'm1' }, source: 'set' });
  recordModelChange({ type: 'model_select', model: { provider: 'opentest-beta', id: 'm2' }, previousModel: { provider: 'opentest-alpha', id: 'm1' }, source: 'set' });
  const history = modelHistorySnapshot();
  const last = history[history.length - 1];
  assert.equal(last.label, 'opentest-beta/m2');
  assert.equal(last.previous, 'opentest-alpha/m1');
});

test('no profile label the agent can read contains a raw key', () => {
  const { formatProfileChoice } = require('../llm/config-store');
  const label = formatProfileChoice({
    name: 'alpha',
    provider: 'deepseek',
    model: 'deepseek-chat',
    maskedKey: 'sk-3d9…0a2d',
    usable: true,
  }, true);
  assert.equal(label.includes(SECRET), false);
  assert.match(label, /deepseek-chat/);
  assert.match(label, /✅/);
  assert.match(formatProfileChoice({ name: 'x', provider: 'p', model: '', maskedKey: '(empty)', usable: false }), /key 不可用/);
});
