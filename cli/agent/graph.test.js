'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGraph, impactOf, caseContext } = require('./graph/model');
const { storeRequirementGraph, queryRequirementGraph } = require('./graph/store');

const payment = {
  features: [
    { id: 'FEAT_PAY_01', name: '支付结算域' },
    { id: 'FEAT_AUTH', name: '鉴权' },
  ],
  scenarios: [
    { id: 'SCEN_WECHAT', name: '微信扫码支付-正常流', flow_type: 'happy' },
    { id: 'SCEN_2FA', name: '银行卡快捷扣款-2FA流', flow_type: 'security' },
  ],
  preconditions: [{ id: 'PRE_CARD', description: '银行卡状态正常' }],
  rules: [
    { id: 'RULE_LIMIT', description: '单笔限额 5000' },
    { id: 'RULE_SMS', description: '短信验证码 60 秒内有效' },
  ],
  states: [{ id: 'STATE_PAID', name: '已支付' }],
  testCases: [
    { id: 'CASE_WECHAT', name: '微信扫码', spec_path: 'tests/e2e/checkout_wechat.spec.ts' },
    { id: 'CASE_2FA', name: '银行卡 2FA', spec_path: 'tests/e2e/checkout_card_2fa.spec.ts' },
  ],
  relationships: [
    { from: 'FEAT_PAY_01', to: 'SCEN_WECHAT', type: 'CONTAINS_SCENARIO' },
    { from: 'FEAT_PAY_01', to: 'SCEN_2FA', type: 'CONTAINS_SCENARIO' },
    { from: 'FEAT_PAY_01', to: 'FEAT_AUTH', type: 'DEPENDS_ON' },
    { from: 'SCEN_2FA', to: 'PRE_CARD', type: 'REQUIRES' },
    { from: 'SCEN_WECHAT', to: 'RULE_LIMIT', type: 'CONSTRAINED_BY' },
    { from: 'SCEN_2FA', to: 'RULE_SMS', type: 'CONSTRAINED_BY' },
    { from: 'SCEN_2FA', to: 'STATE_PAID', type: 'TRANSITIONS_TO', trigger: '验证通过' },
    { from: 'CASE_WECHAT', to: 'SCEN_WECHAT', type: 'VERIFIES' },
    { from: 'CASE_2FA', to: 'SCEN_2FA', type: 'VERIFIES' },
  ],
};

