'use strict';

const fs = require('fs');
const path = require('path');
const { readSourcePack } = require('./ingest');

const PACK_DIR = path.join('knowledge', 'source-pack');
const IMAGE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)[^)]*\)/g;

function imageKey(url) {
  const file = String(url || '').split('?')[0].split('/').pop() || '';
  return file.replace(/\.[a-z0-9]+$/i, '') || file;
}

function normalizeHeading(value) {
  return String(value || '')
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function parseFigureSections(markdown) {
  const sections = [];
  let current = { heading: '文首', level: 0, blocks: [] };
  String(markdown || '').split(/\r?\n/).forEach((line) => {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current.blocks.length || current.heading !== '文首') sections.push(current);
      current = {
        heading: heading[2].replace(/\*\*/g, '').trim(),
        level: heading[1].length,
        blocks: [],
      };
      return;
    }
    const pattern = new RegExp(IMAGE.source, 'g');
    let matched = false;
    let last = 0;
    let found;
    while ((found = pattern.exec(line))) {
      matched = true;
      const before = line.slice(last, found.index).trim();
      if (before) current.blocks.push({ type: 'text', text: before });
      current.blocks.push({
        type: 'image',
        alt: found[1],
        url: found[2],
        key: imageKey(found[2]),
      });
      last = found.index + found[0].length;
    }
    const rest = (matched ? line.slice(last) : line).trim();
    if (rest) current.blocks.push({ type: 'text', text: rest });
  });
  if (current.blocks.length || current.heading !== '文首') sections.push(current);
  return sections.map(withImageContext);
}

function withImageContext(section) {
  const text = section.blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
  const context = [section.heading, text].filter(Boolean).join('\n').slice(0, 2000);
  const images = section.blocks.filter((block) => block.type === 'image').map((block) => ({
    alt: block.alt,
    url: block.url,
    key: block.key,
    context,
  }));
  return {
    heading: section.heading,
    level: section.level,
    text,
    images,
  };
}

function findSection(sections, heading) {
  const wanted = normalizeHeading(heading);
  if (!wanted) return null;
  const exact = sections.filter((section) => normalizeHeading(section.heading) === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`Heading "${heading}" matches more than one section. Pass the full heading.`);
  const partial = sections.filter((section) => {
    const name = normalizeHeading(section.heading);
    return name.length > 1 && (name.includes(wanted) || wanted.includes(name));
  });
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`Heading "${heading}" matches more than one section. Pass the full heading.`);
  return null;
}

function loadPackDocuments(workspace) {
  const pack = readSourcePack(workspace);
  if (!pack) return [];
  return (pack.nodes || [])
    .filter((node) => node && node.path && String(node.path).endsWith('.md'))
    .map((node) => ({
      nodeId: node.nodeId,
      path: node.path,
      markdown: fs.readFileSync(path.join(workspace, node.path), 'utf8'),
    }));
}

function figureFile(workspace, key) {
  const safe = String(key || '').replace(/[^a-zA-Z0-9._-]/g, '');
  return path.join(workspace, PACK_DIR, 'figures', `${safe}.json`);
}

function readFigureNote(workspace, key) {
  const file = figureFile(workspace, key);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const note = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!note || !note.reading) return null;
    return note;
  } catch {
    return null;
  }
}

