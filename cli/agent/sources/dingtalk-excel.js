'use strict';

const { createMcpHttpClient } = require('./mcp-http');
const { asObject, isExcelServerName, readMcpServers, textFromMcp } = require('./mcp-config');
const { parseDingTalkRef } = require('./links');

function findDingTalkExcelMcpUrl(environment = process.env) {
  const fromEnv = environment.DINGTALK_EXCEL_MCP_URL?.trim();
  if (fromEnv) return fromEnv;
  for (const [name, entry] of Object.entries(readMcpServers(environment))) {
    if (!entry || typeof entry !== 'object') continue;
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (url && isExcelServerName(name)) return url;
  }
  return '';
}

function pickExcelTools(tools) {
  const names = new Set((Array.isArray(tools) ? tools : []).map((tool) => tool && tool.name).filter(Boolean));
  const has = (name) => (names.has(name) ? name : '');
  return {
    createWorkspaceSheet: has('create_workspace_sheet'),
    createSheet: has('create_sheet'),
    getAllSheets: has('get_all_sheets'),
    getSheet: has('get_sheet'),
    getRange: has('get_range'),
    tableGet: has('table_get'),
    tablePut: has('table_put'),
    updateRange: has('update_range'),
    clearRange: has('clear_range'),
    createFilter: has('create_filter'),
  };
}

function payloadOf(result) {
  return result?.structuredContent || asObject(result) || asObject(textFromMcp(result)) || result || {};
}

function unwrap(result) {
  const payload = payloadOf(result);
  if (payload.result && typeof payload.result === 'object') return payload.result;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  return payload;
}

function sheetNodeFromMcp(result, fallbackName) {
  const node = unwrap(result);
  const nodeId = node.nodeId || node.dentryUuid || node.id || node.dentryId || '';
  const url = node.url || node.documentUrl || node.nodeUrl || (nodeId ? `https://alidocs.dingtalk.com/i/nodes/${nodeId}` : '');
  return {
    nodeId,
    url,
    title: node.title || node.name || fallbackName || nodeId,
  };
}

function sheetsFromMcp(result) {
  const node = unwrap(result);
  const list = node.sheets || node.value || node.items || (Array.isArray(node) ? node : []);
  return (Array.isArray(list) ? list : []).map((sheet) => ({
    id: String(sheet.id || sheet.sheetId || sheet.name || ''),
    name: String(sheet.name || sheet.title || sheet.id || ''),
  })).filter((sheet) => sheet.id);
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.value === 'string' || typeof value.value === 'number') return String(value.value);
    if (typeof value.displayValue === 'string') return value.displayValue;
  }
  return String(value);
}

function matrixFrom(value) {
  return Array.isArray(value) ? value.map((row) => (Array.isArray(row) ? row.map(cellText) : [])) : [];
}

function rowsFromMcp(result) {
  const node = unwrap(result);
  const sheet = Array.isArray(node.sheets) && node.sheets[0] && typeof node.sheets[0] === 'object' ? node.sheets[0] : node;
  if (Array.isArray(sheet.columns) && Array.isArray(sheet.data)) {
    return {
      columns: sheet.columns.map((column) => cellText(column)),
      rows: matrixFrom(sheet.data),
    };
  }
  const values = sheet.values || sheet.displayValues || node.values || node.displayValues || node.cells || [];
  const matrix = matrixFrom(values);
  if (Array.isArray(sheet.data) && !matrix.length) {
    const data = matrixFrom(sheet.data);
    return { columns: data[0] || [], rows: data.slice(1) };
  }
  return { columns: matrix[0] || [], rows: matrix.slice(1) };
}

function colLetter(index) {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function rangeAddress(columns, rowCount) {
  return `A1:${colLetter(Math.max(columns, 1) - 1)}${Math.max(rowCount, 1)}`;
}

function createDingTalkExcel(options) {
  const rpc = options.rpc;
  if (typeof rpc !== 'function') throw new Error('需要 MCP rpc');
  let names = options.tools || null;

  async function tools() {
    if (names) return names;
    const listed = await rpc('tools/list', {});
    names = pickExcelTools(listed?.tools || listed || []);
    return names;
  }

  async function call(kind, args) {
    const picked = await tools();
    const name = picked[kind];
    if (!name) throw new Error(`钉钉表格 MCP 没有 ${kind} 工具`);
    return rpc('tools/call', { name, arguments: args });
  }

  return {
    async createWorkspaceSheet({ name }) {
      const result = await call('createWorkspaceSheet', { name });
      return sheetNodeFromMcp(result, name);
    },
    async listSheets(nodeId) {
      return sheetsFromMcp(await call('getAllSheets', { nodeId }));
    },
    async ensureSheet(nodeId, name) {
      const listed = await this.listSheets(nodeId);
      const byName = listed.find((sheet) => sheet.name === name);
      if (byName) return byName;
      if (listed.length === 1) return listed[0];
      const created = unwrap(await call('createSheet', { nodeId, name }));
      const id = created.id || created.sheetId || created.name || name;
      return { id: String(id), name: String(created.name || created.title || name) };
    },
    async readTable(nodeId, sheetId) {
      const picked = await tools();
      if (picked.getRange) {
        const parsed = rowsFromMcp(await call('getRange', { nodeId, sheetId }));
        if (parsed.columns.length || parsed.rows.length) return parsed;
      }
      if (picked.tableGet) return rowsFromMcp(await call('tableGet', { nodeId, sheetId }));
      throw new Error('钉钉表格 MCP 没有读取工具');
    },
    async writeTable(nodeId, sheetId, { columns, rows, name }) {
      const picked = await tools();
      const data = (rows || []).map((row) => (columns || []).map((_, index) => cellText(row[index])));
      const values = [columns.map(cellText), ...data];
      if (picked.tablePut) {
        try {
          await call('tablePut', {
            nodeId,
            sheets: [{
              sheetId,
              name: name || '用例',
              columns,
              data,
              mode: 'overwrite',
              header: true,
              startCell: 'A1',
            }],
          });
        } catch {
          // Some workbooks reject the dataframe write; fall back to a range update.
        }
      }
      if (!picked.updateRange) {
        if (!picked.tablePut) throw new Error('钉钉表格 MCP 没有写入工具');
        return;
      }
      await call('updateRange', {
        nodeId,
        sheetId,
        rangeAddress: rangeAddress(columns.length, values.length),
        values,
        wordWrap: 'autoWrap',
      });
    },
    async createFilter(nodeId, sheetId, range) {
      const picked = await tools();
      if (!picked.createFilter) return;
      try {
        await call('createFilter', { nodeId, sheetId, range });
      } catch {
        // A filter may already exist on a previously bound sheet.
      }
    },
  };
}

async function createDingTalkExcelFromConfig(environment = process.env) {
  const url = findDingTalkExcelMcpUrl(environment);
  if (!url) {
    const error = new Error('没有找到钉钉表格 MCP。请在设置 → MCP 里添加名为 dingtalk-excel 的官方钉钉表格地址。');
    error.code = 'mcp-missing';
    throw error;
  }
  const client = createMcpHttpClient(url);
  await client.initialize();
  return createDingTalkExcel({ rpc: (method, params) => client.request(method, params) });
}

function nodeIdFromRef(value) {
  return parseDingTalkRef(value).nodeId || '';
}

module.exports = {
  createDingTalkExcel,
  createDingTalkExcelFromConfig,
  findDingTalkExcelMcpUrl,
  nodeIdFromRef,
  pickExcelTools,
  rangeAddress,
  rowsFromMcp,
};
