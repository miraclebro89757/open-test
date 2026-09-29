/**
 * Parser Integration Tests
 * Tests for Markdown, DOCX, and OpenAPI parsers
 */

const fs = require('fs').promises;
const path = require('path');
const { parseDocument, parseMarkdown, parseDocx, parseOpenAPI } = require('../src/parsers');

describe('Document Parsers', () => {
  const testDataDir = path.join(__dirname, 'fixtures');

  beforeAll(async () => {
    // Create test fixtures directory
    await fs.mkdir(testDataDir, { recursive: true });
  });

  describe('Markdown Parser', () => {
    test('should parse basic markdown with modules and requirements', async () => {
      const mdContent = `# User Authentication Module

This module handles user login and registration.

## Requirements

### REQ-001: User Login
Priority: P0

Given: User has valid credentials
When: User submits login form
Then: User is authenticated and redirected to dashboard

Functional: Support email and username login
Performance: Response time < 500ms

### REQ-002: Password Reset
Priority: P1

User should be able to reset forgotten password.
`;

      const filePath = path.join(testDataDir, 'test.md');
      await fs.writeFile(filePath, mdContent);

      const result = await parseMarkdown(filePath);

      expect(result.type).toBe('markdown');
      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].name).toBe('User Authentication Module');
      expect(result.modules[0].requirements).toHaveLength(2);
      
      const req1 = result.modules[0].requirements[0];
      expect(req1.title).toBe('REQ-001: User Login');
      expect(req1.priority).toBe('P0');
      expect(req1.givenWhenThen.given).toContain('User has valid credentials');
      expect(req1.givenWhenThen.when).toContain('User submits login form');
      expect(req1.givenWhenThen.then).toContain('User is authenticated and redirected to dashboard');
    });

    test('should detect ambiguous language', async () => {
      const mdContent = `# Test Module

## REQ-001: Vague Requirement

The system should probably handle errors appropriately and maybe log them.
Users might want to see some feedback.
`;

      const filePath = path.join(testDataDir, 'ambiguous.md');
      await fs.writeFile(filePath, mdContent);

      const result = await parseMarkdown(filePath);
      const req = result.modules[0].requirements[0];

      expect(req.qualityIssues).toBeDefined();
      expect(req.qualityIssues.length).toBeGreaterThan(0);
      expect(req.qualityIssues[0].type).toBe('ambiguous_language');
    });
  });

  describe('DOCX Parser', () => {
    test('should parse markdown extracted from DOCX', () => {
      const { parseDocxMarkdown } = require('../src/parsers/docx');
      
      const mdContent = `# Payment Module

## REQ-PAY-001: Process Payment

Given: User has selected items in cart
When: User clicks checkout
Then: Payment is processed successfully

Priority: P0
`;

      const result = parseDocxMarkdown(mdContent);

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].name).toBe('Payment Module');
      expect(result.modules[0].requirements).toHaveLength(1);
      
      const req = result.modules[0].requirements[0];
      expect(req.title).toBe('REQ-PAY-001: Process Payment');
      expect(req.priority).toBe('P0');
      expect(req.givenWhenThen.given).toContain('User has selected items in cart');
    });

    test('should detect priority from text', () => {
      const { detectPriority } = require('../src/parsers/docx');

      expect(detectPriority('Critical feature')).toBe('P0');
      expect(detectPriority('High priority task')).toBe('P1');
      expect(detectPriority('Medium importance')).toBe('P2');
      expect(detectPriority('Low priority')).toBe('P3');
      expect(detectPriority('关键功能')).toBe('P0');
      expect(detectPriority('Normal task')).toBe('P2');
    });
  });

  describe('OpenAPI Parser', () => {
    test('should parse OpenAPI spec and extract requirements', async () => {
      const openAPISpec = {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0'
        },
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              operationId: 'listUsers',
              tags: ['Users'],
              parameters: [
                {
                  name: 'limit',
                  in: 'query',
                  required: false,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '200': {
                  description: 'Successful response',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { type: 'object' }
                      }
                    }
                  }
                },
                '401': {
                  description: 'Unauthorized'
                }
              },
              security: [{ bearerAuth: [] }]
            }
          }
        }
      };

      const filePath = path.join(testDataDir, 'api.json');
      await fs.writeFile(filePath, JSON.stringify(openAPISpec, null, 2));

      const result = await parseOpenAPI(filePath);

      expect(result.type).toBe('openapi');
      expect(result.version).toBe('3.0.0');
      expect(result.requirements).toHaveLength(1);
      
      const req = result.requirements[0];
      expect(req.id).toBe('listUsers');
      expect(req.title).toBe('List users');
      expect(req.method).toBe('GET');
      expect(req.path).toBe('/users');
      expect(req.parameters).toHaveLength(1);
      expect(req.responses).toHaveLength(2);
      
      // Check Given-When-Then
      expect(req.givenWhenThen.given).toContain('User is authenticated');
      expect(req.givenWhenThen.when[0]).toContain('GET request to /users');
      expect(req.givenWhenThen.then[0]).toContain('200 response');
    });

    test('should generate test points with 4 dimensions', async () => {
      const openAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/data': {
            post: {
              operationId: 'createData',
              parameters: [
                { name: 'id', in: 'path', required: true }
              ],
              requestBody: { required: true },
              responses: {
                '201': { description: 'Created' },
                '400': { description: 'Bad Request' },
                '401': { description: 'Unauthorized' }
              },
              security: [{ apiKey: [] }]
            }
          }
        }
      };

      const filePath = path.join(testDataDir, 'test-points.json');
      await fs.writeFile(filePath, JSON.stringify(openAPISpec, null, 2));

      const result = await parseOpenAPI(filePath);
      const testPoints = result.testPoints;

      expect(testPoints.length).toBeGreaterThan(0);

      // Check for all 4 dimensions
      const angles = testPoints.map(tp => tp.angle);
      expect(angles).toContain('Functional');
      expect(angles).toContain('Exception');
      expect(angles).toContain('Security');
      expect(angles).toContain('Performance');

      // Verify functional test point
      const functionalTP = testPoints.find(tp => tp.angle === 'Functional');
      expect(functionalTP).toBeDefined();
      expect(functionalTP.id).toContain('functional_success');

      // Verify exception test points
      const exceptionTPs = testPoints.filter(tp => tp.angle === 'Exception');
      expect(exceptionTPs.length).toBeGreaterThanOrEqual(2); // 400, 401

      // Verify security test points
      const securityTPs = testPoints.filter(tp => tp.angle === 'Security');
      expect(securityTPs.length).toBeGreaterThanOrEqual(1); // auth check
    });
  });

  describe('Universal parseDocument', () => {
    test('should route to correct parser based on extension', async () => {
      const mdPath = path.join(testDataDir, 'route-test.md');
      await fs.writeFile(mdPath, '# Test\n## REQ-001: Test');

      const result = await parseDocument(mdPath);
      expect(result.type).toBe('markdown');
    });

    test('should throw error for unsupported format', async () => {
      const txtPath = path.join(testDataDir, 'test.txt');
      await fs.writeFile(txtPath, 'plain text');

      await expect(parseDocument(txtPath)).rejects.toThrow('Unsupported file format');
    });
  });

  afterAll(async () => {
    // Cleanup test fixtures
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
});
