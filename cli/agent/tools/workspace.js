'use strict';

const path = require('path');

function sanitizeProductName(name) {
  const text = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/^\.+/, '');
  if (!text || text === '.' || text === '..') {
    throw new Error('A visible product name is required');
  }
  return text;
}

function productWorkspace(requirementDir, productName) {
  const name = sanitizeProductName(productName);
  return path.join(path.resolve(requirementDir), name);
}

module.exports = { sanitizeProductName, productWorkspace };
