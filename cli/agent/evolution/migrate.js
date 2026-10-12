'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { splitSections, plainTitle, sameModule } = require('./text');

const CHANGE_LABEL = {
  added: '新增',
  modified: '修改',
  removed: '下线',
  split: '拆分',
  merged: '合并',
  preserved: '保留',
  unmentioned: '新版未提及',
  uncertain: '待确认',
  deferred: '后置',
};

function slug(title) {
  return String(title || '').replace(/\s+/g, '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '').slice(0, 16) || 'ITEM';
}

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function baselineFeatures(baselineText) {
  return splitSections(baselineText)
    .filter((section) => section.level === 2)
    .map((section) => ({ name: plainTitle(section.heading), heading: section.heading }))
    .filter((feature) => feature.name.length >= 2);
}

function covered(changes, name) {
  return changes.some((change) => change.name === name || sameModule(change.name, name));
}

function buildRequirementChanges(compiled, baselineText, deltaText) {
  const changes = [];
  function add(change) {
    if (!change.name || covered(changes, change.name)) return;
    changes.push({
      id: `REQ-${slug(change.name)}`,
      confidence: 'medium',
      requires_review: true,
      ...change,
    });
  }

  (compiled.conflicts || []).forEach((item) => {
    add({
      name: item.key,
      change_type: 'uncertain',
      confidence: 'low',
      rationale: `${item.key}的处置互相矛盾：${(item.quotes || []).join('；')}`.slice(0, 240),
    });
  });

  (compiled.skipped || []).forEach((item) => {
    const removed = item.action === 'DEPRECATE';
    add({
      name: item.name,
      change_type: removed ? 'removed' : 'deferred',
      confidence: 'high',
      rationale: removed
        ? '重构稿写明下线。关联用例只生成废弃建议，不会删除原文、步骤或历史结果。'
        : '重构稿写明后置。本版不测，也不把它当成功能已删除。',
    });
  });

  (compiled.modules || []).filter((item) => item.action === 'MERGE').forEach((item) => {
    add({
      name: item.name,
      change_type: 'merged',
      rationale: item.evidence || '重构稿写了合并。旧用例要核对是否重复，不能一对一覆盖。',
    });
  });

  splitSections(deltaText).forEach((section) => {
    if (!/拆分|拆成/.test(section.heading)) return;
    add({
      name: plainTitle(section.heading),
      change_type: 'split',
      rationale: '重构稿写了拆分。旧需求要映射到多个新需求，不能保留一对一关系后直接改写。',
    });
  });

  (compiled.effective || []).forEach((feature) => {
    const existed = baselineFeatures(baselineText).some((item) => sameModule(item.name, feature.title));
    const changeType = feature.track === '重构' ? (existed ? 'modified' : 'added') : 'preserved';
    add({
      name: feature.title,
      change_type: changeType,
      requires_review: changeType !== 'preserved',
      introducedIn: feature.introducedIn,
      lastTouchedIn: feature.lastTouchedIn,
      track: feature.track,
      rules: feature.rules,
      rationale: changeType === 'preserved'
        ? '新版点到了这个功能，可执行规则仍来自基线。用例可以保留，但要在新版重新验证。'
        : (feature.rules[0] || '新版改写了行为。'),
    });
  });

  baselineFeatures(baselineText).forEach((feature) => {
    if (covered(changes, feature.name)) return;
    if (String(deltaText || '').includes(feature.name)) return;
    add({
      name: feature.name,
      change_type: 'unmentioned',
      confidence: 'low',
      rationale: `旧版有「${feature.name}」，新版文档没有写。这不一定是删除，需要人工确认。`,
    });
  });

  return changes;
}

function readAssets(workspace) {
  const assets = [];
  ['test-points', 'cases'].forEach((kind) => {
    const dir = path.join(workspace, kind);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter((name) => name.endsWith('.md')).forEach((name) => {
      const relative = path.join(kind, name);
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      const matches = [...text.matchAll(/^###\s+(\S+)\s+(.+)$/gm)];
      matches.forEach((match, index) => {
        const start = (match.index ?? 0) + match[0].length;
        const end = matches[index + 1]?.index ?? text.length;
        assets.push({
          asset_id: match[1],
          title: match[2].trim(),
          body: text.slice(start, end),
          file: relative,
          kind: kind === 'cases' ? 'case' : 'point',
        });
      });
    });
  });
  return assets;
}

function linked(asset, change) {
  const blob = `${asset.title}\n${asset.body}`;
  if (blob.includes(change.name)) return true;
  const core = String(change.name || '').replace(/管理$/, '');
  return core.length >= 2 && blob.includes(core);
}

function proposalFor(change) {
  if (!change) return { action: 'keep', requires_review: false, reasons: ['这次变更没有点到这条资产'] };
  if (change.change_type === 'removed') {
    return { action: 'deprecate', requires_review: true, reasons: ['关联需求在新版标记下线。废弃要人工确认，文件和历史结果都保留。'] };
  }
  if (change.change_type === 'unmentioned') {
    return { action: 'pending_review', requires_review: true, reasons: [change.rationale] };
  }
  if (change.change_type === 'modified') {
    return { action: 'update', requires_review: true, reasons: ['需求有修改。原步骤先不覆盖，只标记为需要更新。'] };
  }
  if (change.change_type === 'preserved') {
    return { action: 'keep', requires_review: false, reasons: ['行为沿用基线。用例保留，验证状态改为新版尚未复测。'] };
  }
  return { action: 'pending_review', requires_review: true, reasons: [change.rationale] };
}

function planAssets(assets, changes) {
  const actions = assets.map((asset) => {
    const related = changes.filter((change) => linked(asset, change));
    const change = related.sort((left, right) => rank(right.change_type) - rank(left.change_type))[0];
    const proposal = proposalFor(change);
    return {
      asset_id: asset.asset_id,
      title: asset.title,
      file: asset.file,
      kind: asset.kind,
      requirement_id: change ? change.id : '',
      ...proposal,
    };
  });
  changes.filter((change) => change.change_type === 'added' || change.change_type === 'modified').forEach((change) => {
    if (actions.some((action) => action.requirement_id === change.id)) return;
    actions.push({
      asset_id: `NEW-${change.id}`,
      title: change.name,
      file: '',
      kind: 'candidate',
      requirement_id: change.id,
      action: 'create',
      requires_review: true,
      reasons: ['新版本带来的行为。先作为测试点候选，不直接写成用例，也不覆盖旧用例。'],
    });
  });
  return actions;
}

function rank(type) {
  return { removed: 6, unmentioned: 5, uncertain: 5, split: 4, merged: 4, deferred: 3, modified: 3, added: 2, preserved: 1 }[type] || 0;
}

function planRegression(changes) {
  return changes.filter((change) => change.rules && change.rules.length).map((change) => {
    const text = `${change.name}\n${change.rules.join('\n')}`;
    const integrity = /密码|权限|隔离|唯一|失败/.test(text);
    const tier = /登录/.test(change.name) ? 'smoke' : integrity ? 'core_regression' : 'extended';
    const automation = integrity ? 'prioritize' : 'later';
    const rationale = integrity
      ? `${change.name}涉及权限、登录或数据完整性，结果可以用明确状态断言。前提是测试数据能准备，跑完能清理。`
      : `${change.name}仍在当前版本的有效需求里，适合留在回归集。是否自动化取决于环境和数据是否稳定。`;
    return {
      name: change.name,
      requirement_id: change.id,
      tier,
      automation_recommendation: automation,
      verification: 'not_run',
      rationale,
    };
  });
}

function fingerprints(workspace) {
  const result = {};
  ['test-points', 'cases'].forEach((kind) => {
    const dir = path.join(workspace, kind);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter((name) => name.endsWith('.md')).forEach((name) => {
      const relative = path.join(kind, name);
      result[relative] = sha(fs.readFileSync(path.join(workspace, relative), 'utf8'));
    });
  });
  return result;
}

function buildMigrationPlan({
  compiled,
  baselineText,
  deltaText,
  workspace,
  product,
  baselinePath,
  deltaPath,
}) {
  const requirementChanges = buildRequirementChanges(compiled, baselineText, deltaText);
  const testAssetActions = planAssets(readAssets(workspace), requirementChanges);
  const stamp = new Date().toISOString();
  const evolutionId = `EVO-${sha(`${baselinePath}\n${deltaPath}\n${stamp}`).slice(0, 8)}`;
  return {
    evolution_id: evolutionId,
    product: product || '',
    baseline_version: compiled.baselineVersion || '',
    target_version: compiled.deltaVersion || '',
    baseline_path: baselinePath ? path.resolve(baselinePath) : '',
    target_path: deltaPath ? path.resolve(deltaPath) : '',
    status: 'review_required',
    created_at: stamp,
    requirement_changes: requirementChanges,
    test_asset_actions: testAssetActions,
    regression_candidates: planRegression(requirementChanges),
    fingerprints: fingerprints(workspace),
  };
}

function renderPlan(plan) {
  const lines = [
    `# 版本演进 ${plan.evolution_id}`,
    '',
    `- 状态：待审核`,
    `- 基线：${plan.baseline_version}`,
    `- 目标：${plan.target_version}`,
    '',
    '这是迁移方案，不是已批准的新基线。新版没写到的功能不会当成删除，用例文件不会在这一步被改写或删除。',
    '',
    '## 需求变更',
    '',
  ];
  plan.requirement_changes.forEach((change) => {
    lines.push(`- ${change.id} ${change.name}：${CHANGE_LABEL[change.change_type] || change.change_type}。${change.rationale}`);
  });
  lines.push('', '## 测试资产', '');
  plan.test_asset_actions.forEach((action) => {
    lines.push(`- ${action.asset_id} ${action.title}：${action.action}。${action.reasons.join('')}`);
  });
  lines.push('', '## 回归候选', '');
  plan.regression_candidates.forEach((item) => {
    lines.push(`- ${item.name}（${item.tier}，${item.automation_recommendation}）：${item.rationale}`);
  });
  return `${lines.join('\n')}\n`;
}

function writePlan(workspace, plan) {
  const dir = path.join(workspace, 'knowledge', 'evolution');
  fs.mkdirSync(dir, { recursive: true });
  const current = path.join(dir, 'current.json');
  if (fs.existsSync(current)) {
    const previous = JSON.parse(fs.readFileSync(current, 'utf8'));
    if (previous.evolution_id) {
      fs.writeFileSync(path.join(dir, `${previous.evolution_id}.json`), `${JSON.stringify(previous, null, 2)}\n`);
    }
  }
  fs.writeFileSync(current, `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'plan.md'), renderPlan(plan));
  return plan;
}

function readPlan(workspace) {
  const file = path.join(workspace, 'knowledge', 'evolution', 'current.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function setField(markdown, id, name, value) {
  const matches = [...markdown.matchAll(/^###\s+(\S+)\s+(.+)$/gm)];
  const index = matches.findIndex((match) => match[1] === id);
  if (index < 0) return null;
  const headingEnd = (matches[index].index ?? 0) + matches[index][0].length;
  const end = matches[index + 1]?.index ?? markdown.length;
  let body = markdown.slice(headingEnd, end);
  const field = new RegExp(`^- ${name}：.*$`, 'm');
  if (field.test(body)) body = body.replace(field, `- ${name}：${value}`);
  else body = `\n- ${name}：${value}${body.startsWith('\n') ? body : `\n${body}`}`;
  return markdown.slice(0, headingEnd) + body + markdown.slice(end);
}

function applyChoice(markdown, action, choice) {
  if (choice === 'keep') {
    let next = setField(markdown, action.asset_id, '生命周期', 'active');
    next = setField(next, action.asset_id, '验证', 'stale');
    return next;
  }
  if (choice === 'update') {
    let next = setField(markdown, action.asset_id, '生命周期', 'needs_update');
    next = setField(next, action.asset_id, '验证', 'not_run');
    return setField(next, action.asset_id, '迁移说明', action.reasons[0] || '需求已变化，步骤待更新');
  }
  if (choice === 'deprecate') return setField(markdown, action.asset_id, '生命周期', 'deprecated');
  if (choice === 'defer') return setField(markdown, action.asset_id, '生命周期', 'pending_review');
  return markdown;
}

function appendCandidate(workspace, action) {
  const file = path.join(workspace, 'test-points', 'evolution.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const block = [
    `### ${action.asset_id} ${action.title}`,
    '- 状态：待确认',
    '- 优先级：高',
    `- 迁移说明：${action.reasons[0] || '新版本候选'}`,
    '',
  ].join('\n');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# 版本演进候选\n\n';
  if (existing.includes(`### ${action.asset_id} `)) return;
  fs.writeFileSync(file, `${existing.trim()}\n\n${block}`);
}

function applyMigration({ workspace, decisions }) {
  const plan = readPlan(workspace);
  if (!plan) throw new Error('这个产品还没有版本演进方案');
  if (plan.status === 'applied') throw new Error('这份迁移已经应用过');
  const chosen = new Map((decisions || []).map((item) => [item.asset_id, item.action]));
  plan.test_asset_actions.filter((action) => action.file).forEach((action) => {
    const absolute = path.join(workspace, action.file);
    const current = sha(fs.readFileSync(absolute, 'utf8'));
    if (current !== plan.fingerprints[action.file]) {
      throw new Error(`${action.file} 在审核期间被修改了，请重新生成迁移方案`);
    }
  });
  plan.test_asset_actions.filter((action) => action.requires_review).forEach((action) => {
    if (!chosen.has(action.asset_id)) throw new Error(`还没有审核 ${action.asset_id}`);
  });

  const applied = [];
  const byFile = new Map();
  plan.test_asset_actions.forEach((action) => {
    const choice = chosen.get(action.asset_id) || action.action;
    if (choice === 'reject') {
      applied.push({ asset_id: action.asset_id, action: 'reject' });
      return;
    }
    if (choice === 'create') {
      appendCandidate(workspace, action);
      applied.push({ asset_id: action.asset_id, action: 'create' });
      return;
    }
    if (!action.file || !['keep', 'update', 'deprecate', 'defer'].includes(choice)) return;
    if (!byFile.has(action.file)) byFile.set(action.file, fs.readFileSync(path.join(workspace, action.file), 'utf8'));
    const next = applyChoice(byFile.get(action.file), action, choice);
    if (next == null) throw new Error(`没有找到 ${action.asset_id}`);
    byFile.set(action.file, next);
    applied.push({ asset_id: action.asset_id, action: choice });
  });
  byFile.forEach((text, relative) => {
    fs.writeFileSync(path.join(workspace, relative), text);
  });

  const record = {
    evolution_id: plan.evolution_id,
    applied_at: new Date().toISOString(),
    applied,
  };
  plan.status = 'applied';
  plan.applied_at = record.applied_at;
  plan.applied = applied;
  fs.writeFileSync(path.join(workspace, 'knowledge', 'evolution', 'current.json'), `${JSON.stringify(plan, null, 2)}\n`);
  fs.appendFileSync(path.join(workspace, 'knowledge', 'evolution', 'audit.jsonl'), `${JSON.stringify(record)}\n`);
  return plan;
}

module.exports = {
  CHANGE_LABEL,
  buildRequirementChanges,
  buildMigrationPlan,
  writePlan,
  readPlan,
  applyMigration,
  renderPlan,
};