function writeFigureNote(workspace, note) {
  const file = figureFile(workspace, note.key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stored = {
    key: note.key,
    heading: note.heading,
    context: note.context,
    reading: note.reading,
    readAt: note.readAt,
  };
  fs.writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`);
}

function freshUrlByKey(markdown) {
  const urls = new Map();
  parseFigureSections(markdown).forEach((section) => {
    section.images.forEach((image) => urls.set(image.key, image.url));
  });
  return urls;
}

async function readSectionFigures({ workspace, markdown, freshMarkdown, heading, vision }) {
  const section = findSection(parseFigureSections(markdown), heading);
  if (!section) throw new Error(`The source pack has no section: ${heading}`);
  const urls = freshUrlByKey(freshMarkdown || markdown);
  const readings = [];
  for (const image of section.images) {
    const cached = readFigureNote(workspace, image.key);
    if (cached) {
      readings.push(cached);
      continue;
    }
    const url = urls.get(image.key);
    if (!url) throw new Error(`Figure ${image.key} did not get a fresh temporary URL. Collect this DingTalk document again, then read it.`);
    if (typeof vision !== 'function') throw new Error('The current model cannot read images. Set OPENTEST_VISION_MODEL, then read this section.');
    const reading = String(await vision({
      url,
      heading: section.heading,
      context: image.context,
      alt: image.alt,
    }) || '').trim();
    if (!reading) throw new Error(`Figure ${image.key} produced no reading.`);
    const note = {
      key: image.key,
      heading: section.heading,
      context: image.context,
      reading,
      readAt: new Date().toISOString(),
    };
    writeFigureNote(workspace, note);
    readings.push(note);
  }
  return { heading: section.heading, readings };
}

async function readRequirementFigures({ workspace, heading, fetcher, vision }) {
  const docs = loadPackDocuments(workspace);
  if (!docs.length) throw new Error('There is no requirement source pack. Collect the DingTalk document, or analyze a local file that has no figures.');
  const doc = docs.find((item) => findSection(parseFigureSections(item.markdown), heading));
  if (!doc) throw new Error(`The source pack has no section: ${heading}`);
  const section = findSection(parseFigureSections(doc.markdown), heading);
  const pending = section.images.filter((image) => !readFigureNote(workspace, image.key));
  let freshMarkdown = doc.markdown;
  if (pending.length) {
    if (!fetcher || typeof fetcher.fetch !== 'function') {
      throw new Error('This section has figures, but there is no DingTalk connection, so their temporary URLs cannot be refreshed.');
    }
    const fresh = await fetcher.fetch(doc.nodeId);
    freshMarkdown = fresh && fresh.markdown;
    if (!freshMarkdown) throw new Error('DingTalk did not return this document, so the figure URLs could not be refreshed.');
  }
  return readSectionFigures({
    workspace,
    markdown: doc.markdown,
    freshMarkdown,
    heading,
    vision,
  });
}

function assertSectionFiguresRead(workspace, heading) {
  const docs = loadPackDocuments(workspace);
  if (!docs.length) return;
  const unreadHeadings = [];
  docs.forEach((doc) => {
    parseFigureSections(doc.markdown).forEach((section) => {
      section.images.forEach((image) => {
        if (!readFigureNote(workspace, image.key)) unreadHeadings.push(section.heading);
      });
    });
  });
  if (!unreadHeadings.length) return;
  if (!heading) {
    const count = new Set(unreadHeadings).size;
    throw new Error(`${count} sections still have unread figures. Call read_requirement_figures with sectionHeading before writing the graph.`);
  }
  const matches = docs
    .map((doc) => findSection(parseFigureSections(doc.markdown), heading))
    .filter(Boolean);
  if (!matches.length) throw new Error(`The source pack has no section: ${heading}`);
  const missing = matches.reduce((sum, section) => (
    sum + section.images.filter((image) => !readFigureNote(workspace, image.key)).length
  ), 0);
  if (missing) {
    throw new Error(`"${matches[0].heading}" still has ${missing} unread figures. Call read_requirement_figures. Read the figures with the text before writing this section of the graph.`);
  }
}

function assertAnalysisStepFiguresRead(workspace, step) {
  const docs = loadPackDocuments(workspace);
  if (!docs.length || !String(step || '').trim()) return;
  const matches = docs
    .map((doc) => findSection(parseFigureSections(doc.markdown), step))
    .filter(Boolean);
  if (!matches.length) return;
  const missing = matches.reduce((sum, section) => (
    sum + section.images.filter((image) => !readFigureNote(workspace, image.key)).length
  ), 0);
  if (missing) {
    throw new Error(`"${matches[0].heading}" still has ${missing} unread figures. Call read_requirement_figures. Read the figures with the text before completing this section.`);
  }
}

function formatFigureResult(result) {
  if (!result.readings.length) return `「${result.heading}」这一节没有图。可以写图谱。`;
  const lines = [`已结合正文读完「${result.heading}」的 ${result.readings.length} 张图。`];
  result.readings.forEach((note) => {
    lines.push(`图 ${note.key}：`);
    lines.push(note.reading);
  });
  lines.push('图上有、正文没有的菜单、字段、按钮、列和空态写入这一节图谱，来源记这张图。出现「不一致」时追加一条待澄清，原文和 Agent理解两边都留下，不要选一边。然后带 sectionHeading 调用 store_requirement_graph。');
  return lines.join('\n');
}

function visionPrompt(heading, context) {
  return [
    '你在看需求文档里的一张图。它属于下面这个标题，是这段需求的页面排版或示意图。',
    `标题：${heading || ''}`,
    `紧挨着的正文：${context || ''}`,
    '只写图里看得到的内容：',
    '- 菜单、字段、按钮、列表列、空态、标注',
    '- 正文没写、图上有的',
    '- 图和正文不一致时，单独一行以「不一致：」开头，两边都写上',
    '不要编造图里没有的东西，不要复述图片地址。',
  ].join('\n');
}

function createVisionReader({ model, env = process.env, fetch: fetchImpl = globalThis.fetch, readModel } = {}) {
  return async function readFigure({ url, heading, context }) {
    const info = model || (readModel || require('../pi-config').readPiModel)({ env });
    const direct = info && info.direct;
    if (!direct || !direct.baseUrl || !direct.apiKey) {
      throw new Error('No model address is available, so the figure cannot be read.');
    }
    const visionModel = String(env.OPENTEST_VISION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct').trim();
    const endpoint = `${String(direct.baseUrl).replace(/\/$/, '')}/v1/chat/completions`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${direct.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: visionPrompt(heading, context) },
            { type: 'image_url', image_url: { url } },
          ],
        }],
      }),
    });
    if (!response.ok) {
      throw new Error(`Reading the figure failed (${response.status}). Vision model ${visionModel} did not see it. Confirm the account can use that model, or set OPENTEST_VISION_MODEL.`);
    }
    const payload = await response.json();
    const text = payload && payload.choices && payload.choices[0] && payload.choices[0].message
      && payload.choices[0].message.content;
    const reading = typeof text === 'string' ? text.trim() : '';
    if (!reading) throw new Error(`Vision model ${visionModel} returned no reading.`);
    return reading;
  };
}

module.exports = {
  parseFigureSections,
  readSectionFigures,
  readRequirementFigures,
  assertSectionFiguresRead,
  assertAnalysisStepFiguresRead,
  formatFigureResult,
  createVisionReader,
};
