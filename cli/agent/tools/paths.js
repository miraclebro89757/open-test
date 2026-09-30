'use strict';

const path = require('path');

function resolveInside(cwd, input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('path is required');
  }
  const raw = input.startsWith('@') ? input.slice(1) : input;
  const root = path.resolve(cwd);
  const abs = path.resolve(root, raw);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('path is outside the working directory');
  }
  return abs;
}

module.exports = { resolveInside };
