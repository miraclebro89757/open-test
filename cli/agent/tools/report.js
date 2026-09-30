'use strict';

const fs = require('fs');
const path = require('path');

function readTree(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

function buildReport(workspace) {
  const cases = readTree(path.join(workspace, 'cases'));
  const defects = readTree(path.join(workspace, 'defects'));
  const caseCount = (cases.map((file) => file.text).join('\n').match(/^##\s+/gm) || []).length;
  const lines = [
    '# 测试简报',
    '',
    `用例文件 ${cases.length} 个，用例标题 ${caseCount} 条。`,
    `缺陷记录 ${defects.length} 个。`,
    '',
    '数字只来自该产品工作目录里的文件。',
    '',
  ];
  if (!cases.length) lines.push('还没有用例文件。');
  return { text: `${lines.join('\n')}\n`, caseCount, defectFiles: defects.length };
}

async function signRelease({ workspace, summary, confirm, writeFile, username }) {
  if (!workspace) throw new Error('workspace is required');
  const text = String(summary || '').trim();
  if (!text) throw new Error('summary is required');
  const allowed = await confirm(text);
  if (!allowed) return { signed: false, message: '未签字，没有写入文件。' };
  const file = path.join(workspace, 'reports', 'signoff.md');
  const body = [
    '# 发版签字',
    '',
    `签字人: ${username || 'unknown'}`,
    `时间: ${new Date().toISOString()}`,
    '',
    text,
    '',
    `此记录只保存在 ${file}。`,
    '',
  ].join('\n');
  await writeFile(file, body);
  return { signed: true, path: file, message: `已写入 ${file}` };
}

module.exports = { buildReport, signRelease };
