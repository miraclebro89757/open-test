'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDisposal,
  sniffReferences,
  retrieveBaseline,
  compileEvolution,
  alignRequirementVersions,
  queryBaselineFeature,
  applyMigration,
} = require('./index');

const REAL_BASELINE = '/Users/zephyrus/Desktop/易训/筑安通V1.1.3需求文档.md';
const REAL_DELTA = '/Users/zephyrus/Downloads/重构版本V1.0 需求文档.md';

const dictionaryOnly = `
| 处置方式 | 定义 | 适用情况 |
| --- | --- | --- |
| **保留** | 继续存在 | 项目、隐患等核心业务 |
| **下线** | 不再维护 | 活动 |
`;

const deltaFixture = `
| 产品版本 | V1.1.4 |
| 处置方式 | 定义 | 适用情况 |
| --- | --- | --- |
| 保留 | 继续存在 | 项目、隐患等核心业务 |
| 优化 | 重新设计 | 组织、权限 |
| 后置 | 不纳入当前 | 教育、档案等功能 |
| 下线 | 不再维护 | 活动 |

#### 活动——下线

活动模块不再保留。

#### 教育——后置重构

教育暂不纳入本次重构。

#### 隐患管理——保留并优化

本次梳理隐患数据模型。

#### 劳务管理——保留

劳务管理继续保留，优先进行 UED 优化。

## 人员

#### 1.3.2 添加内部人员

##### 手动添加内部人员：

3. 登录密码：置灰，不可配置，默认为【111111】

支持编辑人员：点击后打开弹窗，编辑项与添加人员一致；

##### 导入添加内部人员：

导入方式沿用当前人员导入交互-模板-模板下载/填充-模板上传-解析逻辑

### 4.1 内部管理人员数据授权机制

外部管理人员授权方案与内部管理人员-项目级管理人员一致。

| 一级菜单 | 二级菜单 | 三级菜单 |
| --- | --- | --- |
| 项目 | 巡检管理 |  |
| 培训 | 后置迭代 |  |
| 隐患 | 后置迭代 |  |
`;

const baselineFixture = `
| 产品版本 | V1.1.3 |

## 项目管理-巡检管理

| 项目巡检状态总览 | 详情 | 1. 首页支持按日/周/月拉取数据统计<br>1. 日：拉取今日有巡检任务的计划数量、逾期任务数<br>2. 周：拉取本周逾期任务数 |

## 实名制管理

### 实名制人员管理

| 批量导入人员 | 详情 | 交互方式沿用当前组织架构-批量导入-弹窗交互 |
| 异常状态 |  | 1. 缺失人员姓名、手机号、身份证号时，导入失败 |
`;

test('disposal dictionary does not turn example cells into modules', () => {
  const parsed = parseDisposal(dictionaryOnly);
  assert.equal(parsed.dictionary.下线, 'DEPRECATE');
  assert.equal(parsed.dictionary.保留, 'PRESERVE');
  assert.equal(parsed.modules.some((item) => item.name === '活动'), false);
  assert.equal(parsed.modules.some((item) => item.name === '隐患'), false);
});

test('module disposal comes from headings and later assignment rows', () => {
  const parsed = parseDisposal(deltaFixture);
  const byName = Object.fromEntries(parsed.modules.map((item) => [item.name, item.action]));
  assert.equal(byName.活动, 'DEPRECATE');
  assert.equal(byName.教育, 'DEFER');
  assert.equal(byName['隐患管理'], 'PRESERVE_OPTIMIZE');
  assert.equal(byName.培训, 'DEFER');
  assert.equal(byName.巡检管理, undefined);
  assert.equal(parsed.conflicts.some((item) => item.key === '隐患'), true);
  const hazard = parsed.conflicts.find((item) => item.key === '隐患');
  assert.ok(hazard.actions.includes('PRESERVE_OPTIMIZE'));
  assert.ok(hazard.actions.includes('DEFER'));
});

test('inherit phrases go to the baseline and same-page comparisons stay local', () => {
  const refs = sniffReferences(deltaFixture);
  const baseline = refs.filter((item) => item.kind === 'BASELINE');
  const local = refs.filter((item) => item.kind === 'SAME_DOC');
  assert.ok(baseline.some((item) => item.aspect.includes('人员导入') && item.operator === 'INHERIT'));
  assert.ok(local.some((item) => item.sourceText.includes('添加人员')));
  assert.ok(local.some((item) => item.sourceText.includes('内部管理人员')));
  assert.equal(baseline.some((item) => item.sourceText.includes('添加人员')), false);
  const negative = sniffReferences('不同人员在同一菜单下能看到的菜单数据各不相同。');
  assert.equal(negative.some((item) => item.sourceText.includes('不相同')), false);
});

