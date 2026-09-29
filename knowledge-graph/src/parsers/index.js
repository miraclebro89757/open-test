/**
 * Universal Document Parser Entry Point
 * Routes documents to appropriate parser based on file type
 */

const path = require('path');
const { parseMarkdown } = require('./markdown');
const { parseDocx } = require('./docx');
const { parseOpenAPI } = require('./openapi');

/**
 * Parse any supported document format
 * @param {string} filePath - Path to document file
 * @param {Object} options - Parsing options
 * @returns {Promise<Object>} Parsed document structure
 */
async function parseDocument(filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    switch (ext) {
      case '.md':
      case '.markdown':
        return await parseMarkdown(filePath, options);
      
      case '.docx':
        return await parseDocx(filePath);
      
      case '.yaml':
      case '.yml':
      case '.json':
        // Detect if it's an OpenAPI spec
        if (await isOpenAPISpec(filePath)) {
          return await parseOpenAPI(filePath);
        }
        throw new Error(`Unsupported JSON/YAML format. Only OpenAPI specs are supported.`);
      
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  } catch (error) {
    throw new Error(`Failed to parse ${filePath}: ${error.message}`);
  }
}

/**
 * Detect if a YAML/JSON file is an OpenAPI specification
 * @param {string} filePath - File path
 * @returns {Promise<boolean>} True if OpenAPI spec
 */
async function isOpenAPISpec(filePath) {
  const fs = require('fs').promises;
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const data = filePath.endsWith('.json') 
      ? JSON.parse(content)
      : require('js-yaml').load(content);
    
    return !!(data.openapi || data.swagger);
  } catch {
    return false;
  }
}

/**
 * Get supported file extensions
 * @returns {Array<string>} List of supported extensions
 */
function getSupportedExtensions() {
  return ['.md', '.markdown', '.docx', '.yaml', '.yml', '.json'];
}

/**
 * Validate if a file is supported
 * @param {string} filePath - File path
 * @returns {boolean} True if supported
 */
function isSupported(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return getSupportedExtensions().includes(ext);
}

module.exports = {
  parseDocument,
  parseMarkdown,
  parseDocx,
  parseOpenAPI,
  isOpenAPISpec,
  getSupportedExtensions,
  isSupported
};
