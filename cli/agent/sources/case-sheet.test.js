'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CASE_SHEET_COLUMNS,
  encodeCaseRow,
  inferWorkspaceVersion,
  parseCaseRecord,
  readCaseSheetBinding,
  rowHash,
  syncCaseSheet,
} = require('./case-sheet');

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sheet-'));
}

function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function memoryExcel(seed = {}) {
  const docs = { ...seed };
  return {
    docs,
    async createWorkspaceSheet({ name }) {
      const nodeId = 'personal-root';
      docs[nodeId] = {
        title: name,
        url: `https://alidocs.dingtalk.com/i/nodes/${nodeId}`,
        sheets: { s1: { id: 's1', name: 'Sheet1', rows: [] } },
      };
      return { nodeId, url: docs[nodeId].url, title: name };
    },
    async listSheets(nodeId) {
      return Object.values(docs[nodeId].sheets).map((sheet) => ({ id: sheet.id, name: sheet.name }));
    },
    async ensureSheet(nodeId, name) {
      const existing = Object.values(docs[nodeId].sheets).find((sheet) => sheet.name === name);
      if (existing) return { id: existing.id, name: existing.name };
      const id = `s${Object.keys(docs[nodeId].sheets).length + 1}`;
      docs[nodeId].sheets[id] = { id, name, rows: [] };
      return { id, name };
    },
    async readTable(nodeId, sheetId) {
      const sheet = docs[nodeId].sheets[sheetId];
      const rows = sheet.rows || [];
      return { columns: rows[0] || [], rows: rows.slice(1) };
    },
    async writeTable(nodeId, sheetId, { columns, rows, name }) {
      const sheet = docs[nodeId].sheets[sheetId];
      sheet.name = name || sheet.name;
      sheet.rows = [columns, ...rows];
    },
    async createFilter() {},
  };
}

const SAMPLE = `### TC001 打开巡检
- 优先级：高
- 自动化：否
- 对应测试点：TP001
- 前置条件：已登录
- 步骤：
  1. 打开项目
  2. 查看菜单
- 期望结果：看到巡检管理
- 状态：待确认
`;

test('parses numbered steps as one cell and stamps the requirement version', () => {
  const record = parseCaseRecord(SAMPLE, { id: 'TC001', title: '打开巡检' }, { version: 'V1.1.3', module: '巡检' });
  assert.equal(record['需求版本'], 'V1.1.3');
  assert.equal(record['模块'], '巡检');
  assert.equal(record['状态'], '正常');
  assert.equal(record['执行结果'], '未执行');
  assert.match(record['步骤'], /打开项目/);
  assert.match(record['步骤'], /查看菜单/);
  const row = encodeCaseRow(record);
  assert.equal(row.length, CASE_SHEET_COLUMNS.length);
  assert.equal(row[0], 'TC001');
  assert.equal(row[CASE_SHEET_COLUMNS.indexOf('需求版本')], 'V1.1.3');
  assert.equal(row[CASE_SHEET_COLUMNS.indexOf('模块')], '巡检');
});

test('sheet status is 正常 or 废弃, and 待确认 stays a review mark locally', () => {
  const normal = parseCaseRecord(SAMPLE, { id: 'TC001', title: '打开巡检' }, 'V1.1.3');
  assert.equal(normal['状态'], '正常');
  const dropped = parseCaseRecord('### TC001 x\n- 状态：废弃\n', { id: 'TC001', title: 'x' }, 'V1.1.3');
  assert.equal(dropped['状态'], '废弃');
});

test('infers V1.1.3 from the graph source file when the case has no version field', () => {
  const root = workspace();
  write(root, 'graph/graph.json', JSON.stringify({
    sourceFile: '/Users/me/筑安通V1.1.3需求文档.md',
    features: [],
  }));
  assert.equal(inferWorkspaceVersion(root), 'V1.1.3');
});

test('infers V1.1.3 from a requirement filename in the workspace root', () => {
  const root = workspace();
  write(root, '筑安通V1.1.3需求文档.md', '# 需求\n');
  assert.equal(inferWorkspaceVersion(root), 'V1.1.3');
});

