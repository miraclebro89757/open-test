'use strict';

const FLOW_TYPES = ['happy', 'reverse', 'boundary', 'exception', 'idempotency', 'security'];
const MAX_TEXT = 1500;

const COLLECTIONS = [
  ['features', 'Feature', ['name']],
  ['scenarios', 'Scenario', ['name', 'flow_type']],
  ['preconditions', 'PreCondition', ['description']],
  ['actions', 'Action', ['description']],
  ['states', 'State', ['name']],
  ['rules', 'Rule', ['description']],
  ['testCases', 'TestCase', ['name']],
  ['defects', 'Defect', ['summary']],
];

const RELATIONS = {
  CONTAINS_SCENARIO: ['Feature', 'Scenario'],
  REQUIRES: ['Scenario', 'PreCondition'],
  TRANSITIONS_TO: ['Scenario', 'State'],
  CONSTRAINED_BY: ['Scenario', 'Rule'],
  VERIFIES: ['TestCase', 'Scenario'],
  DEPENDS_ON: ['Feature', 'Feature'],
  BREAKS_RULE: ['Defect', 'Rule'],
  EXECUTES_STEP: ['Action', 'State'],
  REPORTED_BUG: ['TestCase', 'Defect'],
};

function blankGraph() {
  return {
    features: [],
    scenarios: [],
    preconditions: [],
    actions: [],
    states: [],
    rules: [],
    testCases: [],
    defects: [],
    relationships: [],
  };
}

function textOf(node, fields) {
  return fields.map((field) => node[field]).filter(Boolean).join(' ');
}

function normalizeGraph(input) {
  const source = input && typeof input === 'object' ? input : {};
  const graph = blankGraph();
  const errors = [];
  const excluded = [];
  const byId = new Map();
  const excludedIds = new Set();

  COLLECTIONS.forEach(([key, label, fields]) => {
    const rows = Array.isArray(source[key]) ? source[key] : [];
    rows.forEach((row) => {
      const id = String(row && row.id || '').trim();
      if (!id) {
        errors.push(`${label} 缺少 id`);
        return;
      }
      if (row.confirmed === false) {
        excluded.push({ id, label, reason: '文档未确认，不写入图谱' });
        excludedIds.add(id);
        return;
      }
      const body = textOf(row, fields);
      if (!body) {
        errors.push(`${label} ${id} 缺少名称或描述`);
        return;
      }
      if (body.length > MAX_TEXT) {
        errors.push(`${label} ${id} 正文过长。拆成场景、规则和状态，不要粘贴需求原文`);
        return;
      }
      if (byId.has(id)) {
        errors.push(`节点 id 重复: ${id}`);
        return;
      }
      const node = { id, label };
      fields.forEach((field) => {
        if (row[field] != null && String(row[field]).trim()) node[field] = String(row[field]).trim();
      });
      const reserved = new Set(['id', 'confirmed', 'label', ...fields]);
      Object.entries(row).forEach(([field, value]) => {
        if (reserved.has(field) || value == null) return;
        if (typeof value === 'boolean' || typeof value === 'number') node[field] = value;
        if (typeof value === 'string' && value.trim() && value.trim().length <= 200) node[field] = value.trim();
      });
      if (label === 'Scenario') {
        const flow = node.flow_type || 'happy';
        if (!FLOW_TYPES.includes(flow)) {
          errors.push(`Scenario ${id} 的 flow_type 必须是 ${FLOW_TYPES.join(', ')}`);
          return;
        }
        node.flow_type = flow;
      }
      if (label === 'Rule') {
        if (row.code) node.code = String(row.code).trim();
        if (row.expression) node.expression = String(row.expression).trim();
      }
      if (label === 'TestCase' && row.spec_path) node.spec_path = String(row.spec_path).trim();
      if (label === 'Defect' && row.jira_key) node.jira_key = String(row.jira_key).trim();
      byId.set(id, node);
      graph[key].push(node);
    });
  });

  if (!graph.features.length && !errors.length) errors.push('至少要有一个功能节点');

  const relationships = Array.isArray(source.relationships) ? source.relationships : [];
  relationships.forEach((row) => {
    const type = String(row && row.type || '').trim();
    const pair = RELATIONS[type];
    const from = String(row && row.from || '').trim();
    const to = String(row && row.to || '').trim();
    if (!pair) {
      errors.push(`不支持的关系 ${type || '(空)'}`);
      return;
    }
    if (excludedIds.has(from) || excludedIds.has(to)) {
      excluded.push({ id: `${from}->${to}`, label: type, reason: '关系连到未确认节点，已跳过' });
      return;
    }
    const sourceNode = byId.get(from);
    const targetNode = byId.get(to);
    if (!sourceNode || !targetNode) {
      errors.push(`关系 ${type} 指向了不存在的节点 ${from} -> ${to}`);
      return;
    }
    const [fromLabel, toLabel] = pair;
    if (sourceNode.label !== fromLabel || targetNode.label !== toLabel) {
      errors.push(`${type} 必须是 ${fromLabel} -> ${toLabel}`);
      return;
    }
    const edge = { from, to, type };
    if (type === 'TRANSITIONS_TO' && row.trigger) edge.trigger = String(row.trigger).trim();
    graph.relationships.push(edge);
  });

  return { ok: errors.length === 0, graph, errors, excluded };
}

