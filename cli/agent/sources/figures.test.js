'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { storeRequirementGraph } = require('../graph/store');
const {
  parseFigureSections,
  readRequirementFigures,
  assertAnalysisStepFiguresRead,
  formatFigureResult,
  createVisionReader,
} = require('./figures');

const STALE = `# 需求

#### 系统管理

![image.png](https://alidocs2.oss-cn-zhangjiakou.aliyuncs.com/res/a/img/79cdf60f-ab8b-4121-b993-61440faaf68a.png?Expires=1&OSSAccessKeyId=old&Signature=old "")

系统管理重新设计账号和权限。

#### 物联

![a](https://alidocs2.oss-cn-zhangjiakou.aliyuncs.com/res/a/img/aaaa1111-1111-1111-1111-111111111111.png?Expires=1&Signature=old)
![b](https://alidocs2.oss-cn-zhangjiakou.aliyuncs.com/res/a/img/bbbb2222-2222-2222-2222-222222222222.png?Expires=1&Signature=old)

保留并优化。
`;

const FRESH = STALE
  .replaceAll('Signature=old', 'Signature=new')
  .replaceAll('Expires=1', 'Expires=9999999999');

function packWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-figures-'));
  const relative = 'knowledge/source-pack/docs/root.md';
  fs.mkdirSync(path.join(workspace, 'knowledge/source-pack/docs'), { recursive: true });
  fs.writeFileSync(path.join(workspace, relative), STALE);
  fs.writeFileSync(path.join(workspace, 'knowledge/source-pack/manifest.json'), `${JSON.stringify({
    nodes: [{ nodeId: 'node-root', path: relative, extension: 'adoc' }],
  }, null, 2)}\n`);
  return workspace;
}

test('an image belongs to the nearest heading, including the sentence after it', () => {
  const sections = parseFigureSections(STALE);
  const section = sections.find((item) => item.heading === '系统管理');
  assert.equal(section.images.length, 1);
  assert.equal(section.images[0].key, '79cdf60f-ab8b-4121-b993-61440faaf68a');
  assert.match(section.images[0].context, /系统管理/);
  assert.match(section.images[0].context, /重新设计账号和权限/);
});

test('a figure keeps the whole section, including the sentence after the next line', () => {
  const markdown = `#### 手动添加内部人员

点新增后填写表单。

![form](https://alidocs2.oss-cn-zhangjiakou.aliyuncs.com/res/a/img/cccc3333-3333-3333-3333-333333333333.png?Expires=1&Signature=old)

姓名为必填。
手机号为必填。
`;
  const section = parseFigureSections(markdown).find((item) => item.heading === '手动添加内部人员');
  assert.match(section.images[0].context, /点新增后填写表单/);
  assert.match(section.images[0].context, /手机号为必填/);
});

test('consecutive images stay on the same heading', () => {
  const section = parseFigureSections(STALE).find((item) => item.heading === '物联');
  assert.deepEqual(section.images.map((image) => image.key), [
    'aaaa1111-1111-1111-1111-111111111111',
    'bbbb2222-2222-2222-2222-222222222222',
  ]);
  assert.match(section.images[1].context, /保留并优化/);
});

test('reading a section uses a fresh signed url and does not store it', async () => {
  const workspace = packWorkspace();
  const seen = [];
  const result = await readRequirementFigures({
    workspace,
    heading: '系统管理',
    fetcher: { async fetch() { return { markdown: FRESH }; } },
    vision: async ({ url, heading, context }) => {
      seen.push({ url, heading, context });
      return '菜单：组织管理\n不一致：正文没写组织管理';
    },
  });
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /Signature=new/);
  assert.equal(seen[0].url.includes('Signature=old'), false);
  assert.match(seen[0].context, /重新设计账号和权限/);
  assert.equal(result.readings[0].reading.includes('组织管理'), true);
  const saved = fs.readFileSync(
    path.join(workspace, 'knowledge/source-pack/figures/79cdf60f-ab8b-4121-b993-61440faaf68a.json'),
    'utf8',
  );
  assert.equal(saved.includes('Signature'), false);
  assert.equal(saved.includes('Expires'), false);
  assert.match(formatFigureResult(result), /不一致/);
  assert.equal(formatFigureResult(result).includes('Signature'), false);
});

