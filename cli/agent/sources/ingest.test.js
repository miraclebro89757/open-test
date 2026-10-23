'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ingestRequirementSources } = require('./ingest');
const { extractDingTalkLinks, parseDingTalkRef } = require('./links');

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-source-pack-'));
}

function catalogFetcher(nodes) {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const byUrl = new Map(nodes.filter((node) => node.url).map((node) => [node.url, node]));
  return {
    async inspect(ref) {
      const parsed = parseDingTalkRef(ref);
      const node = byUrl.get(ref) || byId.get(parsed.nodeId) || byId.get(ref);
      if (!node) {
        const error = new Error('没有这个节点');
        error.code = 'not-found';
        throw error;
      }
      if (node.error) {
        const error = new Error(node.error);
        error.code = node.error;
        throw error;
      }
      return {
        nodeId: node.nodeId,
        url: node.url || `https://alidocs.dingtalk.com/i/nodes/${node.nodeId}`,
        title: node.title,
        extension: node.extension,
        nodeType: node.nodeType,
        revision: node.revision || 'r1',
        linkSourceInfo: node.linkSourceInfo,
        children: node.children,
      };
    },
    async fetch(nodeId) {
      const node = byId.get(nodeId);
      if (!node) throw new Error('没有这个节点');
      return {
        nodeId,
        title: node.title,
        markdown: node.markdown || '',
        revision: node.revision || 'r1',
        table: node.table,
      };
    },
    async listFolder(nodeId) {
      const node = byId.get(nodeId);
      return node?.children || [];
    },
  };
}

test('parses node links and rejects share short links', () => {
  assert.deepEqual(parseDingTalkRef('https://alidocs.dingtalk.com/i/nodes/abc123').nodeId, 'abc123');
  assert.equal(parseDingTalkRef('https://alidocs.dingtalk.com/i/p/Y7kmbokZp3pgGLq2').kind, 'share');
  const links = extractDingTalkLinks('见 [子文档](https://alidocs.dingtalk.com/i/nodes/child01) 和 https://alidocs.dingtalk.com/i/p/short');
  assert.equal(links.some((item) => item.nodeId === 'child01'), true);
  assert.equal(links.some((item) => item.kind === 'share'), true);
});

test('ingests the root and its direct linked doc, not the grandchild', async () => {
  const root = workspace();
  const fetcher = catalogFetcher([
    {
      nodeId: 'root1',
      title: '筑安通需求',
      extension: 'adoc',
      markdown: '# 总览\n\n细则见 [人员导入](https://alidocs.dingtalk.com/i/nodes/child1)\n',
    },
    {
      nodeId: 'child1',
      title: '人员导入',
      extension: 'adoc',
      markdown: '字段见 [更深层](https://alidocs.dingtalk.com/i/nodes/grand1)\n',
    },
    {
      nodeId: 'grand1',
      title: '更深层',
      extension: 'adoc',
      markdown: '不该被采到',
    },
  ]);
  const result = await ingestRequirementSources({
    workspace: root,
    product: '易训',
    url: 'https://alidocs.dingtalk.com/i/nodes/root1',
    depth: 2,
    fetcher,
  });
  assert.equal(result.ingested, 2);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'source-pack', 'manifest.json'), 'utf8'));
  assert.equal(manifest.root.nodeId, 'root1');
  assert.equal(manifest.nodes.some((node) => node.nodeId === 'child1' && node.role === 'linked'), true);
  assert.equal(manifest.nodes.some((node) => node.nodeId === 'grand1' && node.role === 'root'), false);
  assert.equal(fs.existsSync(path.join(root, 'knowledge', 'source-pack', 'docs', 'root1.md')), true);
  assert.match(fs.readFileSync(path.join(root, 'knowledge', 'source-pack', 'docs', 'child1.md'), 'utf8'), /字段见/);
  assert.equal(fs.existsSync(path.join(root, 'knowledge', 'source-pack', 'docs', 'grand1.md')), false);
});

test('resolves a dlink to the target document', async () => {
  const root = workspace();
  const fetcher = catalogFetcher([
    {
      nodeId: 'root2',
      title: '主文档',
      extension: 'adoc',
      markdown: '[快捷方式](https://alidocs.dingtalk.com/i/nodes/shortcut1)\n',
    },
    {
      nodeId: 'shortcut1',
      title: '入口',
      extension: 'dlink',
      linkSourceInfo: { nodeId: 'real1', extension: 'adoc' },
    },
    {
      nodeId: 'real1',
      title: '真实文档',
      extension: 'adoc',
      markdown: '真实正文',
    },
  ]);
  const result = await ingestRequirementSources({
    workspace: root, product: '易训', url: 'https://alidocs.dingtalk.com/i/nodes/root2', fetcher,
  });
  assert.equal(result.ingested, 2);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'source-pack', 'manifest.json'), 'utf8'));
  assert.equal(manifest.nodes.some((node) => node.nodeId === 'real1' && node.role === 'linked'), true);
  assert.match(fs.readFileSync(path.join(root, 'knowledge', 'source-pack', 'docs', 'real1.md'), 'utf8'), /真实正文/);
});

