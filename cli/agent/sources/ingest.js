'use strict';

const fs = require('fs');
const path = require('path');
const { extractDingTalkLinks, parseDingTalkRef } = require('./links');

const PACK_DIR = path.join('knowledge', 'source-pack');
const REVIEW_FILE = path.join('knowledge', '需求评审.md');
const MAX_DLINK_HOPS = 8;

function sanitizeFilePart(value) {
  return String(value || 'doc').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40) || 'doc';
}

function packFile(nodeId, ext) {
  return `${sanitizeFilePart(nodeId)}.${ext}`;
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

function nextClarificationId(markdown) {
  const numbers = [...markdown.matchAll(/###\s+Q(\d+)/g)].map((match) => Number.parseInt(match[1], 10));
  return `Q${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, '0')}`;
}

function ensureReviewDocument(workspace) {
  const absolute = path.join(workspace, REVIEW_FILE);
  if (fs.existsSync(absolute)) return fs.readFileSync(absolute, 'utf8');
  return `# 需求评审

- 来源：钉钉文档源包
- reviewVerdict：NEEDS_CLARIFICATION

## 待澄清问题
`;
}

function appendUnreadClarifications(workspace, unread) {
  if (!unread.length) return;
  let markdown = ensureReviewDocument(workspace);
  const existing = markdown;
  const added = [];
  for (const item of unread) {
    const fingerprint = item.nodeId || item.url || item.title;
    if (fingerprint && existing.includes(fingerprint)) continue;
    const id = nextClarificationId(markdown);
    const title = item.title || item.nodeId || '未读到的关联文档';
    const source = item.url || item.nodeId || title;
    const understanding = item.reason === 'share-link'
      ? '这是钉钉分享短链，MCP 解不开。请换成空间内的节点链接后再采集。'
      : item.reason === 'no-permission'
        ? '当前钉钉身份没有读这篇关联文档的权限。'
        : item.reason === 'depth'
          ? '超出默认采集深度，没有写入源包。'
          : item.reason === 'unsupported'
            ? '这种节点类型不采正文。'
            : '采集时没有读到这篇关联文档。';
    markdown += `\n### ${id} ${title}\n- 状态：待处理\n- 原文：${source}\n- Agent理解：${understanding}\n- 补充：\n`;
    added.push(id);
  }
  if (added.length) writeAtomic(path.join(workspace, REVIEW_FILE), markdown.endsWith('\n') ? markdown : `${markdown}\n`);
}

function nodeUrl(info, fallback) {
  return info.url || fallback || (info.nodeId ? `https://alidocs.dingtalk.com/i/nodes/${info.nodeId}` : '');
}

async function resolveTarget(fetcher, start, visited) {
  let current = start;
  for (let hop = 0; hop < MAX_DLINK_HOPS; hop += 1) {
    if (current.extension !== 'dlink' || !current.linkSourceInfo || !current.linkSourceInfo.nodeId) return current;
    const targetId = current.linkSourceInfo.nodeId;
    if (visited.has(targetId)) {
      current = { ...current, extension: 'dlink', error: 'cycle', nodeId: targetId };
      return current;
    }
    current = await fetcher.inspect(targetId);
  }
  return current;
}

function roleFor(distance, extension) {
  if (distance === 0 && (extension === 'adoc' || extension === 'folder')) return 'root';
  if (extension === 'adoc') return 'linked';
  return 'attachment';
}

/**
 * Freeze a DingTalk (or any fetcher) document tree into knowledge/source-pack/.
 * depth is the number of document levels: 2 means the root plus directly linked nodes.
 */
async function ingestRequirementSources(options) {
  const workspace = options.workspace;
  const product = options.product || '';
  const depth = Number.isFinite(options.depth) ? Math.max(1, options.depth) : 2;
  const fetcher = options.fetcher || await require('./dingtalk-mcp').createDingTalkFetcherFromConfig(options.env || process.env);
  if (!workspace) throw new Error('A product workspace is required');
  if (!options.url) throw new Error('A DingTalk document link is required');
  if (!fetcher || typeof fetcher.inspect !== 'function' || typeof fetcher.fetch !== 'function') {
    throw new Error('No document collector is available. Connect the DingTalk document MCP in Settings first.');
  }

  const queue = [{ ref: options.url, parentId: null, distance: 0 }];
  const seen = new Set();
  const nodes = [];
  const unread = [];
  const packRoot = path.join(workspace, PACK_DIR);

  const remember = (entry) => {
    nodes.push(entry);
    if (entry.role === 'unread') unread.push(entry);
  };

  while (queue.length) {
    const item = queue.shift();
    const parsed = parseDingTalkRef(item.ref);
    if (parsed.kind === 'share') {
      remember({
        nodeId: '',
        url: parsed.url,
        title: item.title || '分享短链',
        extension: 'share',
        role: 'unread',
        reason: 'share-link',
        parentId: item.parentId,
        kind: 'share',
      });
      continue;
    }
    const startId = parsed.nodeId || parsed.url || item.ref;
    if (seen.has(startId)) continue;
    seen.add(startId);

    let info;
    try {
      info = await fetcher.inspect(item.ref);
    } catch (error) {
      const code = error && error.code === 'no-permission' ? 'no-permission' : 'unread';
      remember({
        nodeId: parsed.nodeId || '',
        url: parsed.url || String(item.ref),
        title: parsed.nodeId || String(item.ref),
        extension: 'unknown',
        role: 'unread',
        reason: code,
        parentId: item.parentId,
      });
      continue;
    }

    try {
      info = await resolveTarget(fetcher, info, seen);
    } catch (error) {
      remember({
        nodeId: info.nodeId || parsed.nodeId || '',
        url: nodeUrl(info, parsed.url),
        title: info.title || parsed.nodeId,
        extension: info.extension || 'dlink',
        role: 'unread',
        reason: error && error.code === 'no-permission' ? 'no-permission' : 'unread',
        parentId: item.parentId,
      });
      continue;
    }

    if (info.nodeId && info.nodeId !== startId) {
      if (seen.has(info.nodeId) && nodes.some((node) => node.nodeId === info.nodeId && node.role !== 'unread')) continue;
      seen.add(info.nodeId);
    }

    const extension = info.extension || (info.nodeType === 'folder' ? 'folder' : 'adoc');
    const base = {
      nodeId: info.nodeId || parsed.nodeId || '',
      url: nodeUrl(info, parsed.url),
      title: info.title || info.nodeId || '未命名',
      extension,
      revision: info.revision || '',
      parentId: item.parentId,
    };

    if (extension === 'folder') {
      remember({ ...base, role: item.distance === 0 ? 'root' : 'linked' });
      if (item.distance < depth - 1 && typeof fetcher.listFolder === 'function') {
        const children = await fetcher.listFolder(info.nodeId);
        for (const child of children) {
          queue.push({ ref: child, parentId: info.nodeId, distance: item.distance + 1 });
        }
      }
      continue;
    }

    if (extension === 'adoc') {
      const doc = await fetcher.fetch(info.nodeId);
      const relative = path.join(PACK_DIR, 'docs', packFile(info.nodeId, 'md'));
      writeAtomic(path.join(workspace, relative), `${doc.markdown || ''}`.replace(/\s+$/, '') + '\n');
      remember({ ...base, role: roleFor(item.distance, 'adoc'), path: relative.replace(/\\/g, '/') });
      if (item.distance + 1 < depth) {
        for (const link of extractDingTalkLinks(doc.markdown)) {
          queue.push({ ref: link.url, parentId: info.nodeId, distance: item.distance + 1, title: link.title });
        }
      }
      continue;
    }

    if (extension === 'axls' || extension === 'able') {
      const doc = typeof fetcher.fetch === 'function' ? await fetcher.fetch(info.nodeId) : {};
      const relative = path.join(PACK_DIR, 'tables', packFile(info.nodeId, 'json'));
      writeAtomic(path.join(workspace, relative), `${JSON.stringify({
        nodeId: info.nodeId,
        title: info.title,
        columns: (doc.table && doc.table.columns) || [],
        rows: (doc.table && doc.table.rows) || [],
      }, null, 2)}\n`);
      remember({ ...base, role: 'attachment', path: relative.replace(/\\/g, '/') });
      continue;
    }

    remember({
      ...base,
      role: 'attachment',
      reason: 'unsupported',
    });
  }

  const pack = {
    product,
    root: nodes.find((node) => node.role === 'root') || { url: options.url },
    ingestedAt: new Date().toISOString(),
    depth,
    nodes,
  };
  writeAtomic(path.join(packRoot, 'manifest.json'), `${JSON.stringify(pack, null, 2)}\n`);
  appendUnreadClarifications(workspace, unread);
  return {
    pack,
    ingested: nodes.filter((node) => node.role === 'root' || node.role === 'linked').filter((node) => node.extension === 'adoc').length,
    unread: unread.length,
    manifest: path.join(PACK_DIR, 'manifest.json'),
  };
}

function readSourcePack(workspace) {
  const file = path.join(workspace, PACK_DIR, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = {
  PACK_DIR,
  extractDingTalkLinks,
  ingestRequirementSources,
  parseDingTalkRef,
  readSourcePack,
};
