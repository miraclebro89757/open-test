'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { findDingTalkMcpUrl } = require('./dingtalk-mcp');
const { createDingTalkExcel, findDingTalkExcelMcpUrl, pickExcelTools, rowsFromMcp } = require('./dingtalk-excel');

function mcpDir(servers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-excel-mcp-'));
  fs.writeFileSync(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: servers }));
  return dir;
}

test('excel and docs MCP URLs stay on their own servers', () => {
  const dir = mcpDir({
    'dingtalk-excel': { type: 'streamable-http', url: 'https://mcp-gw.dingtalk.com/server/excel?key=e' },
    'dingtalk-doc': { type: 'streamable-http', url: 'https://mcp-gw.dingtalk.com/server/doc?key=d' },
  });
  const env = { PI_CODING_AGENT_DIR: dir, DINGTALK_DOC_MCP_URL: '', DINGTALK_EXCEL_MCP_URL: '' };
  assert.equal(findDingTalkMcpUrl(env), 'https://mcp-gw.dingtalk.com/server/doc?key=d');
  assert.equal(findDingTalkExcelMcpUrl(env), 'https://mcp-gw.dingtalk.com/server/excel?key=e');
});

test('docs finder does not take the excel gateway when it is listed first', () => {
  const dir = mcpDir({
    'dingtalk-excel': { url: 'https://mcp-gw.dingtalk.com/server/excel?key=e' },
  });
  assert.equal(findDingTalkMcpUrl({ PI_CODING_AGENT_DIR: dir, DINGTALK_DOC_MCP_URL: '' }), '');
});

test('excel finder reads DINGTALK_EXCEL_MCP_URL and the dingtalk-excel name', () => {
  assert.equal(
    findDingTalkExcelMcpUrl({ DINGTALK_EXCEL_MCP_URL: 'https://mcp-gw.dingtalk.com/server/env?key=x' }),
    'https://mcp-gw.dingtalk.com/server/env?key=x',
  );
  const named = mcpDir({ 钉钉表格: { url: 'https://mcp-gw.dingtalk.com/server/sheet?key=s' } });
  assert.equal(
    findDingTalkExcelMcpUrl({ PI_CODING_AGENT_DIR: named, DINGTALK_EXCEL_MCP_URL: '' }),
    'https://mcp-gw.dingtalk.com/server/sheet?key=s',
  );
});

test('picks the sheet tools used for personal-space write', () => {
  const picked = pickExcelTools([
    { name: 'create_workspace_sheet' },
    { name: 'get_all_sheets' },
    { name: 'table_put' },
    { name: 'table_get' },
    { name: 'create_filter' },
    { name: 'inspect' },
  ]);
  assert.equal(picked.createWorkspaceSheet, 'create_workspace_sheet');
  assert.equal(picked.tablePut, 'table_put');
  assert.equal(picked.tableGet, 'table_get');
});

test('create_workspace_sheet without a folder lands in personal space', async () => {
  const seen = [];
  const excel = createDingTalkExcel({
    async rpc(method, params) {
      if (method === 'tools/list') {
        return { tools: [{ name: 'create_workspace_sheet' }, { name: 'get_all_sheets' }, { name: 'table_put' }] };
      }
      seen.push({ method, params });
      if (params.name === 'create_workspace_sheet') {
        assert.equal(params.arguments.name, '易训用例');
        assert.equal(params.arguments.folderId, undefined);
        assert.equal(params.arguments.workspaceId, undefined);
        return { structuredContent: { nodeId: 'personal1', url: 'https://alidocs.dingtalk.com/i/nodes/personal1', title: '易训用例' } };
      }
      throw new Error(`unexpected ${params.name}`);
    },
  });
  const created = await excel.createWorkspaceSheet({ name: '易训用例' });
  assert.equal(created.nodeId, 'personal1');
  assert.match(created.url, /personal1/);
  assert.equal(seen[0].params.arguments.folderId, undefined);
});

test('parses get_range values and table_get sheets', () => {
  const fromRange = rowsFromMcp({
    structuredContent: {
      values: [['编号', '标题', '需求版本'], ['TC001', '打开巡检', 'V1.1.3']],
    },
  });
  assert.deepEqual(fromRange.columns, ['编号', '标题', '需求版本']);
  assert.equal(fromRange.rows[0][0], 'TC001');
  const fromTable = rowsFromMcp({
    structuredContent: {
      sheets: [{
        columns: ['编号', '标题', '需求版本'],
        data: [['TC002', '缺省页', 'V1.1.3']],
      }],
    },
  });
  assert.equal(fromTable.rows[0][0], 'TC002');
  assert.equal(fromTable.columns[2], '需求版本');
});