function nodesByLabel(graph, label) {
  return COLLECTIONS.flatMap(([key]) => graph[key]).filter((node) => node.label === label);
}

function nodeById(graph, id) {
  return COLLECTIONS.flatMap(([key]) => graph[key]).find((node) => node.id === id);
}

function edges(graph, type) {
  return graph.relationships.filter((edge) => edge.type === type);
}

function relatedFeatureIds(graph, featureId) {
  const seen = new Set([featureId]);
  let frontier = [featureId];
  for (let depth = 0; depth < 2; depth += 1) {
    const next = [];
    edges(graph, 'DEPENDS_ON').forEach((edge) => {
      frontier.forEach((id) => {
        const other = edge.from === id ? edge.to : edge.to === id ? edge.from : '';
        if (other && !seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
      });
    });
    frontier = next;
  }
  return [...seen];
}

function scenariosOf(graph, featureIds) {
  const ids = new Set(featureIds);
  return edges(graph, 'CONTAINS_SCENARIO')
    .filter((edge) => ids.has(edge.from))
    .map((edge) => nodeById(graph, edge.to))
    .filter(Boolean);
}

function impactOf(graph, featureId) {
  const feature = nodeById(graph, featureId);
  if (!feature || feature.label !== 'Feature') {
    return { ok: false, message: `图谱里没有功能 ${featureId}` };
  }
  const featureIds = relatedFeatureIds(graph, featureId);
  const scenarios = scenariosOf(graph, featureIds);
  const scenarioIds = new Set(scenarios.map((item) => item.id));
  const rules = edges(graph, 'CONSTRAINED_BY')
    .filter((edge) => scenarioIds.has(edge.from))
    .map((edge) => nodeById(graph, edge.to))
    .filter(Boolean);
  const specs = edges(graph, 'VERIFIES')
    .filter((edge) => scenarioIds.has(edge.to))
    .map((edge) => nodeById(graph, edge.from))
    .filter(Boolean);
  return {
    ok: true,
    featureName: feature.name,
    featureIds,
    affectedScenarios: [...new Set(scenarios.map((item) => item.name))],
    activeRules: [...new Set(rules.map((item) => item.description || item.code))],
    affectedTestSpecs: [...new Set(specs.map((item) => item.spec_path).filter(Boolean))],
  };
}

function findFeatures(graph, query) {
  const text = String(query || '').trim();
  if (!text) return [];
  return graph.features.filter((feature) => feature.id === text || feature.name.includes(text));
}

function caseContext(graph, scenarioId) {
  const scenario = nodeById(graph, scenarioId);
  if (!scenario || scenario.label !== 'Scenario') {
    return { ok: false, message: `图谱里没有场景 ${scenarioId}` };
  }
  const featureEdge = edges(graph, 'CONTAINS_SCENARIO').find((edge) => edge.to === scenarioId);
  const feature = featureEdge ? nodeById(graph, featureEdge.from) : null;
  const preconditions = edges(graph, 'REQUIRES')
    .filter((edge) => edge.from === scenarioId)
    .map((edge) => nodeById(graph, edge.to))
    .filter(Boolean);
  const rules = edges(graph, 'CONSTRAINED_BY')
    .filter((edge) => edge.from === scenarioId)
    .map((edge) => nodeById(graph, edge.to))
    .filter(Boolean);
  const transitions = edges(graph, 'TRANSITIONS_TO')
    .filter((edge) => edge.from === scenarioId)
    .map((edge) => ({ trigger: edge.trigger || '', state: nodeById(graph, edge.to) }))
    .filter((item) => item.state);
  const lines = [
    `【目标功能】: ${feature ? feature.name : '未挂到功能'}`,
    `【场景】: ${scenario.name} (${scenario.flow_type})`,
    `【前置条件】: ${preconditions.map((item) => item.description).join(' AND ') || '文档未写'}`,
    '【必须遵守的规则】:',
    ...(rules.length ? rules.map((item, index) => `  ${index + 1}. ${item.description}`) : ['  文档未写']),
    `【目标状态转换】: ${transitions.map((item) => `${item.trigger || '未写触发'} -> ${item.state.name}`).join(' / ') || '文档未写'}`,
  ];
  return { ok: true, text: `${lines.join('\n')}\n`, scenario, feature, preconditions, rules, transitions };
}

function renderGraph(graph) {
  const lines = [
    `# ${graph.product || '需求'} 图谱`,
    '',
    `来源文件：${graph.sourceFile || '未记录'}`,
    '',
    '节点是从需求里抽出的功能、场景、规则和状态。这里不保存需求原文。',
    '',
  ];
  graph.features.forEach((feature) => {
    lines.push(`## ${feature.name}`, '');
    const scenarios = scenariosOf(graph, [feature.id]);
    if (!scenarios.length) lines.push('没有挂接场景。', '');
    scenarios.forEach((scenario) => {
      lines.push(`- 场景 ${scenario.id}：${scenario.name}（${scenario.flow_type}）`);
      edges(graph, 'REQUIRES').filter((edge) => edge.from === scenario.id).forEach((edge) => {
        const node = nodeById(graph, edge.to);
        if (node) lines.push(`  - 前置：${node.description}`);
      });
      edges(graph, 'CONSTRAINED_BY').filter((edge) => edge.from === scenario.id).forEach((edge) => {
        const node = nodeById(graph, edge.to);
        if (node) lines.push(`  - 规则：${node.description}`);
      });
      edges(graph, 'TRANSITIONS_TO').filter((edge) => edge.from === scenario.id).forEach((edge) => {
        const node = nodeById(graph, edge.to);
        if (node) lines.push(`  - 状态：${edge.trigger || '未写触发'} -> ${node.name}`);
      });
    });
    lines.push('');
  });
  const dependencies = edges(graph, 'DEPENDS_ON');
  if (dependencies.length) {
    lines.push('## 功能依赖', '');
    dependencies.forEach((edge) => {
      const from = nodeById(graph, edge.from);
      const to = nodeById(graph, edge.to);
      lines.push(`- ${from ? from.name : edge.from} 依赖 ${to ? to.name : edge.to}`);
    });
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function cypherQuote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function renderCypher(graph) {
  const product = graph.product || '';
  const lines = ['// 幂等写入。重复执行不会复制节点。', ''];
  COLLECTIONS.forEach(([key, label]) => {
    graph[key].forEach((node) => {
      const id = `${product}:${node.id}`;
      lines.push(`MERGE (n:${label} {id: ${cypherQuote(id)}})`);
      const sets = [`n.product = ${cypherQuote(product)}`, 'n.local_id = ' + cypherQuote(node.id), 'n.updated_at = timestamp()'];
      Object.entries(node).forEach(([field, value]) => {
        if (field === 'id' || field === 'label') return;
        sets.push(`n.${field} = ${cypherQuote(value)}`);
      });
      lines.push(`SET ${sets.join(', ')}`, '');
    });
  });
  graph.relationships.forEach((edge) => {
    const from = `${product}:${edge.from}`;
    const to = `${product}:${edge.to}`;
    lines.push(
      `MATCH (a {id: ${cypherQuote(from)}}), (b {id: ${cypherQuote(to)}})`,
      `MERGE (a)-[e:${edge.type}]->(b)`,
    );
    if (edge.trigger) lines.push(`SET e.trigger = ${cypherQuote(edge.trigger)}`);
    lines.push('');
  });
  return `${lines.join('\n')}\n`;
}

function cypherPlan(graph) {
  const product = graph.product || '';
  const scope = (id) => `${product}:${id}`;
  const statements = COLLECTIONS.map(([key, label]) => ({
    text: `UNWIND $rows AS row MERGE (n:${label} {id: row.scopedId}) SET n += row.props, n.product = $product, n.updated_at = timestamp()`,
    params: {
      product,
      rows: graph[key].map((node) => {
        const props = { ...node, local_id: node.id };
        delete props.id;
        delete props.label;
        return { scopedId: scope(node.id), props };
      }),
    },
  })).filter((statement) => statement.params.rows.length);
  Object.keys(RELATIONS).forEach((type) => {
    const rels = edges(graph, type).map((edge) => ({
      from: scope(edge.from),
      to: scope(edge.to),
      trigger: edge.trigger || null,
    }));
    if (!rels.length) return;
    statements.push({
      text: `UNWIND $rels AS rel MATCH (a {id: rel.from}) MATCH (b {id: rel.to}) MERGE (a)-[e:${type}]->(b) SET e.trigger = rel.trigger`,
      params: { rels },
    });
  });
  return statements;
}

module.exports = {
  FLOW_TYPES,
  RELATIONS,
  normalizeGraph,
  impactOf,
  findFeatures,
  caseContext,
  renderGraph,
  renderCypher,
  cypherPlan,
};