test('share links, missing permission and tables stay in the pack without binaries', async () => {
  const root = workspace();
  const fetcher = catalogFetcher([
    {
      nodeId: 'root3',
      title: '主文档',
      extension: 'adoc',
      markdown: [
        '[分享](https://alidocs.dingtalk.com/i/p/shortKey)',
        '[表格](https://alidocs.dingtalk.com/i/nodes/sheet1)',
        '[模板](https://alidocs.dingtalk.com/i/nodes/xlsx1)',
        '[无权限](https://alidocs.dingtalk.com/i/nodes/secret1)',
      ].join('\n'),
    },
    {
      nodeId: 'sheet1',
      title: '字段表',
      extension: 'axls',
      table: { columns: ['字段', '说明'], rows: [['姓名', '必填']] },
    },
    { nodeId: 'xlsx1', title: '导入模板.xlsx', extension: 'xlsx' },
    { nodeId: 'secret1', title: '机密', extension: 'adoc', error: 'no-permission' },
  ]);
  const result = await ingestRequirementSources({
    workspace: root, product: '易训', url: 'https://alidocs.dingtalk.com/i/nodes/root3', fetcher,
  });
  assert.ok(result.unread >= 2);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'source-pack', 'manifest.json'), 'utf8'));
  assert.equal(manifest.nodes.find((node) => node.kind === 'share' || node.reason === 'share-link').role, 'unread');
  assert.equal(manifest.nodes.find((node) => node.nodeId === 'sheet1').role, 'attachment');
  assert.equal(manifest.nodes.find((node) => node.nodeId === 'xlsx1').role, 'attachment');
  const table = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'source-pack', 'tables', 'sheet1.json'), 'utf8'));
  assert.deepEqual(table.columns, ['字段', '说明']);
  assert.equal(fs.existsSync(path.join(root, 'knowledge', 'source-pack', 'docs', 'xlsx1.xlsx')), false);
  const review = fs.readFileSync(path.join(root, 'knowledge', '需求评审.md'), 'utf8');
  assert.match(review, /无权限|分享短链/);
  assert.match(review, /状态：待处理/);
});

test('lists a folder once and does not walk the rest of the wiki', async () => {
  const root = workspace();
  const fetcher = catalogFetcher([
    { nodeId: 'folder1', title: '需求空间', extension: 'folder', nodeType: 'folder', children: ['docA', 'nested'] },
    { nodeId: 'docA', title: 'A', extension: 'adoc', markdown: 'A 正文' },
    { nodeId: 'nested', title: '子文件夹', extension: 'folder', nodeType: 'folder', children: ['tooDeep'] },
    { nodeId: 'tooDeep', title: '不该出现', extension: 'adoc', markdown: '深层' },
  ]);
  await ingestRequirementSources({
    workspace: root, product: '易训', url: 'https://alidocs.dingtalk.com/i/nodes/folder1', depth: 2, fetcher,
  });
  assert.equal(fs.existsSync(path.join(root, 'knowledge', 'source-pack', 'docs', 'docA.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'knowledge', 'source-pack', 'docs', 'tooDeep.md')), false);
});

test('without a fetcher it asks for the dingTalk MCP', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-mcp-missing-'));
  await assert.rejects(
    () => ingestRequirementSources({
      workspace: workspace(),
      product: '易训',
      url: 'https://alidocs.dingtalk.com/i/nodes/root1',
      env: { PI_CODING_AGENT_DIR: dir, DINGTALK_DOC_MCP_URL: '' },
    }),
    /DingTalk document MCP/,
  );
});

test('keeps human clarification marks when ingesting again', async () => {
  const root = workspace();
  const fetcher = catalogFetcher([
    { nodeId: 'root4', title: '主文档', extension: 'adoc', markdown: '只有一页' },
  ]);
  fs.mkdirSync(path.join(root, 'knowledge'), { recursive: true });
  fs.writeFileSync(path.join(root, 'knowledge', '需求评审.md'), `# 需求评审

## 待澄清问题

### Q001 已有问题
- 状态：忽略
- 原文：旧问题
- Agent理解：旧理解
- 补充：
`);
  await ingestRequirementSources({
    workspace: root, product: '易训', url: 'https://alidocs.dingtalk.com/i/nodes/root4', fetcher,
  });
  const review = fs.readFileSync(path.join(root, 'knowledge', '需求评审.md'), 'utf8');
  assert.match(review, /状态：忽略/);
});
