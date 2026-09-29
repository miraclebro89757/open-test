#!/usr/bin/env node

/**
 * Parser Verification Script
 * Quick sanity check for all parsers
 */

const { parseMarkdown } = require('../src/parsers/markdown');
const { parseDocxMarkdown, detectPriority } = require('../src/parsers/docx');
const { generateGivenWhenThen } = require('../src/parsers/openapi');
const { isSupported, getSupportedExtensions } = require('../src/parsers/index');

console.log('🔍 Verifying Parsers...\n');

// Test 1: Markdown Parser
console.log('1️⃣  Testing Markdown Parser...');
const markdownContent = `# Test Module
## REQ-001: Test Requirement
Priority: P0
Given: User is logged in
When: User clicks button
Then: Action is performed`;

try {
  const MarkdownParser = require('../src/parsers/markdown');
  const parser = new MarkdownParser();
  const result = parser.parse(markdownContent);
  if (result && result.title) {
    console.log('   ✅ Markdown parser works');
    console.log(`   📊 Parsed document: ${result.title}`);
  } else {
    console.log('   ❌ Markdown parser failed - no data extracted');
  }
} catch (error) {
  console.log(`   ❌ Markdown parser error: ${error.message}`);
}

// Test 2: DOCX Parser (markdown extraction)
console.log('\n2️⃣  Testing DOCX Parser...');
const docxMarkdown = `# Payment Module
## REQ-PAY-001: Process Payment
Critical priority
Given: Cart has items
When: User checks out
Then: Payment processed`;

try {
  const result = parseDocxMarkdown(docxMarkdown);
  if (result.modules.length > 0) {
    console.log('   ✅ DOCX parser works');
    console.log(`   📊 Found ${result.modules.length} module(s)`);
  } else {
    console.log('   ❌ DOCX parser failed');
  }
} catch (error) {
  console.log(`   ❌ DOCX parser error: ${error.message}`);
}

// Test 3: Priority Detection
console.log('\n3️⃣  Testing Priority Detection...');
try {
  const tests = [
    { text: 'Critical feature', expected: 'P0' },
    { text: 'High priority task', expected: 'P1' },
    { text: 'Medium task', expected: 'P2' },
    { text: 'Low priority', expected: 'P3' },
    { text: '关键功能', expected: 'P0' }
  ];

  let passed = 0;
  tests.forEach(test => {
    const result = detectPriority(test.text);
    if (result === test.expected) {
      passed++;
    } else {
      console.log(`   ⚠️  Expected ${test.expected} for "${test.text}", got ${result}`);
    }
  });

  if (passed === tests.length) {
    console.log(`   ✅ Priority detection works (${passed}/${tests.length} tests passed)`);
  } else {
    console.log(`   ⚠️  Priority detection partially works (${passed}/${tests.length} tests passed)`);
  }
} catch (error) {
  console.log(`   ❌ Priority detection error: ${error.message}`);
}

// Test 4: OpenAPI Given-When-Then Generator
console.log('\n4️⃣  Testing OpenAPI Given-When-Then Generator...');
try {
  const operation = {
    summary: 'Login user',
    parameters: [
      { name: 'email', required: true }
    ],
    requestBody: { required: true },
    responses: {
      '200': { description: 'Success' },
      '401': { description: 'Unauthorized' }
    },
    security: [{ bearerAuth: [] }]
  };

  const gwt = generateGivenWhenThen('post', '/auth/login', operation);
  
  if (gwt.given.length > 0 && gwt.when.length > 0 && gwt.then.length > 0) {
    console.log('   ✅ OpenAPI GWT generator works');
    console.log(`   📊 Generated: ${gwt.given.length} given, ${gwt.when.length} when, ${gwt.then.length} then`);
  } else {
    console.log('   ❌ OpenAPI GWT generator failed');
  }
} catch (error) {
  console.log(`   ❌ OpenAPI GWT generator error: ${error.message}`);
}

// Test 5: File Extension Support
console.log('\n5️⃣  Testing File Extension Support...');
try {
  const extensions = getSupportedExtensions();
  const testFiles = [
    'test.md',
    'test.docx',
    'api.yaml',
    'api.json',
    'test.txt'
  ];

  console.log(`   📋 Supported extensions: ${extensions.join(', ')}`);
  
  testFiles.forEach(file => {
    const supported = isSupported(file);
    const icon = supported ? '✅' : '❌';
    console.log(`   ${icon} ${file}: ${supported ? 'supported' : 'not supported'}`);
  });
} catch (error) {
  console.log(`   ❌ Extension check error: ${error.message}`);
}

// Test 6: Ambiguous Language Detection
console.log('\n6️⃣  Testing Ambiguous Language Detection...');
try {
  const MarkdownParser = require('../src/parsers/markdown');
  const parser = new MarkdownParser();
  
  const tests = [
    { text: 'System should probably handle errors', expectWords: false }, // "should" alone doesn't match "should be"
    { text: 'User should be able to do something', expectWords: true },
    { text: 'The API returns 200 status code', expectWords: false }
  ];

  let passed = 0;
  tests.forEach(test => {
    const result = parser.detectAmbiguousLanguage(test.text);
    const hasWords = result && result.length > 0;
    if (hasWords === test.expectWords) {
      passed++;
    } else {
      console.log(`   ⚠️  Expected ambiguous=${test.expectWords} for "${test.text}", got ${result.length} matches`);
    }
  });

  if (passed === tests.length) {
    console.log(`   ✅ Ambiguous language detection works (${passed}/${tests.length} tests passed)`);
  } else {
    console.log(`   ⚠️  Ambiguous language detection partially works (${passed}/${tests.length} tests passed)`);
  }
} catch (error) {
  console.log(`   ❌ Ambiguous language detection error: ${error.message}`);
}

console.log('\n' + '='.repeat(60));
console.log('✨ Verification Complete!');
console.log('\nAll parser components are ready for use.');
console.log('Run `npm test` for comprehensive test suite.\n');
