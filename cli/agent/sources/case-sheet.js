'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createDingTalkExcelFromConfig, nodeIdFromRef } = require('./dingtalk-excel');

const CASE_SHEET_COLUMNS = ['编号', '标题', '模块', '需求版本', '优先级', '对应测试点', '前置条件', '步骤', '期望结果', '状态', '执行结果'];
const COLUMN_ALIASES = {
  用例编号: '编号',
  案例编号: '编号',
  所属功能: '模块',
  功能: '模块',
  模块名称: '模块',
  版本: '需求版本',
  对应TP: '对应测试点',
  前置: '前置条件',
  期望: '期望结果',
};

function canonicalColumn(name) {
  const trimmed = String(name || '').trim();
  if (CASE_SHEET_COLUMNS.includes(trimmed)) return trimmed;
  return COLUMN_ALIASES[trimmed] || trimmed;
}
const REVIEW_STATUSES = new Set(['待确认', '已确认', '已接受']);
const RESULT_RANK = { 未执行: 0, 通过: 1, 跳过: 2, 失败: 3 };
const BINDING_FILE = path.join('knowledge', 'case-sheet.json');
const REVIEW_FILE = path.join('knowledge', '需求评审.md');
const LESSON_FILE = path.join('knowledge', '审核经验.md');
const IMPORT_FILE = path.join('cases', '表格导入.md');
const SHEET_TAB = '用例';
const FIELD_LINE = /^[-*]\s*([^：:\n]{1,12})[：:]\s*(.*)$/;
const GLOBAL_CONVENTION = /删除线|划掉|划线删除|以截图为准|以图为准|正文未含|附件未含|不用测试|不写测试/;
const CONVENTION_KEYWORD = [
  [/删除线/, '删除线'],
  [/划掉|划线删除/, '划掉'],
  [/截图|以图为准/, '截图'],
  [/正文未含|附件未含/, '附件'],
  [/不用测试|不写测试/, '不用测试'],
];
const LESSON_FILE_HEADER = [
  '# 审核经验',
  '',
  '测试人员在待审核里做过的决定，由系统自动记成可以复用的经验。文档写法（删除线、以截图为准、不用测试）记在全部产品；项目逻辑记在本产品。',
  'Agent 写待澄清、测试点和用例前读这份文件，只按「已启用」的经验处理。可以追加状态为「待确认」的经验，不要自己改成已启用，也不要改命中和推翻的次数。满 100 条审核记录后系统会合并这份文件。',
  '',
].join('\n');

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeVersion(value) {
  const match = String(value || '').match(/V?(\d+\.\d+(?:\.\d+)?)/i);
  return match ? `V${match[1]}` : '';
}

