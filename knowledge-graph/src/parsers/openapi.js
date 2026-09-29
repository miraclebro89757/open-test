/**
 * OpenAPI Parser for Requirements Knowledge Graph
 * Parses OpenAPI/Swagger specs into test requirements
 * Extracts endpoints, parameters, responses for test point generation
 */

const SwaggerParser = require('@apidevtools/swagger-parser');
const { detectAmbiguousLanguage } = require('./markdown');

/**
 * Parse OpenAPI spec file into structured requirements
 * @param {string} filePath - Path to OpenAPI YAML/JSON file
 * @returns {Promise<Object>} Parsed API structure
 */
async function parseOpenAPI(filePath) {
  try {
    // Validate and dereference the OpenAPI spec
    const api = await SwaggerParser.validate(filePath);
    
    // Extract structured requirements
    const modules = extractModules(api);
    const requirements = extractRequirements(api);
    const testPoints = generateTestPoints(api);

    return {
      type: 'openapi',
      filePath,
      version: api.openapi || api.swagger || '3.0.0',
      info: api.info,
      modules,
      requirements,
      testPoints,
      metadata: {
        servers: api.servers || [],
        extractedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    throw new Error(`Failed to parse OpenAPI file ${filePath}: ${error.message}`);
  }
}

/**
 * Extract modules from OpenAPI tags
 * @param {Object} api - Parsed OpenAPI spec
 * @returns {Array} Module structures
 */
function extractModules(api) {
  const modules = [];
  const tags = api.tags || [];

  // Extract from tags
  tags.forEach(tag => {
    modules.push({
      name: tag.name,
      description: tag.description || '',
      externalDocs: tag.externalDocs || null
    });
  });

  // If no tags, group by path prefix
  if (modules.length === 0 && api.paths) {
    const pathGroups = new Map();
    Object.keys(api.paths).forEach(path => {
      const prefix = path.split('/')[1] || 'default';
      if (!pathGroups.has(prefix)) {
        pathGroups.set(prefix, {
          name: prefix.charAt(0).toUpperCase() + prefix.slice(1),
          description: `API endpoints for ${prefix}`,
          paths: []
        });
      }
      pathGroups.get(prefix).paths.push(path);
    });
    modules.push(...Array.from(pathGroups.values()));
  }

  return modules;
}

/**
 * Extract requirements from OpenAPI paths and operations
 * @param {Object} api - Parsed OpenAPI spec
 * @returns {Array} Requirement structures
 */
function extractRequirements(api) {
  const requirements = [];

  if (!api.paths) return requirements;

  Object.entries(api.paths).forEach(([path, pathItem]) => {
    // Iterate through HTTP methods
    ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].forEach(method => {
      const operation = pathItem[method];
      if (!operation) return;

      const requirement = {
        id: operation.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
        title: operation.summary || `${method.toUpperCase()} ${path}`,
        description: operation.description || '',
        path,
        method: method.toUpperCase(),
        tags: operation.tags || [],
        priority: operation.deprecated ? 'P3' : 'P1',
        parameters: extractParameters(operation.parameters, pathItem.parameters),
        requestBody: extractRequestBody(operation.requestBody),
        responses: extractResponses(operation.responses),
        security: operation.security || api.security || [],
        givenWhenThen: generateGivenWhenThen(method, path, operation),
        qualityIssues: []
      };

      // Detect ambiguous language in description
      if (requirement.description) {
        const ambiguous = detectAmbiguousLanguage(requirement.description);
        if (ambiguous.length > 0) {
          requirement.qualityIssues.push({
            type: 'ambiguous_language',
            words: ambiguous,
            context: requirement.description
          });
        }
      }

      // Detect missing documentation
      if (!operation.summary && !operation.description) {
        requirement.qualityIssues.push({
          type: 'missing_documentation',
          message: 'No summary or description provided'
        });
      }

      requirements.push(requirement);
    });
  });

  return requirements;
}

/**
 * Extract and normalize parameters
 * @param {Array} operationParams - Operation-level parameters
 * @param {Array} pathParams - Path-level parameters
 * @returns {Array} Normalized parameters
 */
function extractParameters(operationParams = [], pathParams = []) {
  const allParams = [...(pathParams || []), ...(operationParams || [])];
  
  return allParams.map(param => ({
    name: param.name,
    in: param.in, // query, header, path, cookie
    description: param.description || '',
    required: param.required || false,
    schema: param.schema || {},
    example: param.example || param.examples || null,
    deprecated: param.deprecated || false
  }));
}

/**
 * Extract request body schema
 * @param {Object} requestBody - OpenAPI request body object
 * @returns {Object|null} Normalized request body
 */
function extractRequestBody(requestBody) {
  if (!requestBody) return null;

  const content = requestBody.content || {};
  const mediaTypes = Object.keys(content);

  return {
    description: requestBody.description || '',
    required: requestBody.required || false,
    mediaTypes: mediaTypes.map(mediaType => ({
      mediaType,
      schema: content[mediaType].schema || {},
      examples: content[mediaType].examples || {}
    }))
  };
}

/**
 * Extract response definitions
 * @param {Object} responses - OpenAPI responses object
 * @returns {Array} Normalized responses
 */
function extractResponses(responses = {}) {
  return Object.entries(responses).map(([statusCode, response]) => {
    const content = response.content || {};
    
    return {
      statusCode,
      description: response.description || '',
      headers: response.headers || {},
      content: Object.entries(content).map(([mediaType, mediaTypeObj]) => ({
        mediaType,
        schema: mediaTypeObj.schema || {},
        examples: mediaTypeObj.examples || {}
      }))
    };
  });
}

/**
 * Generate Given-When-Then from operation
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {Object} operation - OpenAPI operation
 * @returns {Object} Given-When-Then structure
 */
function generateGivenWhenThen(method, path, operation) {
  const given = [];
  const when = [];
  const then = [];

  // Given: preconditions
  if (operation.security && operation.security.length > 0) {
    given.push('User is authenticated');
  }
  if (operation.parameters) {
    const requiredParams = operation.parameters.filter(p => p.required);
    if (requiredParams.length > 0) {
      given.push(`Required parameters provided: ${requiredParams.map(p => p.name).join(', ')}`);
    }
  }

  // When: action
  when.push(`Client sends ${method.toUpperCase()} request to ${path}`);
  if (operation.requestBody && operation.requestBody.required) {
    when.push('Valid request body is provided');
  }

  // Then: expected results
  const successResponses = Object.keys(operation.responses || {})
    .filter(code => code.startsWith('2'));
  
  if (successResponses.length > 0) {
    then.push(`Server returns ${successResponses.join(' or ')} response`);
  }

  // Add response schema check
  successResponses.forEach(code => {
    const response = operation.responses[code];
    if (response.content) {
      then.push('Response body matches schema definition');
    }
  });

  return { given, when, then };
}

/**
 * Generate test points from OpenAPI spec
 * @param {Object} api - Parsed OpenAPI spec
 * @returns {Array} Test point structures with 4 dimensions
 */
function generateTestPoints(api) {
  const testPoints = [];

  if (!api.paths) return testPoints;

  Object.entries(api.paths).forEach(([path, pathItem]) => {
    ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
      const operation = pathItem[method];
      if (!operation) return;

      const baseId = operation.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Functional dimension
      testPoints.push({
        id: `${baseId}_functional_success`,
        requirementId: baseId,
        angle: 'Functional',
        title: `${method.toUpperCase()} ${path} - Success case`,
        description: 'Verify successful response with valid input',
        priority: 'P0'
      });

      // Exception dimension
      const errorResponses = Object.keys(operation.responses || {})
        .filter(code => code.startsWith('4') || code.startsWith('5'));
      
      errorResponses.forEach(code => {
        testPoints.push({
          id: `${baseId}_exception_${code}`,
          requirementId: baseId,
          angle: 'Exception',
          title: `${method.toUpperCase()} ${path} - HTTP ${code}`,
          description: operation.responses[code].description || `Handle ${code} error`,
          priority: 'P1'
        });
      });

      // Security dimension
      if (operation.security || api.security) {
        testPoints.push({
          id: `${baseId}_security_auth`,
          requirementId: baseId,
          angle: 'Security',
          title: `${method.toUpperCase()} ${path} - Authentication`,
          description: 'Verify authentication and authorization',
          priority: 'P0'
        });
      }

      // Parameter validation (Security)
      const requiredParams = (operation.parameters || []).filter(p => p.required);
      if (requiredParams.length > 0) {
        testPoints.push({
          id: `${baseId}_security_validation`,
          requirementId: baseId,
          angle: 'Security',
          title: `${method.toUpperCase()} ${path} - Input validation`,
          description: 'Verify parameter validation and sanitization',
          priority: 'P1'
        });
      }

      // Performance dimension
      testPoints.push({
        id: `${baseId}_performance_latency`,
        requirementId: baseId,
        angle: 'Performance',
        title: `${method.toUpperCase()} ${path} - Response time`,
        description: 'Verify API response time meets SLA',
        priority: 'P2'
      });
    });
  });

  return testPoints;
}

module.exports = {
  parseOpenAPI,
  extractModules,
  extractRequirements,
  generateTestPoints,
  generateGivenWhenThen
};
