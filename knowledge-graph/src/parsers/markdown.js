const { marked } = require('marked');
const crypto = require('crypto');

/**
 * Markdown PRD Parser
 * 解析 Markdown 格式的需求文档，提取结构化信息
 */
class MarkdownParser {
  /**
   * Parse Markdown PRD document
   * @param {string} content - Raw Markdown content
   * @returns {object} Structured requirement data
   */
  parse(content) {
    const tokens = marked.lexer(content);
    const ast = this.buildAST(tokens);
    const requirement = this.extractRequirement(ast, content);
    
    return requirement;
  }

  /**
   * Build Abstract Syntax Tree from tokens
   */
  buildAST(tokens) {
    const ast = {
      metadata: {},
      sections: [],
      headings: []
    };

    let currentSection = null;

    for (const token of tokens) {
      if (token.type === 'heading') {
        const section = {
          level: token.depth,
          title: token.text,
          content: [],
          subsections: []
        };

        if (token.depth === 1) {
          ast.sections.push(section);
          currentSection = section;
        } else if (currentSection) {
          currentSection.subsections.push(section);
        }

        ast.headings.push(token.text);
      } else if (currentSection) {
        currentSection.content.push(token);
      }
    }

    return ast;
  }

  /**
   * Extract structured requirement from AST
   */
  extractRequirement(ast, rawContent) {
    const requirement = {
      id: this.extractRequirementId(ast),
      version: this.extractVersion(ast),
      title: this.extractTitle(ast),
      module_id: null,
      priority: this.extractPriority(ast),
      status: 'ACTIVE',
      preconditions: this.extractPreconditions(ast),
      actions: this.extractActions(ast),
      expected_outcomes: this.extractExpectedOutcomes(ast),
      raw_content: rawContent,
      hash: this.generateHash(rawContent),
      metadata: this.extractMetadata(ast)
    };

    return requirement;
  }

  /**
   * Extract requirement ID from content
   * Looks for patterns like: REQ-XXX-NN, #REQ-XXX-NN
   */
  extractRequirementId(ast) {
    // Try YAML frontmatter first
    const frontmatter = ast.metadata;
    if (frontmatter && frontmatter.id) {
      return frontmatter.id;
    }

    // Search in headings
    for (const heading of ast.headings) {
      const match = heading.match(/REQ-[A-Z]+-\d+/);
      if (match) {
        return match[0];
      }
    }

    // Search in first section
    if (ast.sections.length > 0) {
      const firstSection = ast.sections[0];
      const match = firstSection.title.match(/REQ-[A-Z]+-\d+/);
      if (match) {
        return match[0];
      }
    }

    // Generate from title hash if not found
    const title = this.extractTitle(ast);
    const hash = crypto.createHash('md5').update(title).digest('hex').substring(0, 8);
    return `REQ-AUTO-${hash.toUpperCase()}`;
  }

  /**
   * Extract version (default to v1.0 if not specified)
   */
  extractVersion(ast) {
    const frontmatter = ast.metadata;
    if (frontmatter && frontmatter.version) {
      return frontmatter.version;
    }

    // Look for version in headings
    for (const heading of ast.headings) {
      const match = heading.match(/v\d+\.\d+/i);
      if (match) {
        return match[0].toLowerCase();
      }
    }

    return 'v1.0';
  }

  /**
   * Extract title (first heading or from metadata)
   */
  extractTitle(ast) {
    if (ast.metadata && ast.metadata.title) {
      return ast.metadata.title;
    }

    if (ast.sections.length > 0) {
      return ast.sections[0].title;
    }

    return 'Untitled Requirement';
  }

  /**
   * Extract priority (P0, P1, P2, P3)
   */
  extractPriority(ast) {
    const frontmatter = ast.metadata;
    if (frontmatter && frontmatter.priority) {
      return frontmatter.priority;
    }

    // Search in content
    const content = JSON.stringify(ast);
    const match = content.match(/P[0-3]/);
    
    return match ? match[0] : 'P2'; // Default to P2
  }