function versionFromText(value) {
  return normalizeVersion(value);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function compareVersions(left, right) {
  const parts = (value) => String(value).replace(/^V/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parts(left);
  const b = parts(right);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return 0;
}

function versionFromWorkspaceFiles(workspace) {
  const found = new Set();
  try {
    for (const name of fs.readdirSync(workspace)) {
      if (!/\.md$/i.test(name)) continue;
      const version = versionFromText(name);
      if (version) found.add(version);
    }
  } catch {
    // The workspace may not be readable in tests that only write graph files.
  }
  const manifest = readJson(path.join(workspace, 'knowledge', 'source-pack', 'manifest.json'));
  const fromManifest = versionFromText(manifest?.root?.title) || versionFromText(manifest?.product);
  if (fromManifest) return fromManifest;
  if (!found.size) return '';
  return [...found].sort(compareVersions).at(-1) || '';
}

function inferWorkspaceVersion(workspace) {
  const pack = readJson(path.join(workspace, 'knowledge', 'version-pack.json'));
  const fromPack = versionFromText(pack?.delta?.version) || versionFromText(pack?.baseline?.version);
  if (fromPack) return fromPack;
  const evolution = readJson(path.join(workspace, 'knowledge', 'evolution', 'current.json'));
  const fromEvolution = versionFromText(evolution?.target_version) || versionFromText(evolution?.baseline_version);
  if (fromEvolution) return fromEvolution;
  const graph = readJson(path.join(workspace, 'graph', 'graph.json'));
  const fromGraph = versionFromText(graph?.sourceFile);
  if (fromGraph) return fromGraph;
  return versionFromWorkspaceFiles(workspace);
}

function parseNamedFields(body) {
  const fields = {};
  let current = null;
  for (const line of String(body || '').replace(/^\n/, '').split('\n')) {
    const match = FIELD_LINE.exec(line);
    if (match && !/^\s/.test(line)) {
      current = match[1].trim();
      if (!(current in fields)) fields[current] = match[2];
      continue;
    }
    if (!current) continue;
    const extra = line.replace(/^\s{0,4}/, '');
    fields[current] = fields[current] ? `${fields[current]}\n${extra}` : extra;
  }
  for (const key of Object.keys(fields)) {
    fields[key] = String(fields[key] || '').replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
  }
  return fields;
}

function caseModule(relative) {
  return path.basename(String(relative || ''), '.md');
}

function caseLifecycle(status) {
  return String(status || '').trim() === '废弃' ? '废弃' : '正常';
}

function mergeLifecycle(localStatus, sheetStatus) {
  if (caseLifecycle(sheetStatus) === '废弃') return '废弃';
  if (String(localStatus || '').trim() === '废弃') return '正常';
  if (REVIEW_STATUSES.has(String(localStatus || '').trim())) return localStatus;
  return '正常';
}

function resultLabel(status) {
  if (status === 'passed') return '通过';
  if (status === 'failed' || status === 'error') return '失败';
  if (status === 'skipped') return '跳过';
  return '未执行';
}

function worseResult(left, right) {
  return (RESULT_RANK[left] || 0) >= (RESULT_RANK[right] || 0) ? left : right;
}

function latestCaseResults(workspace) {
  const dir = path.join(workspace, 'reports', 'runs');
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().reverse();
  } catch {
    return {};
  }
  const map = {};
  for (const name of names) {
    let run;
    try {
      run = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      continue;
    }
    const thisRun = {};
    for (const script of run.scripts || []) {
      const label = resultLabel(script.status);
      for (const id of script.caseIds || []) {
        if (Object.prototype.hasOwnProperty.call(map, id)) continue;
        thisRun[id] = worseResult(thisRun[id], label);
      }
    }
    Object.assign(map, thisRun);
  }
  return map;
}

function parseCaseRecord(body, item, extras) {
  const options = typeof extras === 'string' || extras == null ? { version: extras || '' } : extras;
  const fields = parseNamedFields(body);
  const version = normalizeVersion(fields['需求版本']) || options.version || '';
  return {
    编号: item.id,
    标题: item.title,
    模块: fields['模块'] || options.module || '',
    需求版本: version,
    优先级: fields['优先级'] || '',
    对应测试点: fields['对应测试点'] || '',
    前置条件: fields['前置条件'] || '',
    步骤: fields['步骤'] || '',
    期望结果: fields['期望结果'] || '',
    状态: caseLifecycle(fields['状态']),
    执行结果: options.execution || fields['执行结果'] || '未执行',
  };
}

function encodeCaseRow(record) {
  return CASE_SHEET_COLUMNS.map((name) => String(record[name] ?? '').replace(/\r\n/g, '\n'));
}

function rowHash(record) {
  return crypto.createHash('sha256').update(encodeCaseRow(record).join('\u0001')).digest('hex').slice(0, 16);
}

function parseItems(markdown) {
  const text = String(markdown || '');
  const matches = [...text.matchAll(/^###\s+(\S+)\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const headingEnd = start + match[0].length;
    const end = matches[index + 1] ? matches[index + 1].index : text.length;
    return {
      id: match[1],
      title: match[2].trim(),
      start,
      headingEnd,
      end,
      body: text.slice(headingEnd, end),
    };
  });
}

function listCaseFiles(workspace) {
  const root = path.join(workspace, 'cases');
  const found = [];
  const walk = (current, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory() && depth < 2) walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full);
    }
  };
  walk(root, 0);
  return found;
}

