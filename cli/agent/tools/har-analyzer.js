#!/usr/bin/env node
/**
 * HAR Analyzer - AI-Powered HAR File Analysis
 * 
 * Features:
 * 1. Variable Extraction: Identifies dynamic values (tokens, IDs, timestamps)
 * 2. Dependency Detection: Discovers request dependencies (auth → CRUD chains)
 * 3. Sensitive Data Detection: Flags passwords, API keys, tokens
 * 4. Request Correlation: Groups related requests by session/transaction
 * 
 * @module har-analyzer
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Sensitive data patterns to detect in HAR files
 */
const SENSITIVE_PATTERNS = {
  password: /password|passwd|pwd/i,
  apiKey: /api[_-]?key|apikey|access[_-]?key/i,
  token: /token|bearer|authorization|auth/i,
  secret: /secret|private[_-]?key|client[_-]?secret/i,
  credential: /credential|username|email|phone/i,
};

/**
 * Common dynamic value patterns
 */
const DYNAMIC_PATTERNS = {
  uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  numericId: /\b\d{6,}\b/g,
  timestamp: /\b\d{10,13}\b/g,
  jwt: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  sessionId: /[0-9a-f]{32,}/gi,
};

/**
 * Analyze HAR file with AI-powered insights
 * 
 * @param {string} harPath - Path to HAR file
 * @param {object} llmClient - LLM client for AI analysis
 * @returns {Promise<object>} Analysis result
 */
/** Libraries stay quiet by default; the caller decides what to print. */
const QUIET = { log() {}, warn() {}, error() {} };

async function analyzeHAR(harPath, llmClient, { logger = QUIET } = {}) {
  logger.log(`📊 Analyzing HAR file: ${harPath}`);
  
  // Step 1: Load and parse HAR
  const harContent = await fs.readFile(harPath, 'utf-8');
  const har = JSON.parse(harContent);
  
  if (!har.log || !har.log.entries) {
    throw new Error('Invalid HAR format: missing log.entries');
  }
  
  const entries = har.log.entries;
  logger.log(`  ✓ Found ${entries.length} HTTP requests`);
  
  // Step 2: Basic extraction (no AI needed)
  const basicAnalysis = extractBasicInfo(entries);
  
  // Step 3: AI-powered deep analysis, with a rule-based fallback
  const aiAnalysis = await performAIAnalysis(entries, llmClient, { logger });
  
  // Step 4: Merge results
  const result = {
    source: aiAnalysis.source,
    summary: {
      totalRequests: entries.length,
      uniqueEndpoints: basicAnalysis.endpoints.length,
      sensitiveFields: basicAnalysis.sensitiveFields.length,
      extractedVariables: aiAnalysis.variables.length,
      dependencies: aiAnalysis.dependencies.length,
    },
    endpoints: basicAnalysis.endpoints,
    variables: aiAnalysis.variables,
    dependencies: aiAnalysis.dependencies,
    sensitiveData: basicAnalysis.sensitiveFields,
    requestChains: aiAnalysis.requestChains,
    recommendations: aiAnalysis.recommendations,
  };
  
  logger.log(`  ✓ Analysis complete`);
  logger.log(`    - Extracted ${result.variables.length} variables`);
  logger.log(`    - Identified ${result.dependencies.length} dependencies`);
  logger.log(`    - Flagged ${result.sensitiveData.length} sensitive fields`);
  
  return result;
}

/**
 * Extract basic information without AI
 */
function extractBasicInfo(entries) {
  const endpoints = new Set();
  const sensitiveFields = [];
  
  entries.forEach((entry, idx) => {
    const { request, response } = entry;
    
    // Extract endpoints
    const url = new URL(request.url);
    const endpoint = `${request.method} ${url.pathname}`;
    endpoints.add(endpoint);
    
    // Detect sensitive data in request
    detectSensitiveData(request, idx, 'request', sensitiveFields);
    
    // Detect sensitive data in response
    if (response.content && response.content.text) {
      detectSensitiveData(response, idx, 'response', sensitiveFields);
    }
  });
  
  return {
    endpoints: Array.from(endpoints),
    sensitiveFields,
  };
}

