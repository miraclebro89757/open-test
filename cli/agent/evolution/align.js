'use strict';

const fs = require('fs');
const path = require('path');
const { compileEvolution, renderMerged } = require('./compile');
const { retrieveBaseline } = require('./retriever');
const { buildMigrationPlan, writePlan } = require('./migrate');
const { updateCheckpoint } = require('../tasks/checkpoint');

function oneLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function readPack(workspace) {
  const file = path.join(workspace, 'knowledge', 'version-pack.json');
  if (!fs.existsSync(file)) throw new Error('这个产品还没有版本包。先对齐基线和重构稿。');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function appendClarifications(file, items) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# 需求评审\n\n## 待澄清问题\n';
  if (!/##\s+(?:\d+\.\s*)?待澄清/.test(text)) text = `${text.trim()}\n\n## 待澄清问题\n`;
  const ids = [...text.matchAll(/###\s+Q(\d+)/g)].map((item) => Number(item[1]));
  let next = ids.length ? Math.max(...ids) + 1 : 1;
  const blocks = [];
  items.forEach((item) => {
    if (!item.title || text.includes(item.title) || blocks.some((block) => block.includes(item.title))) return;
    const id = `Q${String(next).padStart(3, '0')}`;
    next += 1;
    blocks.push([
      `### ${id} ${item.title}`,
      '- 状态：待处理',
      `- 原文：${oneLine(item.source)}`,
      `- Agent理解：${oneLine(item.understanding)}`,
      '- 补充：',
      '',
    ].join('\n'));
  });
  if (!blocks.length) {
    if (!fs.existsSync(file)) await fs.promises.writeFile(file, text);
    return;
  }
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, `${text.trim()}\n\n${blocks.join('\n')}\n`);
}

function summaryOf(result, plan) {
  const pending = plan.test_asset_actions.filter((action) => action.requires_review).length;
  const unmentioned = plan.requirement_changes.filter((change) => change.change_type === 'unmentioned').length;
  return [
    `已生成版本演进方案 ${plan.evolution_id}，状态是待审核。`,
    `基线 ${result.baselineVersion || '未标明'}，目标 ${result.deltaVersion || '未标明'}。`,
    `需求变更 ${plan.requirement_changes.length} 条，其中新版未提及 ${unmentioned} 条，这些不会当成删除。`,
    `待审核测试资产 ${pending} 条。用例文件还没有改。方案在 knowledge/evolution/plan.md。`,
  ].join('\n');
}

async function alignRequirementVersions({
  workspace,
  product,
  baselinePath,
  deltaPath,
  baselineVersion,
  deltaVersion,
}) {
  if (!baselinePath || !fs.existsSync(baselinePath)) throw new Error(`找不到基线文档 ${baselinePath || ''}`);
  if (!deltaPath || !fs.existsSync(deltaPath)) throw new Error(`找不到重构文档 ${deltaPath || ''}`);
  const baselineText = fs.readFileSync(baselinePath, 'utf8');
  const deltaText = fs.readFileSync(deltaPath, 'utf8');
  const compiled = compileEvolution({
    baselineText,
    deltaText,
    baselineVersion,
    deltaVersion,
    baselineFile: baselinePath,
    deltaFile: deltaPath,
  });
  const knowledge = path.join(workspace, 'knowledge');
  await fs.promises.mkdir(knowledge, { recursive: true });
  const pack = {
    product: product || '',
    baseline: { path: path.resolve(baselinePath), version: compiled.baselineVersion, role: 'base' },
    delta: { path: path.resolve(deltaPath), version: compiled.deltaVersion, role: 'delta' },
  };
  await fs.promises.writeFile(path.join(knowledge, 'version-pack.json'), `${JSON.stringify(pack, null, 2)}\n`);
  const draft = `> 状态：待审核。这是对照结果，不是已批准的新基线。应用迁移前不要用它覆盖旧用例。\n\n${renderMerged(compiled, product)}`;
  await fs.promises.writeFile(path.join(knowledge, 'merged.md'), draft);
  await appendClarifications(path.join(knowledge, '需求评审.md'), compiled.clarifications);
  const plan = writePlan(workspace, buildMigrationPlan({
    compiled,
    baselineText,
    deltaText,
    workspace,
    product,
    baselinePath,
    deltaPath,
  }));
  updateCheckpoint(workspace, {
    product,
    sourceFile: deltaPath,
    sources: [path.resolve(baselinePath), path.resolve(deltaPath)],
    action: 'status',
  });
  return { workspace, ...compiled, plan, summary: summaryOf(compiled, plan) };
}

function queryBaselineFeature({ workspace, module, aspect } = {}) {
  const pack = readPack(workspace);
  const baselinePath = pack.baseline && pack.baseline.path;
  if (!baselinePath || !fs.existsSync(baselinePath)) throw new Error('版本包里的基线文件不存在');
  return retrieveBaseline(fs.readFileSync(baselinePath, 'utf8'), { module, aspect });
}

module.exports = { alignRequirementVersions, queryBaselineFeature };
