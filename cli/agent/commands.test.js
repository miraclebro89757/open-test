'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { setProject, readProject } = require('./project');
const { confirmPoints, prepareStep } = require('./commands');

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
