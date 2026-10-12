'use strict';

const path = require('path');
const { parseDisposal } = require('./disposal');
const { sniffReferences } = require('./sniffer');
const { retrieveBaseline } = require('./retriever');
const {
  splitSections,
  sectionText,
  subtreeText,
  plainTitle,
  sameModule,
  conflictKey,
  detectVersion,
  extractRules,
} = require('./text');

const CONCRETE = /逾期|日\/周\/月|日：|周：|月：|失败|校验|111111|未激活|缺失|不允许|必须|置灰|唯一/;

function concreteRules(rules) {
  return rules.filter((rule) => CONCRETE.test(rule) && rule.length >= 12);
}

function sourceRef(file, heading) {
  const base = file ? path.basename(file) : '';
  return `${base}#${heading || ''}`.replace(/\s+/g, ' ').slice(0, 200);
}

function compileEvolution({
  baselineText,
  deltaText,
  baselineVersion,
  deltaVersion,
  baselineFile = '',
  deltaFile = '',
} = {}) {
  const baseVersion = baselineVersion || detectVersion(baselineText) || '';
  const nextVersion = deltaVersion || detectVersion(deltaText) || '';
  const disposal = parseDisposal(deltaText);
  const references = sniffReferences(deltaText);
  const conflictKeys = new Set(disposal.conflicts.map((item) => item.key));
  const skipped = [];
  const seenSkip = new Set();
  disposal.modules.forEach((item) => {
    if (conflictKeys.has(conflictKey(item.name))) return;
    if (item.action !== 'DEFER' && item.action !== 'DEPRECATE') return;
    if (seenSkip.has(item.name)) return;
    seenSkip.add(item.name);
    skipped.push({ name: item.name, action: item.action });
  });

  const clarifications = disposal.conflicts.map((item) => ({
    title: `${item.key}处置互相矛盾`,
    source: item.quotes.join('；'),
    understanding: `${item.key}在重构稿里同时出现 ${item.actions.join('、')}，未写入当前有效需求`,
  }));
  const deltaSections = splitSections(deltaText);
  const baselineSections = splitSections(baselineText);
  const effective = [];
  const lookups = [];

  function hasLocalRules(name) {
    return deltaSections.some((section) => {
      if (!sameModule(section.heading, name) && !section.heading.includes(name)) return false;
      return /必填|默认为|不允许|校验|失败|111111|未激活/.test(sectionText(section));
    });
  }

  function addFeature(feature) {
    const rules = [...new Set(feature.rules.map((rule) => String(rule || '').trim()).filter(Boolean))];
    if (!rules.length) return;
    const existing = effective.find((item) => item.title === feature.title);
    if (existing) {
      rules.forEach((rule) => {
        if (!existing.rules.includes(rule)) existing.rules.push(rule);
      });
      return;
    }
    effective.push({ ...feature, rules: rules.slice(0, 5) });
  }

  function blocked(name) {
    if (conflictKeys.has(conflictKey(name))) return true;
    const hit = disposal.modules.find((item) => sameModule(item.name, name) || conflictKey(item.name) === conflictKey(name));
    if (!hit) return false;
    return hit.action === 'DEFER' || hit.action === 'DEPRECATE' || conflictKeys.has(conflictKey(hit.name));
  }

  baselineSections.forEach((section, index) => {
    if (section.level !== 2) return;
    const name = plainTitle(section.heading);
    if (name.length < 2 || !String(deltaText).includes(name) || blocked(name) || hasLocalRules(name)) return;
    const rules = concreteRules(extractRules(subtreeText(baselineSections, index), [name.replace(/管理$/, ''), '逾期', '失败', '校验', '必须', '缺失']));
    lookups.push({ module: name, aspect: name, reason: 'thin' });
    addFeature({
      title: name,
      track: '回归',
      introducedIn: baseVersion,
      lastTouchedIn: nextVersion,
      sourceRef: sourceRef(baselineFile, section.heading),
      rules,
      origin: 'baseline',
    });
  });

  references.filter((item) => item.kind === 'BASELINE').forEach((ref) => {
    lookups.push({ module: ref.aspect, aspect: ref.aspect, reason: 'inherit' });
    const retrieved = retrieveBaseline(baselineText, { module: ref.aspect, aspect: ref.aspect });
    if (!retrieved.found) {
      clarifications.push({
        title: `${ref.aspect}在基线里没有定位到`,
        source: ref.sourceText,
        understanding: '重构稿写了继承，但基线没有对应细则',
      });
      return;
    }
    if (/沿用当前|沿用原有|沿用既有/.test(retrieved.text)) {
      clarifications.push({
        title: `${ref.aspect}仍指向更早文档`,
        source: ref.sourceText,
        understanding: '基线这段自己仍写沿用更早文档，当前版本包里没有更早的全文',
      });
    }
    const title = plainTitle(retrieved.heading) || ref.aspect;
    if (blocked(title)) return;
    addFeature({
      title,
      track: '回归',
      introducedIn: baseVersion,
      lastTouchedIn: nextVersion,
      sourceRef: sourceRef(baselineFile, retrieved.heading),
      rules: concreteRules(retrieved.rules),
      origin: 'baseline',
    });
  });

  deltaSections.forEach((section) => {
    const rules = extractRules(sectionText(section), ['111111', '未激活']).filter((rule) => /111111|未激活/.test(rule));
    if (!rules.length) return;
    const title = plainTitle(section.heading) || section.heading || '重构规则';
    if (blocked(title)) return;
    addFeature({
      title,
      track: '重构',
      introducedIn: nextVersion,
      lastTouchedIn: nextVersion,
      sourceRef: sourceRef(deltaFile, section.heading),
      rules,
      origin: 'delta',
    });
  });

  const gapSeen = new Set();
  disposal.modules.forEach((item) => {
    if (item.action !== 'PRESERVE' && item.action !== 'PRESERVE_OPTIMIZE') return;
    if (conflictKeys.has(conflictKey(item.name)) || gapSeen.has(item.name)) return;
    const covered = effective.some((feature) => sameModule(feature.title, item.name));
    if (covered || hasLocalRules(item.name)) return;
    gapSeen.add(item.name);
    clarifications.push({
      title: `${item.name}没有可执行规则`,
      source: item.evidence,
      understanding: `${item.name}标记为保留，但重构稿没有写出可执行规则，基线也没有同名章节`,
    });
  });

  return {
    baselineVersion: baseVersion,
    deltaVersion: nextVersion,
    dictionary: disposal.dictionary,
    modules: disposal.modules,
    skipped,
    conflicts: disposal.conflicts,
    references,
    lookups,
    effective,
    clarifications,
  };
}