test('a cached figure is not sent to the vision model again', async () => {
  const workspace = packWorkspace();
  let calls = 0;
  const vision = async () => {
    calls += 1;
    return '字段：姓名';
  };
  const fetcher = { async fetch() { return { markdown: FRESH }; } };
  await readRequirementFigures({ workspace, heading: '物联', fetcher, vision });
  await readRequirementFigures({ workspace, heading: '物联', fetcher, vision });
  assert.equal(calls, 2);
});

test('the graph for a section is refused until its figures are read', async () => {
  const workspace = packWorkspace();
  const graph = { features: [{ id: 'FEAT_01', name: '系统管理' }], relationships: [] };
  await assert.rejects(
    () => storeRequirementGraph({
      workspace,
      product: '易训',
      sourceFile: 'knowledge/source-pack/manifest.json',
      graph,
      sectionHeading: '系统管理',
      env: {},
    }),
    /read_requirement_figures/,
  );
  await readRequirementFigures({
    workspace,
    heading: '系统管理',
    fetcher: { async fetch() { return { markdown: FRESH }; } },
    vision: async () => '菜单：组织管理',
  });
  const stored = await storeRequirementGraph({
    workspace,
    product: '易训',
    sourceFile: 'knowledge/source-pack/manifest.json',
    graph,
    sectionHeading: '系统管理',
    env: {},
  });
  assert.equal(stored.ok, true);
});

test('an analysis step cannot be completed while its figures are unread', () => {
  const workspace = packWorkspace();
  assert.throws(() => assertAnalysisStepFiguresRead(workspace, '系统管理'), /read_requirement_figures/);
  assert.doesNotThrow(() => assertAnalysisStepFiguresRead(workspace, 'knowledge'));
});

test('analysis instructions require the figure before the graph', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const skill = fs.readFileSync(path.join(root, '.pi/skills/opentest-qa/SKILL.md'), 'utf8');
  const prompt = fs.readFileSync(path.join(root, 'cli/agent/prompts/prd-analysis.md'), 'utf8');
  const system = fs.readFileSync(path.join(root, 'cli/agent/system-prompt.md'), 'utf8');
  const web = fs.readFileSync(path.join(root, 'lib/qa/web-session.ts'), 'utf8');
  assert.match(skill, /read_requirement_figures/);
  assert.match(skill, /不要选一边/);
  assert.match(prompt, /read_requirement_figures/);
  assert.match(prompt, /sectionHeading/);
  assert.match(system, /read_requirement_figures/);
  assert.match(web, /read_requirement_figures/);
});

test('vision request sends the live url and hides it when the model rejects it', async () => {
  const url = 'https://alidocs2.oss-cn-zhangjiakou.aliyuncs.com/res/a/img/abc.png?Expires=9&Signature=secret';
  const reader = createVisionReader({
    model: { direct: { baseUrl: 'https://api.example.test/', apiKey: 'sk-test' } },
    env: { OPENTEST_VISION_MODEL: 'Qwen/Qwen3-VL-8B-Instruct' },
    fetch: async (_endpoint, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.messages[0].content[1].image_url.url, url);
      assert.equal(init.headers.Authorization, 'Bearer sk-test');
      return { ok: false, status: 402, text: async () => 'not opened' };
    },
  });
  await assert.rejects(() => reader({ url, heading: '系统管理', context: '正文' }), (error) => {
    assert.match(error.message, /402/);
    assert.equal(error.message.includes('Signature'), false);
    assert.equal(error.message.includes('sk-test'), false);
    return true;
  });
});