test('graph rejects a pasted requirement and unknown edges', () => {
  const rejected = normalizeGraph({
    features: [{ id: 'FEAT_01', name: '原文'.repeat(800) }],
    relationships: [{ from: 'FEAT_01', to: 'MISSING', type: 'CONTAINS_SCENARIO' }],
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join('\n'), /不要粘贴需求原文/);
});

test('unconfirmed statements stay out of the graph', () => {
  const result = normalizeGraph({
    features: [{ id: 'FEAT_01', name: '巡检计划' }],
    rules: [{ id: 'RULE_01', description: '也许要审批', confirmed: false }],
    relationships: [{ from: 'FEAT_01', to: 'RULE_01', type: 'CONSTRAINED_BY' }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.graph.rules.length, 0);
  assert.equal(result.graph.relationships.length, 0);
  assert.equal(result.excluded.length, 2);
});

test('impact lists scenarios, rules, and specs within two hops', () => {
  const graph = normalizeGraph(payment).graph;
  const impact = impactOf(graph, 'FEAT_AUTH');
  assert.equal(impact.ok, true);
  assert.deepEqual(impact.affectedScenarios, ['微信扫码支付-正常流', '银行卡快捷扣款-2FA流']);
  assert.deepEqual(impact.activeRules, ['单笔限额 5000', '短信验证码 60 秒内有效']);
  assert.deepEqual(impact.affectedTestSpecs, [
    'tests/e2e/checkout_wechat.spec.ts',
    'tests/e2e/checkout_card_2fa.spec.ts',
  ]);
});

test('case context contains only linked preconditions, rules, and states', () => {
  const graph = normalizeGraph(payment).graph;
  const context = caseContext(graph, 'SCEN_2FA');
  assert.match(context.text, /银行卡状态正常/);
  assert.match(context.text, /短信验证码 60 秒内有效/);
  assert.match(context.text, /验证通过 -> 已支付/);
  assert.equal(context.text.includes('单笔限额 5000'), false);
});

test('stored graph is a visible product file and skips Neo4j when unconfigured', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-graph-'));
  const calls = [];
  const stored = await storeRequirementGraph({
    workspace,
    product: '筑安通',
    sourceFile: '/tmp/req.md',
    graph: payment,
    env: {},
    execute: async () => { calls.push('neo4j'); },
  });
  assert.equal(stored.neo4j.configured, false);
  assert.equal(calls.length, 0);
  const index = fs.readFileSync(path.join(workspace, 'graph', 'index.md'), 'utf8');
  const cypher = fs.readFileSync(path.join(workspace, 'graph', 'ingest.cypher'), 'utf8');
  assert.match(index, /微信扫码支付-正常流/);
  assert.match(index, /不保存需求原文/);
  assert.match(cypher, /MERGE \(n:Feature \{id: '筑安通:FEAT_PAY_01'\}/);
  const queried = queryRequirementGraph(JSON.parse(fs.readFileSync(path.join(workspace, 'graph', 'graph.json'), 'utf8')), {
    featureName: '支付结算域',
  });
  assert.equal(queried.affectedTestSpecs.length, 2);
});

test('configured Neo4j receives idempotent statements', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-neo4j-'));
  const statements = [];
  const stored = await storeRequirementGraph({
    workspace,
    product: '筑安通',
    sourceFile: '/tmp/req.md',
    graph: {
      features: [{ id: 'FEAT_01', name: '巡检计划' }],
      relationships: [],
    },
    env: { NEO4J_URI: 'bolt://localhost:7687', NEO4J_USER: 'neo4j', NEO4J_PASSWORD: 'secret' },
    execute: async (plan) => { statements.push(...plan); },
  });
  assert.equal(stored.neo4j.written, true);
  assert.match(statements[0].text, /MERGE \(n:Feature \{id: row.scopedId\}\)/);
  assert.equal(statements[0].params.rows[0].scopedId, '筑安通:FEAT_01');
  assert.equal(JSON.stringify(statements).includes('secret'), false);
});

test('a cut-off graph asks for another append batch', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-cut-'));
  await assert.rejects(
    () => storeRequirementGraph({
      workspace,
      product: '筑安通',
      sourceFile: '/tmp/req.md',
      graph: '{"features":[{"id":"FEAT_01","name":"巡检"}],"relationships":[{"from":"SCEN_23","',
      env: {},
    }),
    /分批调用/,
  );
});

test('append keeps earlier nodes and adds later relationships', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-append-'));
  await storeRequirementGraph({
    workspace,
    product: '筑安通',
    sourceFile: '/tmp/req.md',
    graph: { features: [{ id: 'FEAT_01', name: '巡检计划', platform: 'WEB' }] },
    env: {},
  });
  const stored = await storeRequirementGraph({
    workspace,
    product: '筑安通',
    sourceFile: '/tmp/req.md',
    mode: 'append',
    graph: {
      scenarios: [{ id: 'SCEN_01', name: '新建计划', flow_type: 'happy' }],
      relationships: [{ from: 'FEAT_01', to: 'SCEN_01', type: 'CONTAINS_SCENARIO' }],
    },
    env: {},
  });
  assert.equal(stored.nodeCount, 2);
  assert.equal(stored.edgeCount, 1);
  const saved = JSON.parse(fs.readFileSync(path.join(workspace, 'graph', 'graph.json'), 'utf8'));
  assert.equal(saved.features[0].platform, 'WEB');
  assert.equal(saved.scenarios[0].name, '新建计划');
});

test('a batch that plans the whole document is rejected', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-batch-'));
  const rules = Array.from({ length: 41 }, (_item, index) => ({
    id: `RULE_${index}`,
    description: `规则 ${index}`,
  }));
  await assert.rejects(
    () => storeRequirementGraph({
      workspace,
      product: '筑安通',
      sourceFile: '/tmp/req.md',
      graph: { features: [{ id: 'FEAT_01', name: '巡检' }], rules },
      env: {},
    }),
    /按文档标题拆开/,
  );
  assert.equal(fs.existsSync(path.join(workspace, 'graph', 'graph.json')), false);
});
