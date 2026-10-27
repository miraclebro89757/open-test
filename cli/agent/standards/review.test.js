'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewStepStandards, assertStepStandards } = require('./review');

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-standard-'));
}

function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('a pending case that joins two checks cannot be completed', () => {
  const root = workspace();
  write(root, 'cases/班组信息.md', `# 功能用例-班组信息

### TC001 作业班组新建与重名校验
- 优先级：高
- 自动化：否
- 状态：待确认
- 对应测试点：TP001
- 前置条件：已登录
- 步骤：1 新建班组；2 再新建同名班组
- 期望结果：创建成功；重名时提示
`);
  const issues = reviewStepStandards(root, 'cases', '班组信息');
  assert.ok(issues.some((item) => item.includes('TC001') && item.includes('与')));
  assert.ok(issues.some((item) => item.includes('步骤')));
  assert.throws(() => assertStepStandards(root, 'cases', '班组信息'), /Do not start the next step/);
});

test('a pending case that follows the template can be completed', () => {
  const root = workspace();
  write(root, 'cases/班组信息.md', `# 功能用例-班组信息

来源：test-points/班组信息.md（TP001）

### TC001 新建作业班组
- 优先级：高
- 自动化：否
- 录制：需要
- 状态：待确认
- 对应测试点：TP001
- 前置条件：已登录
- 步骤：
  1. 新建一个作业班组
- 期望结果：作业班组创建成功
`);
  assert.deepEqual(reviewStepStandards(root, 'cases', '班组信息'), []);
  assert.doesNotThrow(() => assertStepStandards(root, 'cases', '班组信息'));
});

test('a pending case must say whether it needs a Playwright recording', () => {
  const root = workspace();
  write(root, 'cases/班组信息.md', `# 功能用例-班组信息

### TC001 新建作业班组
- 优先级：高
- 自动化：否
- 状态：待确认
- 对应测试点：TP001
- 前置条件：已登录
- 步骤：
  1. 新建一个作业班组
- 期望结果：作业班组创建成功
`);
  const issues = reviewStepStandards(root, 'cases', '班组信息');
  assert.ok(issues.some((item) => item.includes('录制要写成需要或不需要')));
});

test('an old case without a status line is not rewritten for this review', () => {
  const root = workspace();
  write(root, 'cases/项目巡检状态总览.md', `# 功能用例-项目巡检状态总览

### TC001 作业班组新建与重名校验
- 优先级：高
- 自动化：否
- 对应测试点：TP001
- 前置条件：已登录
- 步骤：1 新建；2 重名
- 期望结果：创建成功
`);
  assert.deepEqual(reviewStepStandards(root, 'cases', '项目巡检状态总览'), []);
});

test('a pending test point must state one behavior and a priority', () => {
  const root = workspace();
  write(root, 'test-points/角色权限.md', `# 角色权限

### TP001 新增内部角色默认无权限与长度限制
- 状态：待确认
`);
  const issues = reviewStepStandards(root, 'test-points', '角色权限');
  assert.ok(issues.some((item) => item.includes('TP001') && item.includes('优先级')));
  assert.ok(issues.some((item) => item.includes('与') || item.includes('一件')));
});

test('a confirmed test point is left as it is', () => {
  const root = workspace();
  write(root, 'test-points/角色权限.md', `### TP001 新增内部角色默认无权限与长度限制
- 优先级：高
- 状态：已确认
`);
  assert.deepEqual(reviewStepStandards(root, 'test-points', '角色权限'), []);
});

test('completing a step without its file is not allowed', () => {
  const root = workspace();
  const issues = reviewStepStandards(root, 'cases', '班组信息');
  assert.ok(issues.some((item) => item.includes('cases/班组信息.md')));
});

test('the checkpoint tool rejects a draft that fails the standard', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-standard-tool-'));
  const product = path.join(root, '易训');
  write(product, 'cases/班组信息.md', `# 功能用例-班组信息

### TC001 作业班组新建与重名校验
- 优先级：高
- 自动化：否
- 状态：待确认
- 对应测试点：TP001
- 前置条件：已登录
- 步骤：1 新建班组；2 再新建同名班组
- 期望结果：创建成功
`);
  const extension = require('../extension');
  let checkpoint;
  await extension({
    registerTool(tool) { if (tool.name === 'task_checkpoint') checkpoint = tool; },
    registerCommand() {},
    registerShortcut() {},
    on() {},
  });
  await assert.rejects(
    () => checkpoint.execute('1', {
      requirementDir: root,
      productName: '易训',
      action: 'complete',
      task: 'cases',
      step: '班组信息',
    }, null, null, { hasUI: false }),
    /Do not start the next step/,
  );
  assert.equal(fs.existsSync(path.join(product, 'tasks', 'checkpoint.json')), false);
});

test('prompts tell the agent to fix standard issues before the next step', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const skill = fs.readFileSync(path.join(root, '.pi/skills/opentest-qa/SKILL.md'), 'utf8');
  const prompt = fs.readFileSync(path.join(root, 'cli/agent/system-prompt.md'), 'utf8');
  const web = fs.readFileSync(path.join(root, 'lib/qa/web-session.ts'), 'utf8');
  for (const text of [skill, prompt, web]) {
    assert.match(text, /待确认/);
    assert.match(text, /不要带着问题开始下一步/);
  }
});
