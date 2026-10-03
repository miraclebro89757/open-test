/**
 * Integration tests for HAR Renderer
 */

const fs = require('fs').promises;
const path = require('path');
const {
  renderHARToPytest,
  generateImports,
  generateConstants,
  generateTestFunction,
  generateEnvExample,
  generateTestReadme,
} = require('./har-renderer');

describe('HAR Renderer', () => {
  const fixturesDir = path.join(__dirname, '__fixtures__');
  const testHarPath = path.join(fixturesDir, 'render-test.har');
  
  let sampleAnalysis;
  
  beforeAll(async () => {
    // Create fixtures directory
    await fs.mkdir(fixturesDir, { recursive: true });
    
    // Create sample HAR file
    const sampleHAR = {
      log: {
        version: '1.2',
        creator: { name: 'OpenTest', version: '1.0' },
        entries: [
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
                text: JSON.stringify({ username: 'test@example.com', password: 'secret' }),
              },
            },
            response: {
              status: 200,
              headers: [
                { name: 'Content-Type', value: 'application/json' },
              ],
              content: {
                mimeType: 'application/json',
                text: JSON.stringify({ token: 'jwt-token-here', userId: '12345' }),
              },
            },
          },
          {
            startedDateTime: '2024-01-01T10:00:01.000Z',
            time: 80,
            request: {
              method: 'GET',
              url: 'https://api.example.com/users/12345',
              headers: [
                { name: 'Authorization', value: 'Bearer jwt-token-here' },
              ],
            },
            response: {
              status: 200,
              headers: [
                { name: 'Content-Type', value: 'application/json' },
              ],
              content: {
                mimeType: 'application/json',
                text: JSON.stringify({ id: '12345', name: 'Test User' }),
              },
            },
          },
        ],
      },
    };
    
    await fs.writeFile(testHarPath, JSON.stringify(sampleHAR, null, 2), 'utf-8');
    
    // Sample analysis result
    sampleAnalysis = {
      summary: {
        totalRequests: 2,
        uniqueEndpoints: 2,
        sensitiveFields: 2,
        extractedVariables: 2,
        dependencies: 1,
      },
      endpoints: ['POST /auth/login', 'GET /users/12345'],
      variables: [
        {
          name: 'auth_token',
          location: 'response[0].body.token',
          type: 'string',
          usedIn: [1],
          example: 'jwt-token-here',
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
      ],
      sensitiveData: [
        { index: 0, type: 'request', category: 'password' },
        { index: 0, type: 'response', category: 'token' },
      ],
      requestChains: [
        {
          name: 'Authentication Flow',
          requests: [0, 1],
          purpose: 'Login and fetch user profile',
        },
      ],
      recommendations: [
        'Extract auth_token from login response',
        'Use environment variables for credentials',
      ],
    };
  });
  
  afterAll(async () => {
    // Cleanup fixtures
    try {
      await fs.rm(fixturesDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  describe('generateImports', () => {
    test('should generate Python imports', () => {
      const imports = generateImports();
      
      expect(imports).toContain('import os');
      expect(imports).toContain('import pytest');
      expect(imports).toContain('import requests');
      expect(imports).toContain('import json');
      expect(imports).toContain('from dotenv import load_dotenv');
    });
  });
  
  describe('generateConstants', () => {
    test('should generate configuration constants', () => {
      const constants = generateConstants(sampleAnalysis, 'https://api.example.com');
      
      expect(constants).toContain('BASE_URL = os.getenv("API_BASE_URL", "https://api.example.com")');
      expect(constants).toContain('TIMEOUT = int(os.getenv("API_TIMEOUT", "30"))');
      expect(constants).toContain('VERIFY_SSL');
      expect(constants).toContain('TEST_DATA = {');
    });
    
    test('should use default base URL when not provided', () => {
      const constants = generateConstants(sampleAnalysis, null);
      
      expect(constants).toContain('http://localhost:3000');
    });
  });
  
  describe('generateEnvExample', () => {
    test('should generate .env.example with sensitive variables', () => {
      const envExample = generateEnvExample(sampleAnalysis);
      
      expect(envExample).toContain('API_BASE_URL=');
      expect(envExample).toContain('API_TIMEOUT=');
      expect(envExample).toContain('VERIFY_SSL=');
      expect(envExample).toContain('PASSWORD=');
      expect(envExample).toContain('TOKEN=');
    });
    
    test('should handle no sensitive data', () => {
      const analysisNoSensitive = { ...sampleAnalysis, sensitiveData: [] };
      const envExample = generateEnvExample(analysisNoSensitive);
      
      expect(envExample).toContain('No sensitive variables detected');
    });
  });
  
  describe('generateTestReadme', () => {
    test('should generate comprehensive README', () => {
      const readme = generateTestReadme('test_api_scenario', sampleAnalysis);
      
      expect(readme).toContain('# API Test: test_api_scenario');
      expect(readme).toContain('## Requirements');
      expect(readme).toContain('pip install pytest requests python-dotenv');
      expect(readme).toContain('## Setup');
      expect(readme).toContain('## Run');
      expect(readme).toContain('pytest test_api_scenario.py');
      expect(readme).toContain('## Analysis Summary');
      expect(readme).toContain('Total Requests: 2');
      expect(readme).toContain('Extracted Variables: 2');
      expect(readme).toContain('## Extracted Variables');
      expect(readme).toContain('auth_token');
      expect(readme).toContain('## Request Dependencies');
      expect(readme).toContain('## Recommendations');
    });
  });
  
  describe('renderHARToPytest', () => {
    test('should render complete pytest script', async () => {
      const scripts = await renderHARToPytest(testHarPath, sampleAnalysis, {
        testName: 'test_auth_flow',
        includeCleanup: true,
        includeAssertions: true,
      });
      
      expect(scripts).toHaveProperty('pytestScript');
      expect(scripts).toHaveProperty('envExample');
      expect(scripts).toHaveProperty('readme');
      
      const script = scripts.pytestScript;
      
      // Check imports
      expect(script).toContain('import pytest');
      expect(script).toContain('import requests');
      
      // Check configuration
      expect(script).toContain('BASE_URL =');
      expect(script).toContain('TIMEOUT =');
      
      // Check fixtures
      expect(script).toContain('@pytest.fixture');
      expect(script).toContain('def api_session():');
      
      // Check cleanup hooks
      expect(script).toContain('def setup_and_teardown():');
      expect(script).toContain('def cleanup_test_data():');
      
      // Check test function
      expect(script).toContain('def test_auth_flow(api_session):');
      
      // Check HTTP requests
      expect(script).toContain('api_session.post(');
      expect(script).toContain('api_session.get(');
      
      // Check assertions
      expect(script).toContain('assert response_0.status_code == 200');
      expect(script).toContain('assert response_1.status_code == 200');
      
      // Check variable extraction
      expect(script).toContain('TEST_DATA["auth_token"]');
      
      // Check helper functions
      expect(script).toContain('def extract_json_value(');
      expect(script).toContain('def wait_for_async_operation(');
    });
    
    test('should handle cleanup disabled', async () => {
      const scripts = await renderHARToPytest(testHarPath, sampleAnalysis, {
        testName: 'test_no_cleanup',
        includeCleanup: false,
      });
      
      const script = scripts.pytestScript;
      expect(script).not.toContain('def setup_and_teardown():');
      expect(script).not.toContain('def cleanup_test_data():');
    });
    
    test('should handle assertions disabled', async () => {
      const scripts = await renderHARToPytest(testHarPath, sampleAnalysis, {
        testName: 'test_no_assertions',
        includeAssertions: false,
      });
      
      const script = scripts.pytestScript;
      // Should still have the test but without detailed assertions
      expect(script).toContain('def test_no_assertions(api_session):');
    });
    
    test('should generate valid Python syntax', async () => {
      const scripts = await renderHARToPytest(testHarPath, sampleAnalysis);
      
      const script = scripts.pytestScript;
      
      // Check for common Python syntax elements
      expect(script).not.toContain('undefined');
      expect(script).not.toContain('null'); // Should be None in Python
      expect(script).not.toContain('true'); // Should be True in Python
      expect(script).not.toContain('false'); // Should be False in Python
      
      // Check proper indentation (4 spaces for Python)
      const lines = script.split('\n');
      const indentedLines = lines.filter(line => line.startsWith('    '));
      expect(indentedLines.length).toBeGreaterThan(0);
    });
    
    test('should include step descriptions', async () => {
      const scripts = await renderHARToPytest(testHarPath, sampleAnalysis);
      
      const script = scripts.pytestScript;
      
      // Check for human-readable step descriptions
      expect(script).toContain('# Step 1:');
      expect(script).toContain('# Step 2:');
      expect(script).toContain('print(f"📤 Step');
    });
    
    test('should handle custom base URL', async () => {
      const scripts = await renderHARToPytest(testHarPath, sampleAnalysis, {
        baseUrl: 'https://staging.example.com',
      });
      
      const script = scripts.pytestScript;
      expect(script).toContain('https://staging.example.com');
    });
    
    test('should handle custom timeout', async () => {
      const scripts = await renderHARToPytest(testHarPath, sampleAnalysis, {
        timeout: 60,
      });
      
      const script = scripts.pytestScript;
      // Note: timeout option doesn't directly affect script content in current implementation
      // but the script should have timeout parameter
      expect(script).toContain('timeout=TIMEOUT');
    });
  });
  
  describe('Integration: Full rendering pipeline', () => {
    test('should produce executable pytest script structure', async () => {
      const scripts = await renderHARToPytest(testHarPath, sampleAnalysis, {
        testName: 'test_full_integration',
        baseUrl: 'https://api.example.com',
        timeout: 30,
        includeCleanup: true,
        includeAssertions: true,
      });
      
      const { pytestScript, envExample, readme } = scripts;
      
      // Verify script structure
      expect(pytestScript).toMatch(/"""[\s\S]*Auto-generated from HAR file[\s\S]*"""/);
      expect(pytestScript).toContain('import');
      expect(pytestScript).toContain('@pytest.fixture');
      expect(pytestScript).toContain('def test_full_integration(api_session):');
      expect(pytestScript).toContain('def cleanup_test_data():');
      
      // Verify env example structure
      expect(envExample).toContain('API_BASE_URL=');
      expect(envExample.split('\n').length).toBeGreaterThan(5);
      
      // Verify readme structure
      expect(readme).toContain('# API Test:');
      expect(readme).toContain('## Overview');
      expect(readme).toContain('## Requirements');
      expect(readme).toContain('## Setup');
      expect(readme).toContain('## Run');
      expect(readme).toContain('## Analysis Summary');
    });
    
    test('should handle empty analysis gracefully', async () => {
      const emptyAnalysis = {
        summary: {
          totalRequests: 2,
          uniqueEndpoints: 0,
          sensitiveFields: 0,
          extractedVariables: 0,
          dependencies: 0,
        },
        endpoints: [],
        variables: [],
        dependencies: [],
        sensitiveData: [],
        requestChains: [],
        recommendations: [],
      };
      
      const scripts = await renderHARToPytest(testHarPath, emptyAnalysis);
      
      // Should still generate valid script
      expect(scripts.pytestScript).toContain('import pytest');
      expect(scripts.pytestScript).toContain('def test_api_scenario(api_session):');
    });
  });
});
