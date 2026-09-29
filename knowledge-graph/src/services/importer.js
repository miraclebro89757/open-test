/**
 * Knowledge Graph Importer
 * Imports parsed documents into Neo4j graph database
 */

const crypto = require('crypto');
const { getDriver } = require('../db/neo4j');

/**
 * Import parsed document into Neo4j
 * @param {Object} parsedDoc - Parsed document from any parser
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import statistics
 */
async function importDocument(parsedDoc, options = {}) {
  const driver = getDriver();
  const session = driver.session();

  const stats = {
    modulesCreated: 0,
    requirementsCreated: 0,
    testPointsCreated: 0,
    relationshipsCreated: 0,
    errors: []
  };

  try {
    // Start transaction
    await session.writeTransaction(async (tx) => {
      // Import modules
      if (parsedDoc.modules) {
        for (const module of parsedDoc.modules) {
          try {
            await importModule(tx, module, parsedDoc, options);
            stats.modulesCreated++;

            // Import requirements within module
            if (module.requirements) {
              for (const requirement of module.requirements) {
                try {
                  await importRequirement(tx, requirement, module, parsedDoc, options);
                  stats.requirementsCreated++;
                } catch (error) {
                  stats.errors.push({
                    type: 'requirement',
                    id: requirement.id || requirement.title,
                    error: error.message
                  });
                }
              }
            }
          } catch (error) {
            stats.errors.push({
              type: 'module',
              name: module.name,
              error: error.message
            });
          }
        }
      }

      // Import standalone requirements (e.g., from OpenAPI)
      if (parsedDoc.requirements) {
        for (const requirement of parsedDoc.requirements) {
          try {
            await importRequirement(tx, requirement, null, parsedDoc, options);
            stats.requirementsCreated++;
          } catch (error) {
            stats.errors.push({
              type: 'requirement',
              id: requirement.id || requirement.title,
              error: error.message
            });
          }
        }
      }

      // Import test points (e.g., from OpenAPI)
      if (parsedDoc.testPoints) {
        for (const testPoint of parsedDoc.testPoints) {
          try {
            await importTestPoint(tx, testPoint, parsedDoc, options);
            stats.testPointsCreated++;
          } catch (error) {
            stats.errors.push({
              type: 'testPoint',
              id: testPoint.id,
              error: error.message
            });
          }
        }
      }
    });

    return stats;
  } catch (error) {
    throw new Error(`Import failed: ${error.message}`);
  } finally {
    await session.close();
  }
}

/**
 * Import a module node
 * @param {Transaction} tx - Neo4j transaction
 * @param {Object} module - Module data
 * @param {Object} parsedDoc - Full parsed document
 * @param {Object} options - Import options
 */
async function importModule(tx, module, parsedDoc, options) {
  const moduleId = generateModuleId(module, parsedDoc);

  const query = `
    MERGE (m:Module {module_id: $moduleId})
    ON CREATE SET
      m.name = $name,
      m.description = $description,
      m.source_file = $sourceFile,
      m.source_type = $sourceType,
      m.created_at = datetime(),
      m.updated_at = datetime()
    ON MATCH SET
      m.name = $name,
      m.description = $description,
      m.updated_at = datetime()
    RETURN m
  `;

  await tx.run(query, {
    moduleId,
    name: module.name,
    description: module.description || '',
    sourceFile: parsedDoc.filePath || 'unknown',
    sourceType: parsedDoc.type || 'unknown'
  });
}

/**
 * Import a requirement node
 * @param {Transaction} tx - Neo4j transaction
 * @param {Object} requirement - Requirement data
 * @param {Object} module - Parent module (optional)
 * @param {Object} parsedDoc - Full parsed document
 * @param {Object} options - Import options
 */
async function importRequirement(tx, requirement, module, parsedDoc, options) {
  const reqId = requirement.id || generateRequirementId(requirement, module);
  const version = options.version || '1.0.0';

  // Create requirement node
  const createReqQuery = `
    MERGE (r:Requirement {req_id: $reqId, version: $version})
    ON CREATE SET
      r.title = $title,
      r.description = $description,
      r.priority = $priority,
      r.status = $status,
      r.source_file = $sourceFile,
      r.source_type = $sourceType,
      r.given = $given,
      r.when = $when,
      r.then = $then,
      r.created_at = datetime(),
      r.updated_at = datetime()
    ON MATCH SET
      r.title = $title,
      r.description = $description,
      r.priority = $priority,
      r.status = $status,
      r.given = $given,
      r.when = $when,
      r.then = $then,
      r.updated_at = datetime()
    RETURN r
  `;

  await tx.run(createReqQuery, {
    reqId,
    version,
    title: requirement.title,
    description: requirement.description || '',
    priority: requirement.priority || 'P2',
    status: requirement.status || 'draft',
    sourceFile: parsedDoc.filePath || 'unknown',
    sourceType: parsedDoc.type || 'unknown',
    given: requirement.givenWhenThen?.given || [],
    when: requirement.givenWhenThen?.when || [],
    then: requirement.givenWhenThen?.then || []
  });

  // Link to module if exists
  if (module) {
    const moduleId = generateModuleId(module, parsedDoc);
    const linkQuery = `
      MATCH (m:Module {module_id: $moduleId})
      MATCH (r:Requirement {req_id: $reqId, version: $version})
      MERGE (m)-[:CONTAINS]->(r)
    `;
    await tx.run(linkQuery, { moduleId, reqId, version });
  }

  // Create quality issue nodes if any
  if (requirement.qualityIssues && requirement.qualityIssues.length > 0) {
    for (const issue of requirement.qualityIssues) {
      await createQualityIssue(tx, reqId, version, issue);
    }
  }
}

