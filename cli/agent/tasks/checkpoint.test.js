'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { updateCheckpoint, renderBar } = require('./checkpoint');
const { noteDocumentRead, progressLines, resetReadProgress } = require('./progress');

test('completed task steps stay done when the same plan is registered again', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-task-'));
  updateCheckpoint(workspace, {
    product: '筑安通',
    sourceFile: '/tmp/req.md',
    action: 'plan',
    task: 'analysis',
    steps: '项目巡检\n作业管理',
  });
  updateCheckpoint(workspace, { action: 'complete', task: 'analysis', step: '项目巡检', workspace });
  updateCheckpoint(workspace, {
    workspace,
    action: 'fail',
    task: 'analysis',
    step: '作业管理',
    note: '图谱 JSON 被截断',
  });
  const again = updateCheckpoint(workspace, {
    workspace,
    action: 'plan',
    task: 'analysis',
    steps: ['项目巡检', '作业管理', '实名制'],
  });
  assert.match(again.text, /下一步 作业管理/);
  assert.match(again.text, /已完成 1 步/);
  const saved = JSON.parse(fs.readFileSync(path.join(workspace, 'tasks', 'checkpoint.json'), 'utf8'));
  assert.equal(saved.tasks.analysis.steps.find((step) => step.id === '项目巡检').status, 'done');
  assert.equal(saved.tasks['test-points'].status, 'pending');
  updateCheckpoint(workspace, { workspace, action: 'complete', task: 'analysis', step: '作业管理' });
  const resumed = JSON.parse(fs.readFileSync(path.join(workspace, 'tasks', 'checkpoint.json'), 'utf8'));
  assert.equal(resumed.tasks.analysis.steps.find((step) => step.id === '作业管理').status, 'done');
  assert.equal(resumed.tasks.analysis.steps.find((step) => step.id === '实名制').status, 'pending');
  assert.match(again.text, /1\/3/);
  assert.match(again.text, /█/);
});

test('progress bar counts finished steps and chapters already read', () => {
  const line = renderBar('需求分析', 1, 4, {
    next: '作业管理',
    startedAt: '2026-09-30T00:00:00.000Z',
    now: Date.parse('2026-09-30T00:00:12.000Z'),
  });
  assert.match(line, /25%/);
  assert.match(line, /1\/4/);
  assert.match(line, /\[00:12<00:36\]/);
  assert.match(line, /作业管理/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-read-'));
  const file = path.join(dir, '需求.md');
  fs.writeFileSync(file, '# 甲\n\n正文\n\n# 乙\n\n正文\n');
  resetReadProgress();
  const first = noteDocumentRead(file, { offset: 1, limit: 3 });
  assert.equal(first.done, 1);
  assert.equal(first.total, 2);
  const second = noteDocumentRead(file, { offset: 5, limit: 3 });
  assert.equal(second.done, 2);
  const lines = progressLines(null, second);
  assert.match(lines[0], /读取需求/);
  assert.match(lines[0], /2\/2/);
});