test('version-pack target wins over the graph filename', () => {
  const root = workspace();
  write(root, 'graph/graph.json', JSON.stringify({ sourceFile: '旧版V1.0.0.md' }));
  write(root, 'knowledge/version-pack.json', JSON.stringify({
    delta: { version: '1.2.0' },
    baseline: { version: '1.0.0' },
  }));
  assert.equal(inferWorkspaceVersion(root), 'V1.2.0');
});

test('push creates a personal-space sheet and writes cases without rewriting local markdown', async () => {
  const root = workspace();
  write(root, 'graph/graph.json', JSON.stringify({ sourceFile: '筑安通V1.1.3需求文档.md' }));
  write(root, 'cases/巡检.md', SAMPLE);
  const excel = memoryExcel();
  const result = await syncCaseSheet({ workspace: root, product: '易训', action: 'push', excel });
  assert.equal(result.action, 'push');
  assert.equal(result.written, 1);
  assert.match(result.url, /personal-root/);
  const binding = readCaseSheetBinding(root);
  assert.equal(binding.nodeId, 'personal-root');
  assert.ok(binding.hashes.TC001);
  const table = await excel.readTable('personal-root', binding.sheetId);
  assert.deepEqual(table.columns, CASE_SHEET_COLUMNS);
  assert.equal(table.rows[0][0], 'TC001');
  assert.equal(table.rows[0][CASE_SHEET_COLUMNS.indexOf('模块')], '巡检');
  assert.equal(table.rows[0][CASE_SHEET_COLUMNS.indexOf('需求版本')], 'V1.1.3');
  assert.equal(table.rows[0][CASE_SHEET_COLUMNS.indexOf('状态')], '正常');
  assert.equal(table.rows[0][CASE_SHEET_COLUMNS.indexOf('执行结果')], '未执行');
  const local = fs.readFileSync(path.join(root, 'cases/巡检.md'), 'utf8');
  assert.equal(local.includes('需求版本'), false);
  assert.match(local, /状态：待确认/);
});

test('pull writes a sheet edit back and drafts a pending 适用：用例 lesson', async () => {
  const root = workspace();
  write(root, 'graph/graph.json', JSON.stringify({ sourceFile: '筑安通V1.1.3需求文档.md' }));
  write(root, 'cases/巡检.md', SAMPLE);
  const excel = memoryExcel();
  await syncCaseSheet({ workspace: root, product: '易训', action: 'push', excel });
  const binding = readCaseSheetBinding(root);
  const table = await excel.readTable(binding.nodeId, binding.sheetId);
  table.rows[0][CASE_SHEET_COLUMNS.indexOf('步骤')] = '1. 打开项目\n2. 以截图为准核对菜单';
  await excel.writeTable(binding.nodeId, binding.sheetId, { columns: table.columns, rows: table.rows });
  const pulled = await syncCaseSheet({ workspace: root, product: '易训', action: 'pull', excel });
  assert.equal(pulled.updated, 1);
  assert.equal(pulled.lessons, 1);
  const markdown = fs.readFileSync(path.join(root, 'cases/巡检.md'), 'utf8');
  assert.match(markdown, /以截图为准/);
  assert.match(markdown, /状态：待确认/);
  const lessons = fs.readFileSync(path.join(root, 'knowledge/审核经验.md'), 'utf8');
  assert.match(lessons, /状态：待确认/);
  assert.match(lessons, /适用：用例/);
  assert.match(lessons, /范围：全部产品/);
  assert.equal(lessons.includes('状态：已启用'), false);
});

