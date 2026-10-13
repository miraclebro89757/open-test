'use strict';

const SHARE_PATTERN = /alidocs\.dingtalk\.com\/i\/p\/([^/?#\s)]+)/i;
const NODE_PATTERN = /alidocs\.dingtalk\.com\/i\/nodes\/([^/?#\s)&]+)/i;
const DENTRY_PATTERN = /[?&]dentryKey=([^&#\s)]+)/i;
const MARKDOWN_LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const BARE_URL = /https?:\/\/[^\s)]+/g;

function parseDingTalkRef(value) {
  const text = String(value || '').trim();
  if (!text) return { kind: 'unknown', raw: text };
  const share = SHARE_PATTERN.exec(text);
  if (share) return { kind: 'share', nodeId: '', url: text, shortKey: share[1] };
  const node = NODE_PATTERN.exec(text);
  if (node) return { kind: 'node', nodeId: decodeURIComponent(node[1]), url: text };
  const dentry = DENTRY_PATTERN.exec(text);
  if (dentry && /alidocs\.dingtalk\.com/i.test(text)) {
    return { kind: 'node', nodeId: decodeURIComponent(dentry[1]), url: text };
  }
  if (!/^https?:/i.test(text) && !text.includes('/') && /^[A-Za-z0-9_-]+$/.test(text)) {
    return { kind: 'node', nodeId: text, url: `https://alidocs.dingtalk.com/i/nodes/${text}` };
  }
  return { kind: 'unknown', nodeId: text, url: text };
}

function extractDingTalkLinks(markdown) {
  const text = String(markdown || '');
  const found = [];
  const seen = new Set();
  const add = (url, title) => {
    const parsed = parseDingTalkRef(url);
    if (parsed.kind === 'unknown') return;
    const key = parsed.nodeId || parsed.url || url;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ ...parsed, url: parsed.url || url, title: title || '' });
  };
  for (const match of text.matchAll(MARKDOWN_LINK)) add(match[2], match[1]);
  for (const match of text.matchAll(BARE_URL)) {
    if (text[match.index - 1] === '(') continue;
    add(match[0], '');
  }
  return found;
}

module.exports = { extractDingTalkLinks, parseDingTalkRef };