test('baseline retrieval reads table cells and ignores another document', () => {
  const inspection = retrieveBaseline(baselineFixture, { module: '巡检管理', aspect: '日/周/月' });
  assert.equal(inspection.found, true);
  assert.match(inspection.rules.join('\n'), /逾期/);
  assert.equal(inspection.rules.join('\n').includes('http'), false);
  const imported = retrieveBaseline(baselineFixture, { module: '人员导入', aspect: '导入' });
  assert.match(imported.rules.join('\n'), /缺失人员姓名/);
  const other = `${baselineFixture}\nSECRET_OTHER_DOC`;
  const isolated = retrieveBaseline(baselineFixture, { module: '巡检管理', aspect: '日/周/月' });
  assert.equal(isolated.text.includes('SECRET_OTHER_DOC'), false);
  assert.equal(other.includes('SECRET_OTHER_DOC'), true);
});

test('compiler keeps one current spec and sends conflicts to clarifications', () => {
  const result = compileEvolution({
    baselineText: baselineFixture,
    deltaText: deltaFixture,
    baselineVersion: '1.1.3',
    deltaVersion: '1.1.4',
    baselineFile: '/docs/筑安通V1.1.3需求文档.md',
    deltaFile: '/docs/重构版本V1.0 需求文档.md',
  });
  assert.ok(result.skipped.some((item) => item.name === '活动' && item.action === 'DEPRECATE'));
  assert.ok(result.skipped.some((item) => item.name === '教育' && item.action === 'DEFER'));
  assert.equal(result.effective.some((item) => item.title.includes('隐患')), false);
  assert.ok(result.clarifications.some((item) => item.title.includes('隐患')));
  const inspection = result.effective.find((item) => item.title.includes('巡检'));
  assert.ok(inspection);
  assert.equal(inspection.track, '回归');
  assert.equal(inspection.introducedIn, '1.1.3');
  assert.equal(inspection.lastTouchedIn, '1.1.4');
  assert.match(inspection.rules.join('\n'), /逾期/);
  const imported = result.effective.find((item) => item.title.includes('导入') || item.rules.join('\n').includes('缺失人员姓名'));
  assert.match(imported.rules.join('\n'), /缺失人员姓名/);
  assert.equal(result.lookups.some((item) => String(item.aspect || item.module || '').includes('添加人员')), false);
  const password = result.effective.find((item) => item.rules.join('\n').includes('111111'));
  assert.equal(password.track, '重构');
  assert.equal(password.introducedIn, '1.1.4');
  assert.ok(result.clarifications.some((item) => item.title.includes('劳务管理')));
  assert.ok(result.clarifications.some((item) => item.understanding.includes('更早')));
});