test('when local and sheet both changed, pull writes 待澄清 and does not merge', async () => {
  const root = workspace();
  write(root, 'graph/graph.json', JSON.stringify({ sourceFile: '筑安通V1.1.3需求文档.md' }));
  write(root, 'cases/巡检.md', SAMPLE);
  const excel = memoryExcel();
  await syncCaseSheet({ workspace: root, product: '易训', action: 'push', excel });
  const binding = readCaseSheetBinding(root);
  const table = await excel.readTable(binding.nodeId, binding.sheetId);
  table.rows[0][CASE_SHEET_COLUMNS.indexOf('前置条件')] = '改了前置';
  await excel.writeTable(binding.nodeId, binding.sheetId, { columns: table.columns, rows: table.rows });
  write(root, 'cases/巡检.md', SAMPLE.replace('已登录', '本地也改了'));
  const pulled = await syncCaseSheet({ workspace: root, product: '易训', action: 'pull', excel });
  assert.equal(pulled.conflicts, 1);
  assert.equal(pulled.updated, 0);
  const markdown = fs.readFileSync(path.join(root, 'cases/巡检.md'), 'utf8');
  assert.match(markdown, /本地也改了/);
  assert.equal(markdown.includes('改了前置'), false);
  const review = fs.readFileSync(path.join(root, 'knowledge/需求评审.md'), 'utf8');
  assert.match(review, /表格与本地同时改了 TC001/);
});

test('a row removed from the sheet does not delete the local case', async () => {
  const root = workspace();
  write(root, 'graph/graph.json', JSON.stringify({ sourceFile: '筑安通V1.1.3需求文档.md' }));
  write(root, 'cases/巡检.md', SAMPLE);
  const excel = memoryExcel();
  await syncCaseSheet({ workspace: root, product: '易训', action: 'push', excel });
  const binding = readCaseSheetBinding(root);
  await excel.writeTable(binding.nodeId, binding.sheetId, { columns: CASE_SHEET_COLUMNS, rows: [] });
  const pulled = await syncCaseSheet({ workspace: root, product: '易训', action: 'pull', excel });
  assert.equal(pulled.missing, 1);
  assert.equal(fs.existsSync(path.join(root, 'cases/巡检.md')), true);
  assert.match(fs.readFileSync(path.join(root, 'knowledge/需求评审.md'), 'utf8'), /表格里没有了 TC001/);
});

test('row hashes stay stable for the same content', () => {
  const record = parseCaseRecord(SAMPLE, { id: 'TC001', title: '打开巡检' }, 'V1.1.3');
  assert.equal(rowHash(record), rowHash({ ...record }));
});

test('push writes 模块 from the case file and 执行结果 from the latest run', async () => {
  const root = workspace();
  write(root, 'graph/graph.json', JSON.stringify({ sourceFile: '筑安通V1.1.3需求文档.md' }));
  write(root, 'cases/项目巡检状态总览.md', SAMPLE);
  write(root, 'reports/runs/20261013-120000.json', JSON.stringify({
    id: '20261013-120000',
    status: 'done',
    scripts: [{ file: 'automation/a.spec.ts', status: 'passed', caseIds: ['TC001'] }],
  }));
  const excel = memoryExcel();
  await syncCaseSheet({ workspace: root, product: '易训', action: 'push', excel });
  const binding = readCaseSheetBinding(root);
  const table = await excel.readTable(binding.nodeId, binding.sheetId);
  assert.equal(table.rows[0][CASE_SHEET_COLUMNS.indexOf('模块')], '项目巡检状态总览');
  assert.equal(table.rows[0][CASE_SHEET_COLUMNS.indexOf('执行结果')], '通过');
});

test('pull 废弃 writes local status 废弃 and keeps 待确认 when sheet stays 正常', async () => {
  const root = workspace();
  write(root, 'graph/graph.json', JSON.stringify({ sourceFile: '筑安通V1.1.3需求文档.md' }));
  write(root, 'cases/巡检.md', SAMPLE);
  const excel = memoryExcel();
  await syncCaseSheet({ workspace: root, product: '易训', action: 'push', excel });
  const binding = readCaseSheetBinding(root);
  const table = await excel.readTable(binding.nodeId, binding.sheetId);
  table.rows[0][CASE_SHEET_COLUMNS.indexOf('状态')] = '废弃';
  await excel.writeTable(binding.nodeId, binding.sheetId, { columns: table.columns, rows: table.rows });
  const pulled = await syncCaseSheet({ workspace: root, product: '易训', action: 'pull', excel });
  assert.equal(pulled.updated, 1);
  const after = fs.readFileSync(path.join(root, 'cases/巡检.md'), 'utf8');
  assert.match(after, /状态：废弃/);
  assert.equal(after.includes('执行结果'), false);
});
