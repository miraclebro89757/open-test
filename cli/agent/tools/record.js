'use strict';

const fs = require('fs');
const path = require('path');
const { playwrightInvoke } = require('./playwright-cli');

function parseCases(markdown) {
  const matches = [...String(markdown || '').matchAll(/^###\s+(\S+)\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index;
    const headingEnd = start + match[0].length;
    const end = matches[index + 1] ? matches[index + 1].index : markdown.length;
    return {
      id: match[1],
      title: match[2].trim(),
      start,
      headingEnd,
      end,
      body: markdown.slice(headingEnd, end),
    };
  });
}

function quotedPhrases(text) {
  return [...String(text || '').matchAll(/[【「]([^【】「」]{2,40})[】」]/g)].map((match) => match[1]);
}

function recordingPhrases(spec) {
  const patterns = [
    /name:\s*['"]([^'"]+)['"]/g,
    /getBy(?:Text|Placeholder|Label|Title)\(\s*['"]([^'"]+)['"]/g,
  ];
  const found = [];
  patterns.forEach((pattern) => {
    [...String(spec || '').matchAll(pattern)].forEach((match) => {
      const text = match[1].trim();
      if (text.length >= 2) found.push(text);
    });
  });
  return [...new Set(found)];
}

function scoreCase(item, phrases) {
  const haystack = `${item.title}\n${item.body}`;
  return phrases.filter((phrase) => haystack.includes(phrase)).length;
}

function matchRecording(cases, phrases, caseId) {
  if (caseId) {
    const chosen = cases.find((item) => item.id === caseId);
    if (!chosen) return { matches: [], message: `没有找到用例 ${caseId}` };
    return { matches: [chosen], message: `${chosen.id} 按指定用例对照。` };
  }
  const ranked = cases
    .map((item) => ({ item, score: scoreCase(item, phrases) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  if (!ranked.length) return { matches: [], message: '录制内容没有对上任何功能用例。' };
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    return { matches: [], message: '多个用例文案相同，请指定用例编号再录一次。' };
  }
  return { matches: [ranked[0].item], message: `${ranked[0].item.id} 已对照到录制。` };
}

function upsertField(body, name, value) {
  const pattern = new RegExp(`^- ${name}：.*$`, 'm');
  if (pattern.test(body)) return body.replace(pattern, `- ${name}：${value}`);
  const newline = body.startsWith('\n') ? '\n' : '\n\n';
  const rest = body.startsWith('\n') ? body.slice(1) : body;
  return `${newline}- ${name}：${value}\n${rest}`;
}

function applyAutomationTags(markdown, { matchedIds, specPath }) {
  const cases = parseCases(markdown);
  if (!cases.length) return markdown;
  let cursor = 0;
  let output = '';
  cases.forEach((item) => {
    output += markdown.slice(cursor, item.headingEnd);
    const matched = matchedIds.has(item.id);
    const hasTag = /^- 自动化：/m.test(item.body);
    let body = item.body;
    if (matched) {
      body = upsertField(body, '自动化', '是');
      body = upsertField(body, '脚本', specPath);
    } else if (!hasTag) {
      body = upsertField(body, '自动化', '否');
    }
    output += body;
    cursor = item.end;
  });
  output += markdown.slice(cursor);
  return output;
}

function assertSandboxUrl(sandboxUrl) {
  let url;
  try {
    url = new URL(sandboxUrl);
  } catch {
    throw new Error('沙箱地址必须是 http 或 https');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('沙箱地址必须是 http 或 https');
  }
  return url.href;
}

async function recordScenario({
  workspace,
  sandboxUrl,
  caseId,
  confirm,
  execFile,
  now = () => Date.now(),
}) {
  const url = assertSandboxUrl(sandboxUrl);
  const allowed = await confirm(`沙箱 ${url}\n请按功能用例操作。关闭录制窗口后，会把脚本对上用例并标记是否自动化。`);
  if (!allowed) return { recorded: false, matches: [], message: '未打开沙箱，没有录制。' };
  const dir = path.join(workspace, 'automation');
  await fs.promises.mkdir(dir, { recursive: true });
  const specName = `${caseId || 'record'}-${now()}.spec.ts`;
  const specFile = path.join(dir, specName);
  const command = playwrightInvoke(['codegen', '--target', 'javascript', '-o', specFile, url]);
  await execFile(command.file, command.args, {
    cwd: workspace,
    timeout: 15 * 60 * 1000,
  });
  const spec = await fs.promises.readFile(specFile, 'utf8');
  const phrases = recordingPhrases(spec);
  const casesDir = path.join(workspace, 'cases');
  const files = fs.existsSync(casesDir)
    ? (await fs.promises.readdir(casesDir)).filter((name) => name.endsWith('.md'))
    : [];
  const matches = [];
  let note = '没有功能用例文件。';
  for (const name of files) {
    const file = path.join(casesDir, name);
    const markdown = await fs.promises.readFile(file, 'utf8');
    const found = matchRecording(parseCases(markdown), phrases, caseId);
    note = found.message;
    const matchedIds = new Set(found.matches.map((item) => item.id));
    const relativeSpec = path.posix.join('automation', specName);
    await fs.promises.writeFile(file, applyAutomationTags(markdown, { matchedIds, specPath: relativeSpec }));
    found.matches.forEach((item) => matches.push({ id: item.id, file: name, spec: relativeSpec }));
  }
  const listed = matches.length ? matches.map((item) => `${item.id} 自动化：是`).join('，') : '没有用例被标为自动化';
  return {
    recorded: true,
    specFile,
    matches,
    message: `录制已保存到 ${specFile}。${note}${listed}`,
  };
}

module.exports = {
  parseCases,
  recordingPhrases,
  matchRecording,
  applyAutomationTags,
  recordScenario,
};