/**
 * Detect sensitive data in request/response
 */
function detectSensitiveData(data, index, type, results) {
  const text = JSON.stringify(data);
  
  Object.entries(SENSITIVE_PATTERNS).forEach(([name, pattern]) => {
    if (pattern.test(text)) {
      results.push({
        index,
        type,
        category: name,
        recommendation: `Extract "${name}" to environment variable`,
      });
    }
  });
}

/**
 * Perform AI-powered analysis using LLM
 */
async function performAIAnalysis(entries, llmClient, { logger = QUIET } = {}) {
  if (!llmClient || typeof llmClient.chat !== 'function') {
    logger.warn('  ⚠ No usable LLM profile, using rule-based analysis');
    return { ...fallbackAnalysis(entries), source: 'rules' };
  }

  // Prepare compact representation for LLM
  const compactEntries = entries.slice(0, 50).map((entry, idx) => ({
    index: idx,
    method: entry.request.method,
    url: entry.request.url,
    status: entry.response.status,
    headers: entry.request.headers.filter(h => 
      ['authorization', 'content-type', 'x-', 'cookie'].some(k => h.name.toLowerCase().includes(k))
    ),
    requestBody: extractBody(entry.request),
    responseBody: extractBody(entry.response),
    time: entry.time,
  }));
  
  const prompt = buildAnalysisPrompt(compactEntries);
  
  try {
    const response = await llmClient.chat([
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);
    
    const result = JSON.parse(response);
    return { ...normalizeAIResult(result), source: 'ai' };
  } catch (error) {
    logger.warn(`  ⚠ AI analysis failed: ${error.message}, using fallback`);
    return { ...fallbackAnalysis(entries), source: 'rules' };
  }
}

/**
 * Models routinely return partial or loosely shaped objects. Fill in the
 * contract the renderer depends on so one bad field cannot break the script.
 */
function normalizeAIResult(result) {
  const asArray = (value) => (Array.isArray(value) ? value : []);
  return {
    variables: asArray(result.variables),
    dependencies: asArray(result.dependencies),
    requestChains: asArray(result.requestChains),
    recommendations: asArray(result.recommendations),
  };
}

/**
 * Extract request/response body (first 500 chars)
 */
function extractBody(data) {
  if (data.postData && data.postData.text) {
    return data.postData.text.substring(0, 500);
  }
  if (data.content && data.content.text) {
    return data.content.text.substring(0, 500);
  }
  return null;
}

/**
 * Build analysis prompt for LLM
 */
function buildAnalysisPrompt(entries) {
  return `Analyze the following HTTP requests and identify:

1. **Variables to Extract**: Dynamic values that change between runs (IDs, tokens, timestamps)
2. **Request Dependencies**: Which requests depend on data from previous responses
3. **Request Chains**: Logical groupings of related requests (e.g., login → create → update → delete)
4. **Recommendations**: Best practices for parameterization and test stability

HTTP Requests:
\`\`\`json
${JSON.stringify(entries, null, 2)}
\`\`\`

Return JSON in this exact format:
\`\`\`json
{
  "variables": [
    {
      "name": "auth_token",
      "location": "response[0].body.token",
      "type": "string",
      "usedIn": [1, 2, 3],
      "example": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  ],
  "dependencies": [
    {
      "from": 0,
      "to": 1,
      "variable": "auth_token",
      "extraction": "response.body.token",
      "injection": "headers.Authorization"
    }
  ],
  "requestChains": [
    {
      "name": "User Login Flow",
      "requests": [0, 1, 2],
      "purpose": "Authenticate user and fetch profile"
    }
  ],
  "recommendations": [
    "Extract 'auth_token' from login response and reuse in subsequent requests",
    "Use environment variables for base URL to support multiple environments"
  ]
}
\`\`\`

Focus on:
- Authentication flows (login, tokens, sessions)
- Resource creation dependencies (create user → get user ID → update user)
- Pagination and cursor-based navigation
- CSRF tokens and security headers
`;
}

/**
 * System prompt for AI analysis
 */
const SYSTEM_PROMPT = `You are an expert API test automation engineer specializing in HAR file analysis.

Your task is to analyze HTTP request/response sequences and identify:
1. Dynamic variables that should be extracted and parameterized
2. Request dependencies where data flows from one request to another
3. Logical request chains that represent complete user workflows
4. Best practices for creating maintainable API tests

Rules:
- Be precise: Only extract variables that are truly dynamic (not static config)
- Be conservative: Don't over-parameterize (e.g., HTTP method, content-type are usually static)
- Be practical: Focus on variables that affect test execution (tokens, IDs, not timestamps)
- Return valid JSON only, no markdown code blocks or explanations

Common patterns:
- Login → extract token → use in Authorization header
- Create resource → extract ID → use in subsequent GET/PUT/DELETE
- List resources → extract pagination cursor → use in next page request
- CSRF token in HTML → extract → use in POST form submission`;

/**
 * Fallback analysis when AI is unavailable
 */
function fallbackAnalysis(entries) {
  const variables = [];
  const dependencies = [];
  const requestChains = [];
  
  // Simple heuristic: look for common patterns
  entries.forEach((entry, idx) => {
    const url = entry.request.url;
    const body = extractBody(entry.response);
    
    // Detect auth tokens in response
    if (body && (body.includes('token') || body.includes('access_token'))) {
      variables.push({
        name: `token_${idx}`,
        location: `response[${idx}].body.token`,
        type: 'string',
        usedIn: [],
        example: 'eyJ...',
      });
    }
    
    // Detect ID patterns in response
    const idMatches = body ? body.match(/"id"\s*:\s*"?(\d+|[0-9a-f-]+)"?/gi) : [];
    if (idMatches && idMatches.length > 0) {
      variables.push({
        name: `resource_id_${idx}`,
        location: `response[${idx}].body.id`,
        type: 'string',
        usedIn: [],
        example: '12345',
      });
    }
  });
  
  return {
    variables,
    dependencies,
    requestChains: [
      {
        name: 'Default Chain',
        requests: entries.map((_, i) => i),
        purpose: 'All captured requests in sequence',
      },
    ],
    recommendations: [
      'Manual review recommended: AI analysis unavailable',
      'Check for authentication tokens in responses',
      'Identify resource IDs that link requests together',
    ],
  };
}

/**
 * Export HAR analysis to JSON file
 */
async function exportAnalysis(analysis, outputPath) {
  await fs.writeFile(
    outputPath,
    JSON.stringify(analysis, null, 2),
    'utf-8'
  );
  console.log(`📄 Analysis exported to: ${outputPath}`);
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error(`Usage: node har-analyzer.js <har-file> [output-json]`);
    process.exit(1);
  }
  
  const harPath = args[0];
  const outputPath = args[1] || harPath.replace('.har', '.analysis.json');
  
  // Mock LLM client (will be replaced with actual LLM in integration)
  const mockLLM = {
    chat: async (messages) => {
      // In production, this calls actual LLM API
      // For now, return empty structure to trigger fallback
      throw new Error('LLM not configured');
    },
  };
  
  try {
    const analysis = await analyzeHAR(harPath, mockLLM, { logger: console });
    await exportAnalysis(analysis, outputPath);
    
    console.log('\n✅ HAR analysis complete!');
    console.log(`   Variables: ${analysis.variables.length}`);
    console.log(`   Dependencies: ${analysis.dependencies.length}`);
    console.log(`   Sensitive fields: ${analysis.sensitiveData.length}`);
    
  } catch (error) {
    console.error(`❌ Analysis failed: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
module.exports = {
  analyzeHAR,
  extractBasicInfo,
  performAIAnalysis,
  fallbackAnalysis,
  normalizeAIResult,
  SENSITIVE_PATTERNS,
  DYNAMIC_PATTERNS,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
