/**
 * Integration tests for HAR Analyzer
 */

const fs = require('fs').promises;
const path = require('path');
const {
  analyzeHAR,
  extractBasicInfo,
  performAIAnalysis,
  fallbackAnalysis,
  SENSITIVE_PATTERNS,
  DYNAMIC_PATTERNS,
} = require('./har-analyzer');

describe('HAR Analyzer', () => {
  const fixturesDir = path.join(__dirname, '__fixtures__');
  const testHarPath = path.join(fixturesDir, 'test.har');
  
  beforeAll(async () => {
    // Create fixtures directory
    await fs.mkdir(fixturesDir, { recursive: true });
    
    // Create sample HAR file
    const sampleHAR = {
      log: {
        version: '1.2',
        creator: { name: 'OpenTest', version: '1.0' },
        entries: [
          // Entry 0: Login request
          {
            startedDateTime: '2024-01-01T10:00:00.000Z',
            time: 150,
            request: {
              method: 'POST',
              url: 'https://api.example.com/auth/login',
              headers: [
                { name: 'Content-Type', value: 'application/json' },
              ],
              postData: {
                mimeType: 'application/json',
                text: JSON.stringify({
                  username: 'test@example.com',
                  password: 'secret123',
                }),
              },
            },
            response: {
              status: 200,
              headers: [
                { name: 'Content-Type', value: 'application/json' },
              ],
              content: {
                mimeType: 'application/json',
                text: JSON.stringify({
                  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.signature',
                  userId: '12345',
                  expiresIn: 3600,
                }),
              },
            },
          },
          // Entry 1: Get user profile (uses token from login)
          {
            startedDateTime: '2024-01-01T10:00:01.000Z',
            time: 80,
            request: {
              method: 'GET',
              url: 'https://api.example.com/users/12345',
              headers: [
                { name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.signature' },
                { name: 'Accept', value: 'application/json' },
              ],
            },
            response: {
              status: 200,
              headers: [
                { name: 'Content-Type', value: 'application/json' },
              ],
              content: {
                mimeType: 'application/json',
                text: JSON.stringify({
                  id: '12345',
                  name: 'Test User',
                  email: 'test@example.com',
                }),
              },
            },
          },
          // Entry 2: Create resource (uses token)
          {
            startedDateTime: '2024-01-01T10:00:02.000Z',
            time: 120,
            request: {
              method: 'POST',
              url: 'https://api.example.com/resources',
              headers: [
                { name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.signature' },
                { name: 'Content-Type', value: 'application/json' },
              ],
              postData: {
                mimeType: 'application/json',
                text: JSON.stringify({
                  name: 'New Resource',
                  type: 'document',
                }),
              },
            },
            response: {
              status: 201,
              headers: [
                { name: 'Content-Type', value: 'application/json' },
              ],
              content: {
                mimeType: 'application/json',
                text: JSON.stringify({
                  id: 'abc-def-123',
                  name: 'New Resource',
                  createdAt: 1704103202000,
                }),
              },
            },
          },
        ],
      },
    };
    
    await fs.writeFile(testHarPath, JSON.stringify(sampleHAR, null, 2), 'utf-8');
  });
  
  afterAll(async () => {
    // Cleanup fixtures
    try {
      await fs.rm(fixturesDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  describe('extractBasicInfo', () => {
    test('should extract endpoints from HAR entries', async () => {
      const harContent = await fs.readFile(testHarPath, 'utf-8');
      const har = JSON.parse(harContent);
      const result = extractBasicInfo(har.log.entries);
      
      expect(result.endpoints).toHaveLength(3);
      expect(result.endpoints).toContain('POST /auth/login');
      expect(result.endpoints).toContain('GET /users/12345');
      expect(result.endpoints).toContain('POST /resources');
    });
    
    test('should detect sensitive data patterns', async () => {
      const harContent = await fs.readFile(testHarPath, 'utf-8');
      const har = JSON.parse(harContent);
      const result = extractBasicInfo(har.log.entries);
      
      // Should detect password, token in requests/responses
      expect(result.sensitiveFields.length).toBeGreaterThan(0);
      
      const categories = result.sensitiveFields.map(f => f.category);
      expect(categories).toContain('password');
      expect(categories).toContain('token');
    });
  });
  
  describe('fallbackAnalysis', () => {
    test('should perform basic analysis without AI', async () => {
      const harContent = await fs.readFile(testHarPath, 'utf-8');
      const har = JSON.parse(harContent);
      const result = fallbackAnalysis(har.log.entries);
      
      expect(result).toHaveProperty('variables');
      expect(result).toHaveProperty('dependencies');
      expect(result).toHaveProperty('requestChains');
      expect(result).toHaveProperty('recommendations');
      
      // Should detect token in response
      expect(result.variables.length).toBeGreaterThan(0);
      
      // Should have default chain
      expect(result.requestChains).toHaveLength(1);
      expect(result.requestChains[0].requests).toEqual([0, 1, 2]);
    });
    
    test('should extract ID patterns from responses', async () => {
      const harContent = await fs.readFile(testHarPath, 'utf-8');
      const har = JSON.parse(harContent);
      const result = fallbackAnalysis(har.log.entries);
      
      // Should detect userId and resource ID
      const varNames = result.variables.map(v => v.name);
      expect(varNames.some(n => n.includes('token') || n.includes('id'))).toBe(true);
    });
  });
  
  describe('analyzeHAR', () => {
    test('should analyze HAR file with mock LLM client', async () => {
      const mockLLM = {
        chat: async () => {
          // Simulate AI response
          return JSON.stringify({
            variables: [
              {
                name: 'auth_token',
                location: 'response[0].body.token',
                type: 'string',
                usedIn: [1, 2],
                example: 'eyJ...',
              },
              {
                name: 'user_id',
                location: 'response[0].body.userId',
                type: 'string',
                usedIn: [1],
                example: '12345',
              },
            ],
            dependencies: [
              {
                from: 0,
                to: 1,
                variable: 'auth_token',
                extraction: 'response.body.token',
                injection: 'headers.Authorization',
              },
              {
                from: 0,
                to: 2,
                variable: 'auth_token',
                extraction: 'response.body.token',
                injection: 'headers.Authorization',
              },
            ],
            requestChains: [
              {
                name: 'User Authentication Flow',
                requests: [0, 1, 2],
                purpose: 'Login and perform authenticated operations',
              },
            ],
            recommendations: [
              'Extract auth_token from login response',
              'Use environment variables for credentials',
            ],
          });
        },
      };
      
      const result = await analyzeHAR(testHarPath, mockLLM);
      
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('endpoints');
      expect(result).toHaveProperty('variables');
      expect(result).toHaveProperty('dependencies');
      expect(result).toHaveProperty('sensitiveData');
      
      expect(result.summary.totalRequests).toBe(3);
      expect(result.variables.length).toBeGreaterThan(0);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });
    
    test('should handle LLM failure gracefully with fallback', async () => {
      const failingLLM = {
        chat: async () => {
          throw new Error('LLM service unavailable');
        },
      };
      
      const result = await analyzeHAR(testHarPath, failingLLM);
      
      // Should still return results using fallback
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('variables');
      expect(result).toHaveProperty('recommendations');
      
      // Fallback should recommend manual review
      expect(result.recommendations.some(r => r.includes('Manual review'))).toBe(true);
    });
    
    test('should throw error for invalid HAR file', async () => {
      const invalidHarPath = path.join(fixturesDir, 'invalid.har');
      await fs.writeFile(invalidHarPath, JSON.stringify({ invalid: true }), 'utf-8');
      
      const mockLLM = { chat: async () => '{}' };
      
      await expect(analyzeHAR(invalidHarPath, mockLLM)).rejects.toThrow('Invalid HAR format');
      
      await fs.unlink(invalidHarPath);
    });
  });
  
  describe('SENSITIVE_PATTERNS', () => {
    test('should have correct sensitive patterns', () => {
      expect(SENSITIVE_PATTERNS).toHaveProperty('password');
      expect(SENSITIVE_PATTERNS).toHaveProperty('apiKey');
      expect(SENSITIVE_PATTERNS).toHaveProperty('token');
      expect(SENSITIVE_PATTERNS).toHaveProperty('secret');
      expect(SENSITIVE_PATTERNS).toHaveProperty('credential');
      
      // Test pattern matching
      expect(SENSITIVE_PATTERNS.password.test('password')).toBe(true);
      expect(SENSITIVE_PATTERNS.password.test('PASSWORD')).toBe(true);
      expect(SENSITIVE_PATTERNS.apiKey.test('api_key')).toBe(true);
      expect(SENSITIVE_PATTERNS.token.test('authorization')).toBe(true);
    });
  });
  
  describe('DYNAMIC_PATTERNS', () => {
    test('should match UUID pattern', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const matches = uuid.match(DYNAMIC_PATTERNS.uuid);
      expect(matches).toBeTruthy();
      expect(matches[0]).toBe(uuid);
    });
    
    test('should match JWT pattern', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.signature';
      const matches = jwt.match(DYNAMIC_PATTERNS.jwt);
      expect(matches).toBeTruthy();
    });
    
    test('should match timestamp pattern', () => {
      const timestamp = '1704103202000';
      const matches = timestamp.match(DYNAMIC_PATTERNS.timestamp);
      expect(matches).toBeTruthy();
    });
    
    test('should match numeric ID pattern', () => {
      const id = '123456';
      const matches = id.match(DYNAMIC_PATTERNS.numericId);
      expect(matches).toBeTruthy();
    });
  });
});