/**
 * Import a test point node
 * @param {Transaction} tx - Neo4j transaction
 * @param {Object} testPoint - Test point data
 * @param {Object} parsedDoc - Full parsed document
 * @param {Object} options - Import options
 */
async function importTestPoint(tx, testPoint, parsedDoc, options) {
  const query = `
    MERGE (tp:TestPoint {test_point_id: $testPointId})
    ON CREATE SET
      tp.angle = $angle,
      tp.title = $title,
      tp.description = $description,
      tp.priority = $priority,
      tp.status = $status,
      tp.created_at = datetime(),
      tp.updated_at = datetime()
    ON MATCH SET
      tp.angle = $angle,
      tp.title = $title,
      tp.description = $description,
      tp.priority = $priority,
      tp.status = $status,
      tp.updated_at = datetime()
    RETURN tp
  `;

  await tx.run(query, {
    testPointId: testPoint.id,
    angle: testPoint.angle,
    title: testPoint.title,
    description: testPoint.description || '',
    priority: testPoint.priority || 'P2',
    status: testPoint.status || 'pending'
  });

  // Link to requirement if exists
  if (testPoint.requirementId) {
    const version = options.version || '1.0.0';
    const linkQuery = `
      MATCH (r:Requirement {req_id: $reqId, version: $version})
      MATCH (tp:TestPoint {test_point_id: $testPointId})
      MERGE (r)-[:DECOMPOSED_INTO]->(tp)
    `;
    await tx.run(linkQuery, {
      reqId: testPoint.requirementId,
      version,
      testPointId: testPoint.id
    });
  }
}

/**
 * Create quality issue relationship
 * @param {Transaction} tx - Neo4j transaction
 * @param {string} reqId - Requirement ID
 * @param {string} version - Requirement version
 * @param {Object} issue - Quality issue data
 */
async function createQualityIssue(tx, reqId, version, issue) {
  const query = `
    MATCH (r:Requirement {req_id: $reqId, version: $version})
    SET r.quality_issues = COALESCE(r.quality_issues, []) + [$issue]
  `;

  await tx.run(query, {
    reqId,
    version,
    issue: JSON.stringify(issue)
  });
}

/**
 * Generate module ID
 * @param {Object} module - Module data
 * @param {Object} parsedDoc - Parsed document
 * @returns {string} Module ID
 */
function generateModuleId(module, parsedDoc) {
  const source = parsedDoc.filePath || 'unknown';
  const name = module.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return `${source}::${name}`;
}

/**
 * Generate requirement ID
 * @param {Object} requirement - Requirement data
 * @param {Object} module - Parent module
 * @returns {string} Requirement ID
 */
function generateRequirementId(requirement, module) {
  if (requirement.id) return requirement.id;
  
  const title = requirement.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const hash = crypto.createHash('md5').update(requirement.title).digest('hex').substring(0, 8);
  
  if (module) {
    return `${module.name.replace(/[^a-zA-Z0-9]/g, '_')}_${title}_${hash}`;
  }
  
  return `req_${title}_${hash}`;
}

/**
 * Update requirement to new version (creates EVOLVED_FROM relationship)
 * @param {string} reqId - Requirement ID
 * @param {string} oldVersion - Old version
 * @param {string} newVersion - New version
 * @param {Object} changes - Changes data
 * @returns {Promise<void>}
 */
async function evolveRequirement(reqId, oldVersion, newVersion, changes = {}) {
  const driver = getDriver();
  const session = driver.session();

  try {
    const query = `
      MATCH (old:Requirement {req_id: $reqId, version: $oldVersion})
      MATCH (new:Requirement {req_id: $reqId, version: $newVersion})
      MERGE (new)-[e:EVOLVED_FROM]->(old)
      SET e.change_type = $changeType,
          e.change_reason = $changeReason,
          e.changed_at = datetime()
    `;

    await session.run(query, {
      reqId,
      oldVersion,
      newVersion,
      changeType: changes.type || 'modification',
      changeReason: changes.reason || 'Updated requirement'
    });
  } finally {
    await session.close();
  }
}

/**
 * Get import statistics
 * @returns {Promise<Object>} Statistics
 */
async function getImportStats() {
  const driver = getDriver();
  const session = driver.session();

  try {
    const query = `
      MATCH (m:Module)
      OPTIONAL MATCH (m)-[:CONTAINS]->(r:Requirement)
      OPTIONAL MATCH (r)-[:DECOMPOSED_INTO]->(tp:TestPoint)
      RETURN 
        COUNT(DISTINCT m) as modules,
        COUNT(DISTINCT r) as requirements,
        COUNT(DISTINCT tp) as testPoints
    `;

    const result = await session.run(query);
    const record = result.records[0];

    return {
      modules: record.get('modules').toNumber(),
      requirements: record.get('requirements').toNumber(),
      testPoints: record.get('testPoints').toNumber()
    };
  } finally {
    await session.close();
  }
}

module.exports = {
  importDocument,
  importModule,
  importRequirement,
  importTestPoint,
  evolveRequirement,
  getImportStats,
  generateModuleId,
  generateRequirementId
};
