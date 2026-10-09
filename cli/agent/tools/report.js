'use strict';

const fs = require('fs');
const path = require('path');

function readTree(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

function readLatestRun(workspace) {
  const dir = path.join(workspace, 'reports', 'runs');
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  for (let index = names.length - 1; index >= 0; index -= 1) {
    try {
      const run = JSON.parse(fs.readFileSync(path.join(dir, names[index]), 'utf8'));
      // A run still in progress has no result to report.
      if (run && run.status === 'done' && run.summary) return run;
    } catch {
      // A damaged record is skipped; the next older one may be fine.
    }
  }
  return null;
}

function readDefectList(workspace) {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(workspace, 'defects', 'latest.json'), 'utf8'));
    return Array.isArray(saved.bugs) ? saved : null;
  } catch {
    return null;
  }
}

function buildReport(workspace) {
  const cases = readTree(path.join(workspace, 'cases'));
  const defects = readTree(path.join(workspace, 'defects'));
  const caseText = cases.map((file) => file.text).join('\n');
  // A case heading is `## TC-1` or `### TC001 title`; other headings group cases.
  const caseCount = (caseText.match(/^#{2,3}\s+[A-Za-z]+[-_]?\d+/gm) || []).length;
  const automated = (caseText.match(/^-\s*自动化[:：]\s*是\s*$/gm) || []).length;
  const run = readLatestRun(workspace);
  const defectList = readDefectList(workspace);
  const lines = [
    '# 测试简报',
    '',
    `用例文件 ${cases.length} 个，用例标题 ${caseCount} 条。`,
  ];
  if (caseCount) lines.push(`已自动化 ${automated} 条，手工 ${caseCount - automated} 条。`);

  lines.push('');
  if (run) {
    const { passed, failed, skipped, errors } = run.summary;
    lines.push(
      `最近一次执行（${run.id}）：通过 ${passed}，失败 ${failed}，跳过 ${skipped}，无法执行 ${errors}。`,
    );
    if (passed + failed > 0) {
      lines.push(`通过率 ${Math.round((passed / (passed + failed)) * 100)}%，只按通过和失败计算，不含跳过和无法执行的脚本。`);
    }
    const broken = (run.scripts || []).filter((script) => script.status === 'failed' || script.status === 'error');
    if (broken.length) {
      lines.push('', '未通过的脚本：');
      broken.forEach((script) => lines.push(`- ${script.file}（${script.status === 'error' ? '无法执行' : '失败'}）`));
    }
  } else {
    lines.push('还没有执行记录，所以没有通过率。');
  }

  lines.push('');
  if (defectList) {
    const byStatus = {};
    defectList.bugs.forEach((bug) => { byStatus[bug.status || '未知'] = (byStatus[bug.status || '未知'] || 0) + 1; });
    const detail = Object.entries(byStatus).map(([status, count]) => `${status} ${count}`).join('，');
    lines.push(`缺陷 ${defectList.bugs.length} 条（读取于 ${defectList.fetchedAt}）${detail ? `：${detail}` : ''}。`);
  } else {
    lines.push(`缺陷记录 ${defects.length} 个文件，没有读取过禅道或 Jira。`);
  }
  lines.push('', '数字只来自该产品工作目录里的文件。', '');
  if (!cases.length) lines.push('还没有用例文件。');
  return {
    text: `${lines.join('\n')}\n`,
    caseCount,
    automated,
    defectFiles: defects.length,
    defectCount: defectList ? defectList.bugs.length : null,
    run: run ? { id: run.id, ...run.summary } : null,
  };
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