function inferCaseVersion(workspace, relative, body) {
  const fromField = normalizeVersion(parseNamedFields(body)['需求版本']);
  if (fromField) return fromField;
  const testPoint = path.join(workspace, 'test-points', path.basename(relative));
  try {
    if (fs.existsSync(testPoint)) {
      const fromFile = versionFromText(fs.readFileSync(testPoint, 'utf8').slice(0, 800));
      if (fromFile) return fromFile;
    }
  } catch {
    // Missing test-points files fall through to the workspace version.
  }
  return '';
}

function loadLocalCases(workspace) {
  const fallback = inferWorkspaceVersion(workspace);
  const results = latestCaseResults(workspace);
  const cases = [];
  for (const absolute of listCaseFiles(workspace)) {
    const markdown = fs.readFileSync(absolute, 'utf8');
    const relative = path.relative(workspace, absolute);
    for (const item of parseItems(markdown)) {
      const record = parseCaseRecord(item.body, item, {
        version: inferCaseVersion(workspace, relative, item.body) || fallback,
        module: caseModule(relative),
        execution: results[item.id] || '',
      });
      cases.push({
        ...item,
        file: relative,
        absolute,
        record,
        hash: rowHash(record),
      });
    }
  }
  cases.sort((left, right) => {
    const a = Number((/(\d+)/.exec(left.id) || [])[1] || 0);
    const b = Number((/(\d+)/.exec(right.id) || [])[1] || 0);
    return a - b || left.id.localeCompare(right.id);
  });
  return { fallback, cases };
}

function fieldBlock(name, value) {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (!text.includes('\n')) return `- ${name}：${text}`;
  return `- ${name}：\n${text.split('\n').map((line) => `  ${line}`).join('\n')}`;
}

function setNamedField(body, name, value) {
  const pattern = new RegExp(`^- ${escapeReg(name)}：.*(?:\\n(?![-*]\\s*[^\\n：:]{1,12}[：:]).*)*`, 'm');
  const block = fieldBlock(name, value);
  if (pattern.test(body)) return body.replace(pattern, () => block);
  const leading = body.startsWith('\n') ? '\n' : '';
  const rest = body.startsWith('\n') ? body.slice(1) : body;
  return `${leading}${block}\n${rest}`;
}

function applyRecordToMarkdown(markdown, item, record) {
  const local = parseNamedFields(item.body);
  const next = {
    ...record,
    状态: mergeLifecycle(local['状态'], record['状态']),
  };
  let body = item.body;
  for (const name of ['模块', '需求版本', '优先级', '对应测试点', '前置条件', '步骤', '期望结果', '状态']) {
    if (name === '模块' && !next[name]) continue;
    body = setNamedField(body, name, next[name] || '');
  }
  const heading = `### ${item.id} ${next['标题'] || item.title}`;
  return markdown.slice(0, item.start) + heading + body + markdown.slice(item.end);
}

function renderImportedCase(record) {
  return [
    `### ${record['编号']} ${record['标题'] || record['编号']}`,
    fieldBlock('优先级', record['优先级']),
    '- 自动化：否',
    fieldBlock('对应测试点', record['对应测试点']),
    fieldBlock('模块', record['模块']),
    fieldBlock('需求版本', record['需求版本']),
    fieldBlock('前置条件', record['前置条件']),
    fieldBlock('步骤', record['步骤']),
    fieldBlock('期望结果', record['期望结果']),
    fieldBlock('状态', caseLifecycle(record['状态'])),
    fieldBlock('执行结果', record['执行结果'] || '未执行'),
    '',
  ].join('\n');
}

function readCaseSheetBinding(workspace) {
  const parsed = readJson(path.join(workspace, BINDING_FILE));
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed;
}

