/**
 * DOCX Parser for Requirements Knowledge Graph
 * Parses Word documents (.docx) into structured requirements
 * Supports Given-When-Then extraction and ambiguous language detection
 */

const mammoth = require('mammoth');
const { detectAmbiguousLanguage } = require('./markdown');

/**
 * Parse DOCX file into structured requirements
 * @param {string} filePath - Path to DOCX file
 * @returns {Promise<Object>} Parsed document structure
 */
async function parseDocx(filePath) {
  try {
    // Extract raw text and markdown from DOCX
    const result = await mammoth.convertToMarkdown({ path: filePath });
    const markdown = result.value;
    const messages = result.messages;

    // Log any conversion warnings
    if (messages.length > 0) {
      console.warn('DOCX conversion warnings:', messages);
    }

    // Parse the extracted markdown structure
    const structure = parseDocxMarkdown(markdown);

    return {
      type: 'docx',
      filePath,
      markdown,
      ...structure,
      metadata: {
        conversionMessages: messages,
        extractedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    throw new Error(`Failed to parse DOCX file ${filePath}: ${error.message}`);
  }
}

/**
 * Parse markdown extracted from DOCX into requirements structure
 * @param {string} markdown - Markdown content
 * @returns {Object} Structured requirements
 */
function parseDocxMarkdown(markdown) {
  const lines = markdown.split('\n');
  const modules = [];
  let currentModule = null;
  let currentRequirement = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Module detection (h1, h2)
    const moduleMatch = line.match(/^#{1,2}\s+(.+)$/);
    if (moduleMatch) {
      if (currentRequirement && currentModule) {
        currentModule.requirements.push(currentRequirement);
        currentRequirement = null;
      }
      if (currentModule) {
        modules.push(currentModule);
      }
      currentModule = {
        name: moduleMatch[1].trim(),
        description: '',
        requirements: []
      };
      continue;
    }

    // Requirement detection (h3, h4, numbered lists)
    const reqMatch = line.match(/^#{3,4}\s+(.+)$/) || 
                     line.match(/^\d+\.\s+(.+)$/) ||
                     line.match(/^[-*]\s+(.+)$/);
    
    if (reqMatch && currentModule) {
      if (currentRequirement) {
        currentModule.requirements.push(currentRequirement);
      }
      
      const reqTitle = reqMatch[1].trim();
      currentRequirement = {
        title: reqTitle,
        description: '',
        priority: detectPriority(reqTitle),
        givenWhenThen: {
          given: [],
          when: [],
          then: []
        },
        functionalRequirements: [],
        nonFunctionalRequirements: [],
        businessRules: [],
        qualityIssues: []
      };
      continue;
    }

    // Given-When-Then extraction
    if (currentRequirement) {
      const givenMatch = line.match(/^(?:Given|前置条件|假设)[:\s]+(.+)$/i);
      const whenMatch = line.match(/^(?:When|操作|当)[:\s]+(.+)$/i);
      const thenMatch = line.match(/^(?:Then|预期结果|则)[:\s]+(.+)$/i);

      if (givenMatch) {
        currentRequirement.givenWhenThen.given.push(givenMatch[1].trim());
        continue;
      }
      if (whenMatch) {
        currentRequirement.givenWhenThen.when.push(whenMatch[1].trim());
        continue;
      }
      if (thenMatch) {
        currentRequirement.givenWhenThen.then.push(thenMatch[1].trim());
        continue;
      }

      // Functional requirement detection
      if (line.match(/^(?:功能|Function|Feature)[:\s]/i)) {
        currentRequirement.functionalRequirements.push(line);
        continue;
      }

      // Non-functional requirement detection
      if (line.match(/^(?:性能|安全|可用性|Performance|Security|Availability)[:\s]/i)) {
        currentRequirement.nonFunctionalRequirements.push(line);
        continue;
      }

      // Business rule detection
      if (line.match(/^(?:规则|Rule|Constraint)[:\s]/i)) {
        currentRequirement.businessRules.push(line);
        continue;
      }

      // Accumulate description
      if (line.length > 0) {
        currentRequirement.description += (currentRequirement.description ? '\n' : '') + line;
        
        // Detect ambiguous language
        const ambiguous = detectAmbiguousLanguage(line);
        if (ambiguous.length > 0) {
          currentRequirement.qualityIssues.push({
            type: 'ambiguous_language',
            words: ambiguous,
            context: line
          });
        }
      }
    } else if (currentModule && line.length > 0) {
      // Accumulate module description
      currentModule.description += (currentModule.description ? '\n' : '') + line;
    }
  }

  // Finalize last requirement and module
  if (currentRequirement && currentModule) {
    currentModule.requirements.push(currentRequirement);
  }
  if (currentModule) {
    modules.push(currentModule);
  }

  return { modules };
}

/**
 * Detect requirement priority from text
 * @param {string} text - Text to analyze
 * @returns {string} Priority level
 */
function detectPriority(text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('critical') || lowerText.includes('关键') || 
      lowerText.includes('必须') || lowerText.includes('p0')) {
    return 'P0';
  }
  if (lowerText.includes('high') || lowerText.includes('重要') || 
      lowerText.includes('p1')) {
    return 'P1';
  }
  if (lowerText.includes('medium') || lowerText.includes('中等') || 
      lowerText.includes('p2')) {
    return 'P2';
  }
  if (lowerText.includes('low') || lowerText.includes('较低') || 
      lowerText.includes('p3')) {
    return 'P3';
  }
  
  return 'P2'; // Default to medium priority
}

/**
 * Extract tables from DOCX for structured requirements
 * @param {string} filePath - Path to DOCX file
 * @returns {Promise<Array>} Extracted tables
 */
async function extractTables(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    // Note: mammoth doesn't preserve table structure well
    // For better table extraction, consider using docx library
    return {
      text: result.value,
      tables: [] // Placeholder for table extraction
    };
  } catch (error) {
    throw new Error(`Failed to extract tables from ${filePath}: ${error.message}`);
  }
}

module.exports = {
  parseDocx,
  parseDocxMarkdown,
  detectPriority,
  extractTables
};