function renderMerged(result, product) {
  const lines = [
    '# 当前有效需求',
    '',
    `- 产品：${product || ''}`,
    `- 基线：${result.baselineVersion || '未标明'}`,
    `- 重构：${result.deltaVersion || '未标明'}`,
    '',
    '图谱只收下面的生效规则。后置、下线，以及两边处置矛盾的模块不在这里。',
    '',
    '## 不纳入本版',
    '',
  ];
  if (!result.skipped.length) lines.push('没有明确后置或下线的模块。', '');
  result.skipped.forEach((item) => {
    lines.push(`- ${item.name}：${item.action === 'DEPRECATE' ? '下线' : '后置'}`);
  });
  lines.push('', '## 生效功能', '');
  result.effective.forEach((feature) => {
    lines.push(`### ${feature.title}`, '');
    lines.push(`- 轨道：${feature.track}`);
    lines.push(`- introducedIn：${feature.introducedIn}`);
    lines.push(`- lastTouchedIn：${feature.lastTouchedIn}`);
    lines.push(`- sourceRef：${feature.sourceRef}`, '');
    feature.rules.forEach((rule, index) => lines.push(`${index + 1}. ${rule}`));
    lines.push('');
  });
  return `${lines.join('\n').trim()}\n`;
}

module.exports = { compileEvolution, renderMerged, sourceRef };
