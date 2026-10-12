'use strict';

const {
  splitSections,
  sectionText,
  subtreeText,
  lastSegment,
  sameModule,
  extractRules,
} = require('./text');

function keywordsFrom(moduleName, aspect) {
  const source = `${moduleName || ''}${aspect || ''}`;
  const words = new Set();
  ['巡检', '导入', '人员', '作业', '花名册', '逾期', '密码', '班组'].forEach((word) => {
    if (source.includes(word)) words.add(word);
  });
  if (/日[/／]周[/／]月|日周月/.test(source)) {
    words.add('日/周/月');
    words.add('逾期');
    words.add('巡检');
  }
  const plain = String(aspect || '')
    .replace(/沿用|当前|原有|既有|方式|交互|逻辑|规范|流程|模板|下载|填充|上传|解析/g, '')
    .replace(/[^\u4e00-\u9fff]/g, '');
  if (plain.length >= 2 && plain.length <= 12) words.add(plain);
  return [...words];
}

function retrieveBaseline(markdown, { module = '', aspect = '' } = {}) {
  const sections = splitSections(markdown);
  const keys = keywordsFrom(module, aspect);
  let best = { score: 0, index: -1 };
  sections.forEach((section, index) => {
    const own = `${section.heading}\n${sectionText(section)}`;
    let score = 0;
    if (section.level === 1 && !(module && sameModule(section.heading, module))) score -= 20;
    if (module && (sameModule(section.heading, module) || section.heading.includes(module))) score += 8;
    keys.forEach((word) => {
      if (section.heading.includes(word)) score += 5;
      const hits = own.split(word).length - 1;
      score += Math.min(hits, 4) * (word === '导入' || word === '逾期' ? 2 : 1);
    });
    if (score > best.score) best = { score, index };
  });
  if (best.index < 0 || best.score < 5) return { found: false, heading: '', rules: [], text: '' };
  const heading = sections[best.index].heading;
  const text = subtreeText(sections, best.index);
  const prefer = [...keys, '逾期', '缺失', '失败', '校验'];
  const rules = extractRules(text, prefer);
  return { found: rules.length > 0, heading, rules, text };
}

module.exports = { retrieveBaseline };