test('align writes the merged spec into one product workspace', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-evolution-'));
  const docs = path.join(workspace, 'docs');
  fs.mkdirSync(docs);
  const baselinePath = path.join(docs, 'baseline.md');
  const deltaPath = path.join(docs, 'delta.md');
  fs.writeFileSync(baselinePath, baselineFixture);
  fs.writeFileSync(deltaPath, deltaFixture);
  fs.mkdirSync(path.join(workspace, 'knowledge'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'knowledge', '需求评审.md'), [
    '# 需求评审',
    '',
    '## 待澄清问题',
    '',
    '### Q003 隐患处置互相矛盾',
    '- 状态：已补充',
    '- 原文：旧',
    '- Agent理解：旧',
    '- 补充：以保留并优化为准',
    '',
  ].join('\n'));

  const result = await alignRequirementVersions({
    workspace,
    product: '筑安通',
    baselinePath,
    deltaPath,
    baselineVersion: '1.1.3',
    deltaVersion: '1.1.4',
  });

  const merged = fs.readFileSync(path.join(workspace, 'knowledge', 'merged.md'), 'utf8');
  assert.match(merged, /巡检/);
  assert.match(merged, /111111/);
  assert.match(merged, /活动/);
  assert.match(merged, /不纳入/);
  const review = fs.readFileSync(path.join(workspace, 'knowledge', '需求评审.md'), 'utf8');
  assert.match(review, /状态：已补充/);
  assert.equal((review.match(/隐患处置互相矛盾/g) || []).length, 1);
  assert.match(review, /劳务管理/);
  assert.equal(fs.existsSync(path.join(workspace, 'graph', 'graph.json')), false);
  const plan = JSON.parse(fs.readFileSync(path.join(workspace, 'knowledge', 'evolution', 'current.json'), 'utf8'));
  assert.equal(plan.status, 'review_required');
  const removed = plan.requirement_changes.find((item) => item.name === '活动');
  assert.equal(removed.change_type, 'removed');
  assert.equal(removed.requires_review, true);
  const hazard = plan.requirement_changes.find((item) => item.name === '隐患');
  assert.equal(hazard.change_type, 'uncertain');
  const inspection = plan.requirement_changes.find((item) => item.name.includes('巡检'));
  assert.equal(inspection.change_type, 'preserved');
  assert.ok(plan.regression_candidates.some((item) => item.name.includes('巡检') && item.rationale));
  const pack = JSON.parse(fs.readFileSync(path.join(workspace, 'knowledge', 'version-pack.json'), 'utf8'));
  assert.equal(pack.baseline.path, baselinePath);
  assert.equal(pack.delta.path, deltaPath);
  const status = fs.readFileSync(path.join(workspace, 'tasks', 'status.md'), 'utf8');
  assert.match(status, /baseline\.md/);
  assert.match(status, /delta\.md/);

  const looked = queryBaselineFeature({ workspace, module: '巡检管理', aspect: '日/周/月' });
  assert.match(looked.rules.join('\n'), /逾期/);
  assert.equal(looked.text.includes('111111'), false);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-evolution-other-'));
  assert.throws(() => queryBaselineFeature({ workspace: other, module: '巡检管理' }), /版本包/);
  assert.equal(result.workspace, workspace);
});

