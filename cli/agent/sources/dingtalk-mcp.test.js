'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDingTalkFetcher, findDingTalkMcpUrl, pickDocTools } = require('./dingtalk-mcp');
const { createMcpHttpClient } = require('./mcp-http');

test('reads the dingTalk docs MCP URL from mcp.json or the environment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-mcp-'));
  fs.writeFileSync(path.join(dir, 'mcp.json'), JSON.stringify({
    mcpServers: {
      filesystem: { command: 'npx', args: ['-y', 'foo'] },
      钉钉文档: { type: 'streamable-http', url: 'https://mcp-gw.dingtalk.com/server/abc?key=secret' },
    },
  }));
  assert.equal(
    findDingTalkMcpUrl({ PI_CODING_AGENT_DIR: dir, DINGTALK_DOC_MCP_URL: '' }),
    'https://mcp-gw.dingtalk.com/server/abc?key=secret',
  );
  assert.equal(
    findDingTalkMcpUrl({ DINGTALK_DOC_MCP_URL: 'https://mcp-gw.dingtalk.com/server/env?key=e' }),
    'https://mcp-gw.dingtalk.com/server/env?key=e',
  );
});

test('picks inspect and fetch tools from a mixed catalog', () => {
  const picked = pickDocTools([
    { name: 'search', description: 'search documents by title' },
    { name: 'doc_inspect', description: 'inspect a node' },
    { name: 'doc_fetch', description: 'fetch full document text' },
    { name: 'comment_create', description: 'add a comment' },
  ]);
  assert.equal(picked.inspect, 'doc_inspect');
  assert.equal(picked.fetch, 'doc_fetch');
  assert.equal(picked.search, 'search');
});

test('inspect and fetch map MCP payloads onto source nodes', async () => {
  const fetcher = createDingTalkFetcher({
    async rpc(method, params) {
      if (method === 'tools/list') {
        return {
          tools: [
            { name: 'inspect', description: 'inspect' },
            { name: 'fetch', description: 'fetch' },
          ],
        };
      }
      if (method === 'tools/call' && params.name === 'inspect') {
        return {
          structuredContent: {
            nodeId: 'n1',
            title: '人员导入',
            extension: 'dlink',
            linkSourceInfo: { nodeId: 'real', extension: 'adoc' },
          },
        };
      }
      if (method === 'tools/call' && params.name === 'fetch') {
        return { content: [{ type: 'text', text: '# 人员导入\n字段必填' }] };
      }
      throw new Error(`unexpected ${method}`);
    },
  });
  const info = await fetcher.inspect('https://alidocs.dingtalk.com/i/nodes/n1');
  assert.equal(info.extension, 'dlink');
  assert.equal(info.linkSourceInfo.nodeId, 'real');
  const doc = await fetcher.fetch('real');
  assert.match(doc.markdown, /字段必填/);
});

test('MCP HTTP client sends json-rpc and reuses the session header', async () => {
  const seen = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    seen.push({ method: body.method, session: options.headers['mcp-session-id'] || options.headers['Mcp-Session-Id'] });
    return {
      ok: true,
      headers: { get: (name) => (name.toLowerCase() === 'mcp-session-id' ? 'sess-9' : null) },
      async json() {
        if (body.method === 'initialize') {
          return { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'doc' } } };
        }
        return { jsonrpc: '2.0', id: body.id, result: { tools: [] } };
      },
    };
  };
  const client = createMcpHttpClient('https://mcp-gw.dingtalk.com/server/x?key=k', { fetch: fetchImpl });
  await client.initialize();
  await client.request('tools/list', {});
  assert.equal(seen[0].method, 'initialize');
  assert.equal(seen[1].method, 'notifications/initialized');
  assert.equal(seen[2].session, 'sess-9');
});
