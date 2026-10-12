'use strict';

const { splitSections, normalizeName, escapeReg } = require('./text');

function looseIncludes(heading, target) {
  const host = normalizeName(heading);
  const needle = normalizeName(target);
  if (!host || !needle || needle.length < 2) return false;
  if (host.includes(needle)) return true;
  if (needle.length < 4) return false;
  const mid = Math.ceil(needle.length / 2);
  return new RegExp(`${escapeReg(needle.slice(0, mid))}.{0,6}${escapeReg(needle.slice(mid))}`).test(host);
}

function mentioned(target, headings) {
  const pieces = String(target || '').split(/[-—–/、]/).map((item) => item.trim()).filter((item) => item.length >= 2);
  const candidates = [target, ...pieces].map((item) => String(item).replace(/(字段|方案|配置|交互|逻辑)$/g, ''));
  return headings.some((heading) => candidates.some((candidate) => looseIncludes(heading, candidate)));
}

function sniffReferences(markdown) {
  const headings = splitSections(markdown).map((section) => section.heading).filter(Boolean);
  const refs = [];
  const seen = new Set();
  function add(ref) {
    const key = `${ref.kind}|${ref.sourceText}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  }
  const text = String(markdown || '');
  const inherit = /沿用(?:当前|原有|既有)([^，。\n]{0,80}?)(交互|逻辑|规范|流程)/g;
  let match = inherit.exec(text);
  while (match) {
    add({
      kind: 'BASELINE',
      operator: 'INHERIT',
      sourceText: match[0],
      aspect: `${match[1]}${match[2]}`.replace(/^方式/, ''),
      target: match[1],
    });
    match = inherit.exec(text);
  }
  const local = /(?:与|同)([^，。；\n：:]{2,40}?)(?:一致|(?<!不)相同)/g;
  match = local.exec(text);
  while (match) {
    const target = match[1].trim();
    const inDocument = mentioned(target, headings);
    add({
      kind: inDocument ? 'SAME_DOC' : 'BASELINE',
      operator: 'INHERIT',
      sourceText: match[0],
      aspect: target,
      target,
    });
    match = local.exec(text);
  }
  return refs;
}

module.exports = { sniffReferences };