test('a missing new-version mention does not delete the old case', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-evolution-assets-'));
  const docs = path.join(workspace, 'docs');
  fs.mkdirSync(docs);
  fs.mkdirSync(path.join(workspace, 'cases'));
  const baselinePath = path.join(docs, 'baseline.md');
  const deltaPath = path.join(docs, 'delta.md');
  fs.writeFileSync(baselinePath, `${baselineFixture}\n## 取消订单\n\n点击取消后订单关闭，不允许重复取消。\n`);
  fs.writeFileSync(deltaPath, deltaFixture);
  const caseFile = path.join(workspace, 'cases', 'orders.md');
  const original = [
    '### TC-CANCEL 取消订单',
    '- 步骤：点击取消',
    '',
    '### TC-INSP 巡检首页',
    '- 步骤：按日查看逾期',
    '',
  ].join('\n');
  fs.writeFileSync(caseFile, original);

  const aligned = await alignRequirementVersions({
    workspace,
    product: '筑安通',
    baselinePath,
    deltaPath,
    baselineVersion: '1.1.3',
    deltaVersion: '1.1.4',
  });
  assert.equal(fs.readFileSync(caseFile, 'utf8'), original);
  const cancel = aligned.plan.requirement_changes.find((item) => item.name === '取消订单');
  assert.equal(cancel.change_type, 'unmentioned');
  const cancelCase = aligned.plan.test_asset_actions.find((item) => item.asset_id === 'TC-CANCEL');
  assert.equal(cancelCase.action, 'pending_review');
  assert.equal(cancelCase.requires_review, true);
  const inspectionCase = aligned.plan.test_asset_actions.find((item) => item.asset_id === 'TC-INSP');
  assert.equal(inspectionCase.action, 'keep');

  assert.throws(() => applyMigration({ workspace, decisions: [] }), /还没有审核 TC-CANCEL/);
  fs.writeFileSync(caseFile, `${original}\n改过一行\n`);
  assert.throws(() => applyMigration({
    workspace,
    decisions: [{ asset_id: 'TC-CANCEL', action: 'deprecate' }],
  }), /审核期间被修改/);
  assert.match(fs.readFileSync(caseFile, 'utf8'), /改过一行/);
  assert.equal(fs.readFileSync(caseFile, 'utf8').includes('生命周期'), false);

  fs.writeFileSync(caseFile, original);
  const fresh = await alignRequirementVersions({
    workspace,
    product: '筑安通',
    baselinePath,
    deltaPath,
    baselineVersion: '1.1.3',
    deltaVersion: '1.1.4',
  });
  const decisions = fresh.plan.test_asset_actions
    .filter((item) => item.requires_review)
    .map((item) => ({ asset_id: item.asset_id, action: item.asset_id === 'TC-CANCEL' ? 'deprecate' : 'reject' }));
  applyMigration({ workspace, decisions });
  const migrated = fs.readFileSync(caseFile, 'utf8');
  assert.match(migrated, /### TC-CANCEL 取消订单/);
  assert.match(migrated, /步骤：点击取消/);
  assert.match(migrated, /生命周期：deprecated/);
  assert.match(migrated, /### TC-INSP 巡检首页/);
  const audit = fs.readFileSync(path.join(workspace, 'knowledge', 'evolution', 'audit.jsonl'), 'utf8');
  assert.match(audit, /TC-CANCEL/);
});

test('a split heading stays a split, not a one-to-one rewrite', () => {
  const { buildRequirementChanges } = require('./migrate');
  const changes = buildRequirementChanges({
    conflicts: [],
    skipped: [],
    modules: [],
    effective: [],
  }, '## 取消订单\n\n关闭订单，不允许重复取消。\n', '## 订单拆成创建与支付\n\n创建和支付分开。\n');
  assert.equal(changes.find((item) => item.change_type === 'split').name, '订单拆成创建与支付');
  assert.equal(changes.find((item) => item.name === '取消订单').change_type, 'unmentioned');
});

test('sample refactor and baseline documents align on the key points', async (t) => {
  if (!fs.existsSync(REAL_BASELINE) || !fs.existsSync(REAL_DELTA)) {
    t.skip('sample PRDs are not on this machine');
    return;
  }
  const result = compileEvolution({
    baselineText: fs.readFileSync(REAL_BASELINE, 'utf8'),
    deltaText: fs.readFileSync(REAL_DELTA, 'utf8'),
    baselineFile: REAL_BASELINE,
    deltaFile: REAL_DELTA,
  });
  assert.equal(result.baselineVersion, '1.1.3');
  assert.equal(result.deltaVersion, '1.1.4');
  assert.ok(result.skipped.some((item) => item.name === '活动' && item.action === 'DEPRECATE'));
  assert.ok(result.skipped.some((item) => item.name === '教育' && item.action === 'DEFER'));
  assert.equal(result.effective.some((item) => item.title === '隐患' || item.title === '隐患管理'), false);
  assert.ok(result.clarifications.some((item) => item.title.includes('隐患')));
  assert.ok(result.references.some((item) => item.kind === 'SAME_DOC' && item.sourceText.includes('添加人员')));
  assert.ok(result.references.some((item) => item.kind === 'BASELINE' && item.sourceText.includes('沿用当前人员导入')));
  assert.equal(result.lookups.some((item) => String(item.aspect || '').includes('添加人员')), false);
  const inspection = result.effective.find((item) => item.title.includes('巡检'));
  assert.match(inspection.rules.join('\n'), /日|逾期/);
  assert.equal(inspection.introducedIn, '1.1.3');
  const imported = result.effective.find((item) => item.rules.join('\n').includes('缺失人员姓名'));
  assert.ok(imported);
  const password = result.effective.find((item) => item.rules.join('\n').includes('111111'));
  assert.equal(password.track, '重构');
  assert.equal(password.introducedIn, '1.1.4');
  assert.equal(result.references.some((item) => item.kind === 'BASELINE' && item.sourceText.includes('不相同')), false);
  assert.equal(result.effective.some((item) => item.rules.some((rule) => rule === '劳务管理-花名册' || rule === '物联-AI预警')), false);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-evolution-real-'));
  await alignRequirementVersions({
    workspace,
    product: '筑安通',
    baselinePath: REAL_BASELINE,
    deltaPath: REAL_DELTA,
  });
  const merged = fs.readFileSync(path.join(workspace, 'knowledge', 'merged.md'), 'utf8');
  assert.match(merged, /巡检/);
  assert.match(merged, /不纳入/);
  assert.match(merged, /待审核/);
  const plan = JSON.parse(fs.readFileSync(path.join(workspace, 'knowledge', 'evolution', 'current.json'), 'utf8'));
  assert.equal(plan.status, 'review_required');
  assert.equal(plan.requirement_changes.find((item) => item.name === '活动').change_type, 'removed');
  assert.ok(plan.requirement_changes.some((item) => item.change_type === 'unmentioned'));
  assert.equal(fs.existsSync(path.join(workspace, 'graph', 'graph.json')), false);
});
