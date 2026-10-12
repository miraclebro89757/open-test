'use strict';

function cleanText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]\(https?:\/\/[^)]*\)/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell
    .replace(/\*\*/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\u00a0/g, ' ')
    .trim());
}

function parseTables(markdown) {
  const tables = [];
  let current = null;
  String(markdown || '').split(/\n/).forEach((line) => {
    if (/^\s*\|/.test(line)) {
      if (!current) current = [];
      current.push(splitCells(line));
    } else if (current) {
      tables.push(current);
      current = null;
    }
  });
  if (current) tables.push(current);
  return tables;
}

function isSeparator(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')) || cell === '');
}

function splitSections(markdown) {
  const sections = [];
  let current = null;
  String(markdown || '').replace(/\u00a0/g, ' ').split(/\n/).forEach((line) => {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());
    if (heading) {
      if (current) sections.push(current);
      current = { level: heading[1].length, heading: heading[2].trim(), lines: [] };
      return;
    }
    if (!current) current = { level: 1, heading: '', lines: [] };
    current.lines.push(line);
  });
  if (current) sections.push(current);
  return sections;
}

function sectionText(section) {
  return section.lines.join('\n');
}

function subtreeText(sections, index) {
  const level = sections[index].level;
  const parts = [sections[index].heading, sectionText(sections[index])];
  for (let cursor = index + 1; cursor < sections.length; cursor += 1) {
    if (sections[cursor].level <= level) break;
    parts.push(sections[cursor].heading, sectionText(sections[cursor]));
  }
  return parts.join('\n');
}

function lastSegment(heading) {
  const parts = String(heading || '').split(/[-—–]/).map((item) => item.trim()).filter(Boolean);
  return (parts[parts.length - 1] || '').replace(/[：:]\s*$/, '').trim();
}

function plainTitle(heading) {
  return lastSegment(heading).replace(/^\d+(?:\.\d+)*\s*/, '').trim();
}

function normalizeName(name) {
  return String(name || '').replace(/\u00a0/g, '').replace(/\s+/g, '').replace(/[：:，,]/g, '');
}

function sameModule(a, b) {
  const left = normalizeName(lastSegment(a));
  const right = normalizeName(lastSegment(b));
  if (!left || !right) return false;
  if (left === right) return true;
  const coreA = left.replace(/管理$/, '');
  const coreB = right.replace(/管理$/, '');
  return coreA.length >= 2 && coreA === coreB;
}

function conflictKey(name) {
  const segment = normalizeName(lastSegment(name));
  return segment.replace(/管理$/, '') || segment;
}

function detectVersion(markdown) {
  const match = String(markdown || '').match(/产品版本\s*\|\s*\**\s*V?(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : '';
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STRONG_RULE = /逾期|日\/周\/月|日：|周：|月：|失败|校验|111111|未激活|缺失|不允许|必须/;

function extractRules(text, prefer = []) {
  const lines = cleanText(text).split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').replace(/^\|+\s*/, '').replace(/\s*\|+$/, '').trim())
    .filter((line) => line.length >= 6 && /[\u4e00-\u9fff]/.test(line) && !/^https?:/.test(line));
  const wanted = prefer.filter(Boolean);
  const preferred = wanted.length
    ? lines.filter((line) => wanted.some((word) => line.includes(word)))
    : lines;
  const pool = preferred.length ? preferred : lines;
  const strong = pool.filter((line) => STRONG_RULE.test(line));
  const source = strong.length ? strong : pool;
  source.sort((left, right) => rank(right, wanted) - rank(left, wanted));
  const seen = new Set();
  const rules = [];
  source.forEach((line) => {
    const short = line.slice(0, 160);
    if (seen.has(short)) return;
    seen.add(short);
    rules.push(short);
  });
  return rules.slice(0, 5);
}

function rank(line, prefer) {
  let score = STRONG_RULE.test(line) ? 5 : 0;
  prefer.forEach((word, index) => {
    if (line.includes(word)) score += 12 - Math.min(index, 9);
  });
  return score;
}

module.exports = {
  cleanText,
  parseTables,
  isSeparator,
  splitSections,
  sectionText,
  subtreeText,
  lastSegment,
  plainTitle,
  normalizeName,
  sameModule,
  conflictKey,
  detectVersion,
  escapeReg,
  extractRules,
};
