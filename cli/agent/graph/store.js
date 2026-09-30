'use strict';

const fs = require('fs');
const path = require('path');
const {
  normalizeGraph,
  impactOf,
  findFeatures,
  caseContext,
  renderGraph,
  renderCypher,
  cypherPlan,
} = require('./model');

function readGraph(workspace) {
  const file = path.join(workspace, 'graph', 'graph.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const GRAPH_KEYS = ['features', 'scenarios', 'preconditions', 'actions', 'states', 'rules', 'testCases', 'defects'];
const MAX_BATCH_CHARS = 6000;
const MAX_BATCH_ITEMS = 40;

function batchItemCount(parsed) {
  const nodes = GRAPH_KEYS.reduce((sum, key) => sum + ((parsed && parsed[key] || []).length), 0);
  return nodes + ((parsed && parsed.relationships || []).length);
}

function assertBatchSize(text, parsed) {
  if (typeof text === 'string' && text.length > MAX_BATCH_CHARS) {
    throw new Error(`这一批有 ${text.length} 字符，超过 ${MAX_BATCH_CHARS}。只提交当前章节，不要在回复里规划整份文档。`);
  }
  const count = batchItemCount(parsed);
  if (count > MAX_BATCH_ITEMS) {
    throw new Error(`这一批有 ${count} 项，超过 ${MAX_BATCH_ITEMS}。按文档标题拆开，每节单独 append。`);
  }
}

function parseGraphText(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const trimmed = String(text || '').trim();
    const cutOff = /Unterminated|Unexpected end|end of JSON/i.test(error.message) || !trimmed.endsWith('}');
    if (cutOff) {
      throw new Error(`图谱 JSON 在末尾被截断（${trimmed.length} 字符）。请分批调用，mode 设为 append，不要删关系来缩短。`);
    }
    throw new Error(`图谱不是合法 JSON：${error.message}`);
  }
}

function mergeGraphs(base, extra) {
  const out = {};
  GRAPH_KEYS.forEach((key) => {
    const byId = new Map();
    [...(base[key] || []), ...(extra[key] || [])].forEach((node) => {
      if (!node || !node.id) return;
      byId.set(String(node.id), { ...(byId.get(String(node.id)) || {}), ...node });
    });
    out[key] = [...byId.values()];
  });
  const seen = new Set();
  out.relationships = [];
  [...(base.relationships || []), ...(extra.relationships || [])].forEach((edge) => {
    if (!edge) return;
    const key = `${edge.from}|${edge.type}|${edge.to}|${edge.trigger || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.relationships.push(edge);
  });
  return out;
}

function graphFileInWorkspace(workspace, graphPath, cwd) {
  const file = path.resolve(cwd || workspace, graphPath);
  const root = path.resolve(workspace);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    throw new Error('图谱文件必须在产品工作目录里');
  }
  if (!fs.existsSync(file)) throw new Error(`找不到图谱文件 ${file}`);
  return file;
}

async function ingestToNeo4j(graph, { env = process.env, execute } = {}) {
  if (!env.NEO4J_URI || !env.NEO4J_USER || !env.NEO4J_PASSWORD) {
    return { configured: false, written: false, message: '未配置 NEO4J_URI、NEO4J_USER、NEO4J_PASSWORD。图谱已写入产品目录，没有连接 Neo4j。' };
  }
  const statements = cypherPlan(graph);
  const run = execute || defaultNeo4jExecute;
  try {
    await run(statements, env);
  } catch (error) {
    return { configured: true, written: false, message: `图谱文件已写入产品目录。Neo4j 写入失败：${error.message}` };
  }
  return { configured: true, written: true, message: '已幂等写入 Neo4j。' };
}

async function defaultNeo4jExecute(statements, env) {
  let neo4j;
  try {
    neo4j = require('neo4j-driver');
  } catch (error) {
    throw new Error('没有安装 neo4j-driver');
  }
  const driver = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD));
  const session = driver.session();
  try {
    for (const statement of statements) {
      await session.executeWrite((tx) => tx.run(statement.text, statement.params));
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

async function storeRequirementGraph({
  workspace,
  product,
  sourceFile,
  graph,
  graphPath,
  mode = 'replace',
  cwd,
  env,
  execute,
}) {
  let parsed;
  if (graphPath) {
    parsed = parseGraphText(fs.readFileSync(graphFileInWorkspace(workspace, graphPath, cwd), 'utf8'));
  } else if (typeof graph === 'string') {
    parsed = parseGraphText(graph);
  } else if (graph && typeof graph === 'object') {
    parsed = graph;
  } else {
    throw new Error('需要 graph 或 graphPath');
  }
  const rawText = graphPath ? null : (typeof graph === 'string' ? graph : null);
  assertBatchSize(rawText, parsed);
  if (mode === 'append') {
    const existing = readGraph(workspace);
    if (existing) parsed = mergeGraphs(existing, parsed);
  }
  const normalized = normalizeGraph(parsed);
  if (!normalized.ok) {
    const error = new Error(normalized.errors.join('\n'));
    error.errors = normalized.errors;
    throw error;
  }
  const document = {
    product,
    sourceFile: sourceFile || '',
    ...normalized.graph,
  };
  const dir = path.join(workspace, 'graph');
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, 'graph.json'), `${JSON.stringify(document, null, 2)}\n`);
  await fs.promises.writeFile(path.join(dir, 'index.md'), renderGraph(document));
  await fs.promises.writeFile(path.join(dir, 'ingest.cypher'), renderCypher(document));
  const neo4j = await ingestToNeo4j(document, { env, execute });
  const nodeCount = Object.keys(normalized.graph).filter((key) => key !== 'relationships')
    .reduce((sum, key) => sum + normalized.graph[key].length, 0);
  return {
    ok: true,
    dir,
    nodeCount,
    edgeCount: normalized.graph.relationships.length,
    excluded: normalized.excluded,
    neo4j,
  };
}

function queryRequirementGraph(graph, { featureId, featureName, scenarioId } = {}) {
  if (!graph) return { ok: false, message: '这个产品还没有图谱。先完成需求分析并写入图谱。' };
  if (scenarioId) return caseContext(graph, scenarioId);
  const matches = featureId ? [{ id: featureId }] : findFeatures(graph, featureName);
  if (!matches.length) return { ok: false, message: `没有找到功能 ${featureId || featureName || ''}`.trim() };
  return impactOf(graph, matches[0].id);
}

module.exports = {
  readGraph,
  ingestToNeo4j,
  storeRequirementGraph,
  queryRequirementGraph,
};
