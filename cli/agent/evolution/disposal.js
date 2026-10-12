'use strict';

const { parseTables, isSeparator, conflictKey } = require('./text');

const DICTIONARY = {
  保留: 'PRESERVE',
  优化: 'OPTIMIZE',
  合并: 'MERGE',
  后置: 'DEFER',
  下线: 'DEPRECATE',
};

const PHRASES = [
  ['保留并优化', 'PRESERVE_OPTIMIZE'],
  ['后置迭代', 'DEFER'],
  ['后置重构', 'DEFER'],
  ['后置', 'DEFER'],
  ['下线', 'DEPRECATE'],
  ['无变动', 'PRESERVE'],
  ['合并', 'MERGE'],
  ['完全重构', 'OPTIMIZE'],
  ['重构', 'OPTIMIZE'],
  ['优化', 'OPTIMIZE'],
  ['保留', 'PRESERVE'],
];

function phraseAction(phrase) {
  const text = String(phrase || '').replace(/\s+/g, '').trim();
  if (!text || text.length > 40) return '';
  if (!/保留|优化|合并|后置|下线|重构|无变动/.test(text)) return '';
  const found = PHRASES.find(([word]) => text.includes(word));
  return found ? found[1] : '';
}

function parseDisposal(markdown) {
  const dictionary = {};
  const modules = [];
  parseTables(markdown).forEach((table) => {
    const header = table[0] || [];
    const dictionaryTable = header.some((cell) => cell.includes('处置方式'));
    table.forEach((cells, index) => {
      if (index === 0 || isSeparator(cells)) return;
      if (dictionaryTable) {
        const word = cells[0].replace(/\s/g, '');
        if (DICTIONARY[word]) dictionary[word] = DICTIONARY[word];
        return;
      }
      const actionCell = cells.find((cell) => cell.length <= 12 && phraseAction(cell));
      if (!actionCell) return;
      const name = cells[0].replace(/\s+/g, '');
      if (!name || name === actionCell.replace(/\s+/g, '') || name.length > 20) return;
      if (phraseAction(name) && name.length <= 8) return;
      modules.push({
        name,
        action: phraseAction(actionCell),
        phrase: actionCell,
        evidence: cells.filter(Boolean).join(' | '),
      });
    });
  });

  String(markdown || '').split(/\n/).forEach((line) => {
    const match = /^(#{2,6})\s+(.+)$/.exec(line.trim());
    if (!match) return;
    const parts = match[2].trim().split(/\s*\u2014{2,}\s*/);
    if (parts.length < 2) return;
    const name = parts[0].replace(/^\d+(?:\.\d+)*\s*/, '').trim();
    const phrase = parts.slice(1).join('');
    const action = phraseAction(phrase);
    if (!name || !action) return;
    modules.push({ name, action, phrase, evidence: line.trim() });
  });

  const groups = new Map();
  modules.forEach((item) => {
    const key = conflictKey(item.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const conflicts = [];
  groups.forEach((items, key) => {
    const actions = [...new Set(items.map((item) => item.action))];
    if (actions.length < 2) return;
    conflicts.push({
      key,
      name: items[0].name,
      actions,
      quotes: items.map((item) => item.evidence),
    });
  });
  return { dictionary, modules, conflicts };
}

module.exports = { parseDisposal, phraseAction };
