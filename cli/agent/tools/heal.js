'use strict';

const { resolveInside } = require('./paths');

async function healSelector({
  cwd,
  filePath,
  oldSelector,
  newSelector,
  confirm,
  readFile,
  writeFile,
}) {
  if (!oldSelector || !newSelector) {
    throw new Error('oldSelector and newSelector are required');
  }
  if (oldSelector === newSelector) {
    throw new Error('oldSelector and newSelector are the same');
  }
  const abs = resolveInside(cwd, filePath);
  const content = await readFile(abs, 'utf8');
  if (!content.includes(oldSelector)) {
    return { success: false, changed: false, message: `未找到选择器: ${oldSelector}` };
  }
  const allowed = await confirm({ filePath: abs, oldSelector, newSelector });
  if (!allowed) {
    return { success: false, changed: false, message: '已取消，文件未修改。' };
  }
  await writeFile(abs, content.replaceAll(oldSelector, newSelector), 'utf8');
  return { success: true, changed: true, message: `已把选择器写入 ${abs}` };
}

module.exports = { healSelector };
