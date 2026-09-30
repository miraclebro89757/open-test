'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { setProject, readProject } = require('./project');
const { confirmPoints, prepareStep } = require('./commands');
const { healSelector, keepHealVersion, pendingInProject } = require('./tools/heal');

test('project switch is remembered and a hidden directory is rejected', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-project-'));
  const saved = setProject(project, home);
  assert.equal(saved.current, project);
  assert.equal(readProject(home).current, project);
  const hidden = path.join(os.tmpdir(), '.hidden-product');
  fs.mkdirSync(hidden, { recursive: true });
  assert.throws(() => setProject(hidden, home), /可见/);
});

test('cases stay blocked until the test points are confirmed', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-points-'));
  const blocked = prepareStep({ name: 'cases', choice: '创建新任务', project });
  assert.equal(blocked.action, 'blocked');
  const viewed = prepareStep({ name: 'points', choice: '查看已有文档', project });
  assert.equal(viewed.action, 'view');
  confirmPoints(project);
  const allowed = prepareStep({ name: 'cases', choice: '创建新任务', project });
  assert.equal(allowed.action, 'create');
  assert.match(allowed.message, /自动化写成否/);
  const again = prepareStep({ name: 'points', choice: '创建新任务', project });
  assert.equal(again.action, 'create');
  assert.equal(prepareStep({ name: 'cases', choice: '创建新任务', project }).action, 'blocked');
});

test('heal keeps both versions and can restore the earlier one', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-heal-'));
  const spec = path.join(project, 'automation', 'login.spec.ts');
  fs.mkdirSync(path.dirname(spec), { recursive: true });
  fs.writeFileSync(spec, "page.locator('#old')");
  const healed = await healSelector({
    cwd: project,
    filePath: 'automation/login.spec.ts',
    oldSelector: '#old',
    newSelector: '#new',
    readFile: fs.promises.readFile,
    writeFile: fs.promises.writeFile,
    now: () => 7,
  });
  assert.equal(fs.readFileSync(spec, 'utf8'), "page.locator('#new')");
  assert.equal(fs.readFileSync(healed.before, 'utf8'), "page.locator('#old')");
  assert.equal(fs.readFileSync(healed.after, 'utf8'), "page.locator('#new')");
  const pending = pendingInProject(project);
  assert.equal(pending.length, 1);
  keepHealVersion(pending[0], 'before');
  assert.equal(fs.readFileSync(spec, 'utf8'), "page.locator('#old')");
  assert.equal(pendingInProject(project).length, 0);
});