  /**
   * Extract preconditions (Given)
   * Looks for sections like "前置条件", "Preconditions", "Given"
   */
  extractPreconditions(ast) {
    const preconditions = [];
    
    for (const section of ast.sections) {
      const title = section.title.toLowerCase();
      
      if (title.includes('前置条件') || 
          title.includes('precondition') || 
          title.includes('given')) {
        
        for (const token of section.content) {
          if (token.type === 'list') {
            for (const item of token.items) {
              preconditions.push(item.text);
            }
          } else if (token.type === 'paragraph') {
            preconditions.push(token.text);
          }
        }
      }

      // Check subsections
      for (const subsection of section.subsections) {
        const subTitle = subsection.title.toLowerCase();
        if (subTitle.includes('前置条件') || 
            subTitle.includes('precondition') || 
            subTitle.includes('given')) {
          
          for (const token of subsection.content) {
            if (token.type === 'list') {
              for (const item of token.items) {
                preconditions.push(item.text);
              }
            }
          }
        }
      }
    }

    return preconditions;
  }

  /**
   * Extract actions (When)
   * Looks for sections like "操作步骤", "Actions", "When"
   */
  extractActions(ast) {
    const actions = [];
    
    for (const section of ast.sections) {
      const title = section.title.toLowerCase();
      
      if (title.includes('操作') || 
          title.includes('步骤') ||
          title.includes('action') || 
          title.includes('when')) {
        
        for (const token of section.content) {
          if (token.type === 'list') {
            for (const item of token.items) {
              actions.push(item.text);
            }
          } else if (token.type === 'paragraph') {
            actions.push(token.text);
          }
        }
      }

      // Check subsections
      for (const subsection of section.subsections) {
        const subTitle = subsection.title.toLowerCase();
        if (subTitle.includes('操作') || 
            subTitle.includes('步骤') ||
            subTitle.includes('action') || 
            subTitle.includes('when')) {
          
          for (const token of subsection.content) {
            if (token.type === 'list') {
              for (const item of token.items) {
                actions.push(item.text);
              }
            }
          }
        }
      }
    }

    return actions;
  }

  /**
   * Extract expected outcomes (Then)
   * Looks for sections like "预期结果", "Expected", "Then"
   */
  extractExpectedOutcomes(ast) {
    const outcomes = [];
    
    for (const section of ast.sections) {
      const title = section.title.toLowerCase();
      
      if (title.includes('预期') || 
          title.includes('结果') ||
          title.includes('expected') || 
          title.includes('outcome') ||
          title.includes('then')) {
        
        for (const token of section.content) {
          if (token.type === 'list') {
            for (const item of token.items) {
              outcomes.push(item.text);
            }
          } else if (token.type === 'paragraph') {
            outcomes.push(token.text);
          }
        }
      }

      // Check subsections
      for (const subsection of section.subsections) {
        const subTitle = subsection.title.toLowerCase();
        if (subTitle.includes('预期') || 
            subTitle.includes('结果') ||
            subTitle.includes('expected') || 
            subTitle.includes('outcome') ||
            subTitle.includes('then')) {
          
          for (const token of subsection.content) {
            if (token.type === 'list') {
              for (const item of token.items) {
                outcomes.push(item.text);
              }
            }
          }
        }
      }
    }

    return outcomes;
  }

  /**
   * Extract YAML frontmatter metadata
   */
  extractMetadata(ast) {
    // marked doesn't parse YAML frontmatter by default
    // We'll need to handle this separately if needed
    return {};
  }

  /**
   * Generate SHA-256 hash of content
   */
  generateHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Detect ambiguous language (模糊量化检测)
   * Returns list of ambiguous phrases found
   */
  detectAmbiguousLanguage(content) {
    const ambiguousPatterns = [
      '尽量',
      '大概',
      '一般',
      '合理',
      '良好',
      '适当',
      '较快',
      '较慢',
      '可能',
      '应该',
      'try to',
      'should be',
      'reasonably',
      'as much as possible',
      'generally',
      'usually'
    ];

    const found = [];
    
    for (const pattern of ambiguousPatterns) {
      const regex = new RegExp(pattern, 'gi');
      const matches = content.match(regex);
      if (matches) {
        found.push({
          phrase: pattern,
          count: matches.length,
          positions: this.findPositions(content, pattern)
        });
      }
    }

    return found;
  }

  /**
   * Find all positions of a phrase in content
   */
  findPositions(content, phrase) {
    const positions = [];
    const regex = new RegExp(phrase, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      positions.push({
        index: match.index,
        context: content.substring(
          Math.max(0, match.index - 30),
          Math.min(content.length, match.index + phrase.length + 30)
        )
      });
    }

    return positions;
  }
}

module.exports = MarkdownParser;
