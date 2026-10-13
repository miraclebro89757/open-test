'use strict';

const { createMcpHttpClient } = require('./mcp-http');
const { parseDingTalkRef } = require('./links');
const { asObject, isExcelServerName, readMcpServers, textFromMcp } = require('./mcp-config');

function isDocServerName(name) {
  if (isExcelServerName(name)) return false;
  return /钉钉文档|dingtalk-doc|dingtalk[_-]?docs?|doc.*dingtalk|dingtalk.*doc/i.test(name);
}

function findDingTalkMcpUrl(environment = process.env) {
  const fromEnv = environment.DINGTALK_DOC_MCP_URL?.trim();
  if (fromEnv) return fromEnv;
  for (const [name, entry] of Object.entries(readMcpServers(environment))) {
    if (!entry || typeof entry !== 'object') continue;
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (url && isDocServerName(name)) return url;
  }
  return '';
}

function scoreTool(tool, kind) {
  const hay = `${tool.name || ''} ${tool.description || ''}`.toLowerCase();
  if (kind === 'inspect') {
    if (/inspect|info|meta|文档信息|节点信息/.test(hay)) return 3;
    if (/get_doc|document/.test(hay) && !/fetch|content|正文/.test(hay)) return 2;
  }
  if (kind === 'fetch') {
    if (/fetch|content|正文|全文|read/.test(hay)) return 3;
    if (/get_doc|document/.test(hay)) return 2;
  }
  if (kind === 'search' && /search|搜索/.test(hay)) return 3;
  if (kind === 'list' && /list|folder|目录/.test(hay)) return 2;
  return 0;
}

function pickDocTools(tools) {
  const list = Array.isArray(tools) ? tools : [];
  const pick = (kind) => {
    let best = null;
    let bestScore = 0;
    for (const tool of list) {
      const score = scoreTool(tool, kind);
      if (score > bestScore) {
        best = tool.name;
        bestScore = score;
      }
    }
    return best || '';
  };
  return { inspect: pick('inspect'), fetch: pick('fetch'), search: pick('search'), list: pick('list') };
}

function inspectFromMcp(result, fallbackRef) {
  const payload = result?.structuredContent || asObject(result) || asObject(textFromMcp(result)) || result || {};
  const node = payload.result && typeof payload.result === 'object' ? payload.result : payload;
  const parsed = parseDingTalkRef(fallbackRef);
  const nodeId = node.nodeId || node.id || node.dentryUuid || node.fileId || parsed.nodeId || '';
  return {
    nodeId,
    url: node.url || node.documentUrl || (nodeId ? `https://alidocs.dingtalk.com/i/nodes/${nodeId}` : fallbackRef),
    title: node.title || node.name || nodeId,
    extension: node.extension || node.ext || (node.nodeType === 'folder' ? 'folder' : 'adoc'),
    nodeType: node.nodeType,
    revision: String(node.revision || node.version || node.contentVersion || ''),
    linkSourceInfo: node.linkSourceInfo,
    children: node.children,
    table: node.table,
  };
}

function fetchFromMcp(result, nodeId) {
  const payload = result?.structuredContent || asObject(result) || result || {};
  const node = payload.result && typeof payload.result === 'object' ? payload.result : payload;
  const markdown = node.markdown || node.content || textFromMcp(result) || '';
  return {
    nodeId: node.nodeId || nodeId,
    title: node.title || node.name || nodeId,
    markdown: typeof markdown === 'string' ? markdown : JSON.stringify(markdown, null, 2),
    revision: String(node.revision || node.version || ''),
    table: node.table || (Array.isArray(node.columns) ? { columns: node.columns, rows: node.rows || [] } : undefined),
  };
}

function callArgs(ref) {
  const parsed = parseDingTalkRef(ref);
  return {
    node: parsed.url || ref,
    url: parsed.url || ref,
    nodeId: parsed.nodeId || '',
    id: parsed.nodeId || '',
  };
}

function createDingTalkFetcher(options) {
  const rpc = options.rpc;
  if (typeof rpc !== 'function') throw new Error('需要 MCP rpc');
  let names = options.tools || null;

  async function tools() {
    if (names) return names;
    const listed = await rpc('tools/list', {});
    names = pickDocTools(listed?.tools || listed || []);
    return names;
  }

  async function call(kind, ref) {
    const picked = await tools();
    const name = picked[kind];
    if (!name) throw new Error(`钉钉文档 MCP 没有 ${kind} 工具`);
    return rpc('tools/call', { name, arguments: callArgs(ref) });
  }

  return {
    async inspect(ref) {
      return inspectFromMcp(await call('inspect', ref), ref);
    },
    async fetch(nodeId) {
      return fetchFromMcp(await call('fetch', nodeId), nodeId);
    },
    async listFolder(nodeId) {
      const picked = await tools();
      if (picked.list) {
        const result = await rpc('tools/call', { name: picked.list, arguments: callArgs(nodeId) });
        const payload = result?.structuredContent || asObject(textFromMcp(result)) || result || {};
        const children = payload.children || payload.nodes || payload.items || [];
        return children.map((child) => child.nodeId || child.id || child.url || child).filter(Boolean);
      }
      const info = await inspectFromMcp(await call('inspect', nodeId), nodeId);
      return (info.children || []).map((child) => child.nodeId || child.id || child).filter(Boolean);
    },
  };
}

async function createDingTalkFetcherFromConfig(environment = process.env) {
  const url = findDingTalkMcpUrl(environment);
  if (!url) {
    const error = new Error('没有找到钉钉文档 MCP。请在设置 → MCP 里粘贴官方钉钉文档的 Streamable HTTP 地址。');
    error.code = 'mcp-missing';
    throw error;
  }
  const client = createMcpHttpClient(url);
  await client.initialize();
  return createDingTalkFetcher({ rpc: (method, params) => client.request(method, params) });
}

module.exports = {
  asObject,
  createDingTalkFetcher,
  createDingTalkFetcherFromConfig,
  findDingTalkMcpUrl,
  isDocServerName,
  isExcelServerName,
  pickDocTools,
  readMcpServers,
  textFromMcp,
};