function saveBinding(workspace, binding) {
  writeAtomic(path.join(workspace, BINDING_FILE), `${JSON.stringify(binding, null, 2)}\n`);
  return binding;
}

function nextClarificationId(markdown) {
  const numbers = [...markdown.matchAll(/###\s+Q(\d+)/g)].map((match) => Number.parseInt(match[1], 10));
  return `Q${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, '0')}`;
}

function ensureReviewDocument(workspace) {
  const absolute = path.join(workspace, REVIEW_FILE);
  if (fs.existsSync(absolute)) return fs.readFileSync(absolute, 'utf8');
  return `# 需求评审

- 来源：钉钉表格同步
- reviewVerdict：NEEDS_CLARIFICATION

## 待澄清问题
`;
}

function appendClarification(workspace, title, source, understanding) {
  let markdown = ensureReviewDocument(workspace);
  if (title && markdown.includes(title)) return;
  const id = nextClarificationId(markdown);
  markdown += `\n### ${id} ${title}\n- 状态：待处理\n- 原文：${source}\n- Agent理解：${understanding}\n- 补充：\n`;
  writeAtomic(path.join(workspace, REVIEW_FILE), markdown.endsWith('\n') ? markdown : `${markdown}\n`);
}

function conventionKeywords(text) {
  const found = [];
  for (const [pattern, word] of CONVENTION_KEYWORD) {
    if (pattern.test(text) && !found.includes(word)) found.push(word);
  }
  return found;
}

function nextLessonId(markdown) {
  const numbers = [...markdown.matchAll(/###\s+R(\d+)/g)].map((match) => Number.parseInt(match[1], 10));
  return `R${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, '0')}`;
}

function draftCaseLesson(workspace, record, changed) {
  if (!changed.length) return false;
  const origin = `钉钉表格收回 ${record['编号']}`;
  const file = path.join(workspace, LESSON_FILE);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (existing.includes(origin)) return false;
  const text = changed.map((name) => `${name}：${record[name] || ''}`).join('；');
  const global = GLOBAL_CONVENTION.test(text);
  const keywords = conventionKeywords(text);
  if (!keywords.length) keywords.push(record['编号'], ...changed.slice(0, 2));
  const id = nextLessonId(existing);
  const block = [
    `### ${id} 表格改了 ${record['编号']} ${changed.join('、')}`,
    '- 状态：待确认',
    `- 范围：${global ? '全部产品' : '本产品'}`,
    '- 适用：用例',
    `- 条件：写或改用例时遇到 ${changed.join('、')}`,
    `- 做法：${text.replace(/\s+/g, ' ').trim().slice(0, 500)}`,
    `- 关键词：${keywords.join('、')}`,
    `- 来源：${origin} ${record['标题'] || ''}`,
    '- 命中：0',
    '- 推翻：0',
    '',
  ].join('\n');
  const base = existing.trim() ? `${existing.replace(/\s+$/, '')}\n\n` : `${LESSON_FILE_HEADER}\n`;
  writeAtomic(file, `${base}${block}\n`);
  return true;
}

function recordsFromTable(columns, rows) {
  const names = (columns || []).map((name) => canonicalColumn(name));
  const index = {};
  names.forEach((name, offset) => {
    if (name && !(name in index)) index[name] = offset;
  });
  const records = [];
  const seen = new Set();
  for (const row of rows || []) {
    const cells = Array.isArray(row) ? row : [];
    const id = String(cells[index['编号'] ?? 0] || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const record = { 编号: id };
    for (const name of CASE_SHEET_COLUMNS) {
      if (name === '编号') continue;
      const value = index[name] == null ? '' : cells[index[name]];
      record[name] = String(value ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
    }
    record['需求版本'] = normalizeVersion(record['需求版本']) || record['需求版本'];
    record['状态'] = caseLifecycle(record['状态']);
    record['执行结果'] = record['执行结果'] || '未执行';
    records.push(record);
  }
  return records;
}

function changedFields(local, sheet) {
  return CASE_SHEET_COLUMNS.filter((name) => name !== '编号' && name !== '执行结果' && String(local[name] || '') !== String(sheet[name] || ''));
}

async function resolveExcel(options) {
  if (options.excel) return options.excel;
  return createDingTalkExcelFromConfig(options.env || process.env);
}

async function bindWorkbook(workspace, product, excel, binding, url) {
  if (url) {
    const nodeId = nodeIdFromRef(url) || (binding && binding.nodeId) || '';
    if (!nodeId) throw new Error('需要钉钉表格链接');
    const sheet = await excel.ensureSheet(nodeId, SHEET_TAB);
    return saveBinding(workspace, {
      nodeId,
      url: url.trim(),
      sheetId: sheet.id,
      sheetName: sheet.name,
      title: (binding && binding.title) || `${product}用例`,
      lastPushAt: binding?.lastPushAt || '',
      hashes: binding?.hashes || {},
    });
  }
  if (binding?.nodeId) {
    const sheet = await excel.ensureSheet(binding.nodeId, binding.sheetName || SHEET_TAB);
    return saveBinding(workspace, { ...binding, sheetId: sheet.id, sheetName: sheet.name });
  }
  const created = await excel.createWorkspaceSheet({ name: `${product || '产品'}用例` });
  if (!created.nodeId) throw new Error('钉钉表格没有返回文档 ID');
  const sheet = await excel.ensureSheet(created.nodeId, SHEET_TAB);
  return saveBinding(workspace, {
    nodeId: created.nodeId,
    url: created.url,
    sheetId: sheet.id,
    sheetName: sheet.name,
    title: created.title || `${product}用例`,
    lastPushAt: '',
    hashes: {},
  });
}

async function pushCases(workspace, product, excel, binding) {
  const { cases } = loadLocalCases(workspace);
  const rows = cases.map((item) => encodeCaseRow(item.record));
  await excel.writeTable(binding.nodeId, binding.sheetId, {
    columns: CASE_SHEET_COLUMNS,
    rows,
    name: binding.sheetName || SHEET_TAB,
  });
  if (typeof excel.createFilter === 'function') {
    const lastCol = String.fromCharCode(64 + CASE_SHEET_COLUMNS.length);
    await excel.createFilter(binding.nodeId, binding.sheetId, `A1:${lastCol}${Math.max(rows.length, 1) + 1}`);
  }
  const hashes = {};
  for (const item of cases) hashes[item.id] = item.hash;
  saveBinding(workspace, {
    ...binding,
    lastPushAt: new Date().toISOString(),
    lastPullAt: binding.lastPullAt || '',
    hashes,
    rowCount: rows.length,
  });
  return { action: 'push', written: cases.length, url: binding.url, nodeId: binding.nodeId, sheetId: binding.sheetId };
}

function applyUpdates(workspace, updates) {
  const byFile = new Map();
  for (const update of updates) {
    const list = byFile.get(update.file) || [];
    list.push(update);
    byFile.set(update.file, list);
  }
  for (const [relative, list] of byFile) {
    const absolute = path.join(workspace, relative);
    let markdown = fs.readFileSync(absolute, 'utf8');
    const ordered = list.slice().sort((left, right) => right.start - left.start);
    for (const update of ordered) {
      const current = parseItems(markdown).find((item) => item.id === update.id);
      if (!current) continue;
      markdown = applyRecordToMarkdown(markdown, current, update.record);
    }
    writeAtomic(absolute, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
  }
}

function importRecords(workspace, records) {
  if (!records.length) return;
  const absolute = path.join(workspace, IMPORT_FILE);
  const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '# 表格导入的用例\n\n';
  const blocks = records.map(renderImportedCase).filter((block) => {
    const id = /###\s+(\S+)/.exec(block);
    return !(id && existing.includes(`### ${id[1]} `));
  });
  if (!blocks.length) return;
  writeAtomic(absolute, `${existing.replace(/\s+$/, '')}\n\n${blocks.join('\n')}\n`);
}

async function pullCases(workspace, excel, binding) {
  const table = await excel.readTable(binding.nodeId, binding.sheetId);
  const sheetRecords = recordsFromTable(table.columns.length ? table.columns : CASE_SHEET_COLUMNS, table.rows);
  const { cases } = loadLocalCases(workspace);
  const localById = new Map(cases.map((item) => [item.id, item]));
  const hashes = { ...(binding.hashes || {}) };
  const updates = [];
  const imported = [];
  let updated = 0;
  let conflicts = 0;
  let missing = 0;
  let lessons = 0;

  for (const record of sheetRecords) {
    const local = localById.get(record.编号);
    const sheetHash = rowHash(record);
    const lastHash = hashes[record.编号];
    if (!local) {
      imported.push(record);
      hashes[record.编号] = sheetHash;
      continue;
    }
    const localHash = local.hash;
    if (sheetHash === localHash) {
      hashes[record.编号] = sheetHash;
      continue;
    }
    if (lastHash && sheetHash !== lastHash && localHash !== lastHash) {
      conflicts += 1;
      appendClarification(
        workspace,
        `表格与本地同时改了 ${record.编号}`,
        binding.url || binding.nodeId,
        `钉钉表格和本地 cases 都改了 ${record.编号}，没有自动合并。请在表格或本地留一版后再收回。`,
      );
      continue;
    }
    if (!lastHash) {
      conflicts += 1;
      appendClarification(
        workspace,
        `表格与本地同时改了 ${record.编号}`,
        binding.url || binding.nodeId,
        `还没有推送指纹。${record.编号} 在表格和本地不一致，没有自动合并。`,
      );
      continue;
    }
    if (sheetHash !== lastHash && localHash === lastHash) {
      const changed = changedFields(local.record, record);
      hashes[record.编号] = sheetHash;
      if (!changed.length) continue;
      updates.push({ ...local, record });
      if (draftCaseLesson(workspace, record, changed)) lessons += 1;
      updated += 1;
    }
  }

  for (const local of cases) {
    if (sheetRecords.some((record) => record.编号 === local.id)) continue;
    if (!hashes[local.id]) continue;
    missing += 1;
    appendClarification(
      workspace,
      `表格里没有了 ${local.id}`,
      binding.url || binding.nodeId,
      `上次推送过 ${local.id}，表格里现在没有这一行。本地用例没有删。`,
    );
  }

  applyUpdates(workspace, updates);
  importRecords(workspace, imported);
  saveBinding(workspace, {
    ...binding,
    lastPullAt: new Date().toISOString(),
    hashes,
  });
  return {
    action: 'pull',
    updated,
    imported: imported.length,
    conflicts,
    missing,
    lessons,
    url: binding.url,
    nodeId: binding.nodeId,
    sheetId: binding.sheetId,
  };
}

async function syncCaseSheet(options) {
  const workspace = options.workspace;
  const product = options.product || path.basename(workspace);
  const action = options.action === 'pull' ? 'pull' : 'push';
  const excel = await resolveExcel(options);
  let binding = readCaseSheetBinding(workspace);
  if (action === 'pull' && !binding && !options.url) {
    throw new Error('还没有绑定钉钉表格。先推送一次，或传入表格链接。');
  }
  binding = await bindWorkbook(workspace, product, excel, binding, options.url);
  if (action === 'pull') return pullCases(workspace, excel, binding);
  return pushCases(workspace, product, excel, binding);
}

module.exports = {
  BINDING_FILE,
  CASE_SHEET_COLUMNS,
  canonicalColumn,
  caseLifecycle,
  caseModule,
  encodeCaseRow,
  inferWorkspaceVersion,
  latestCaseResults,
  loadLocalCases,
  parseCaseRecord,
  readCaseSheetBinding,
  recordsFromTable,
  rowHash,
  syncCaseSheet,
};
