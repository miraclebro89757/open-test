'use strict';

const { parseDisposal } = require('./disposal');
const { sniffReferences } = require('./sniffer');
const { retrieveBaseline } = require('./retriever');
const { compileEvolution, renderMerged } = require('./compile');
const { alignRequirementVersions, queryBaselineFeature } = require('./align');
const { buildMigrationPlan, readPlan, applyMigration } = require('./migrate');

module.exports = {
  parseDisposal,
  sniffReferences,
  retrieveBaseline,
  compileEvolution,
  renderMerged,
  alignRequirementVersions,
  queryBaselineFeature,
  buildMigrationPlan,
  readPlan,
  applyMigration,
};
