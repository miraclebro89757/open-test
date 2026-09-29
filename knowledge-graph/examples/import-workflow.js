/**
 * End-to-End Import Workflow Example
 * Demonstrates parsing documents and importing into Neo4j
 */

const path = require('path');
const { parseDocument } = require('../src/parsers');
const { importDocument, getImportStats } = require('../src/services/importer');
const { initializeDatabase } = require('../src/db/neo4j');

async function runImportWorkflow() {
  console.log('🚀 Starting Knowledge Graph Import Workflow\n');

  try {
    // Step 1: Initialize database connection
    console.log('📊 Step 1: Initializing Neo4j connection...');
    await initializeDatabase();
    console.log('✅ Database connected\n');

    // Step 2: Parse documents
    console.log('📄 Step 2: Parsing documents...');
    
    const documents = [
      // Example: Parse a markdown PRD
      {
        path: path.join(__dirname, 'sample-prd.md'),
        type: 'markdown'
      },
      // Example: Parse an OpenAPI spec
      {
        path: path.join(__dirname, 'sample-api.json'),
        type: 'openapi'
      }
    ];

    const parsedDocs = [];
    for (const doc of documents) {
      try {
        console.log(`  Parsing: ${doc.path}`);
        const parsed = await parseDocument(doc.path);
        parsedDocs.push(parsed);
        console.log(`  ✅ Parsed ${parsed.modules?.length || 0} modules, ${parsed.requirements?.length || 0} requirements`);
      } catch (error) {
        console.error(`  ❌ Failed to parse ${doc.path}: ${error.message}`);
      }
    }
    console.log();

    // Step 3: Import into Neo4j
    console.log('💾 Step 3: Importing into Neo4j...');
    
    for (const parsed of parsedDocs) {
      try {
        console.log(`  Importing: ${parsed.filePath}`);
        const stats = await importDocument(parsed, { version: '1.0.0' });
        console.log(`  ✅ Created:`);
        console.log(`     - Modules: ${stats.modulesCreated}`);
        console.log(`     - Requirements: ${stats.requirementsCreated}`);
        console.log(`     - Test Points: ${stats.testPointsCreated}`);
        console.log(`     - Relationships: ${stats.relationshipsCreated}`);
        
        if (stats.errors.length > 0) {
          console.log(`  ⚠️  Errors: ${stats.errors.length}`);
          stats.errors.forEach(err => {
            console.log(`     - ${err.type} ${err.id || err.name}: ${err.error}`);
          });
        }
      } catch (error) {
        console.error(`  ❌ Import failed: ${error.message}`);
      }
    }
    console.log();

    // Step 4: Display overall statistics
    console.log('📈 Step 4: Overall Statistics...');
    const overallStats = await getImportStats();
    console.log(`  Total Modules: ${overallStats.modules}`);
    console.log(`  Total Requirements: ${overallStats.requirements}`);
    console.log(`  Total Test Points: ${overallStats.testPoints}`);
    console.log();

    console.log('✨ Workflow completed successfully!');

  } catch (error) {
    console.error('❌ Workflow failed:', error);
    process.exit(1);
  }
}

// Create sample PRD markdown file
async function createSamplePRD() {
  const fs = require('fs').promises;
  const sampleContent = `# User Management System

## Overview
This document describes the requirements for the User Management System.

## Module: Authentication

### REQ-AUTH-001: User Login
Priority: P0
Status: approved

Given: User has a registered account
When: User submits valid credentials (email + password)
Then: System authenticates user and creates session

Functional: Support both email and username login
Security: Passwords must be hashed using bcrypt
Performance: Authentication response < 500ms

### REQ-AUTH-002: Password Reset
Priority: P1
Status: draft

Given: User has forgotten their password
When: User requests password reset via email
Then: System sends reset link to registered email

Security: Reset links expire after 1 hour
Security: Links are single-use only

## Module: User Profile

### REQ-PROFILE-001: View Profile
Priority: P2

Given: User is authenticated
When: User navigates to profile page
Then: System displays user information

Functional: Display name, email, avatar
Performance: Page load < 1 second
`;

  const filePath = path.join(__dirname, 'sample-prd.md');
  await fs.writeFile(filePath, sampleContent);
  console.log(`Created sample PRD: ${filePath}`);
}

// Create sample OpenAPI spec
async function createSampleOpenAPI() {
  const fs = require('fs').promises;
  const sampleSpec = {
    openapi: '3.0.0',
    info: {
      title: 'User Management API',
      version: '1.0.0',
      description: 'API for user management operations'
    },
    servers: [
      { url: 'https://api.example.com/v1' }
    ],
    tags: [
      { name: 'Authentication', description: 'Auth operations' },
      { name: 'Users', description: 'User operations' }
    ],
    paths: {
      '/auth/login': {
        post: {
          summary: 'User login',
          operationId: 'loginUser',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: { type: 'object' }
                    }
                  }
                }
              }
            },
            '401': { description: 'Invalid credentials' },
            '429': { description: 'Too many attempts' }
          },
          security: []
        }
      },
      '/users/{userId}': {
        get: {
          summary: 'Get user profile',
          operationId: 'getUserProfile',
          tags: ['Users'],
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': { description: 'User profile' },
            '404': { description: 'User not found' }
          },
          security: [{ bearerAuth: [] }]
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  };

  const filePath = path.join(__dirname, 'sample-api.json');
  await fs.writeFile(filePath, JSON.stringify(sampleSpec, null, 2));
  console.log(`Created sample OpenAPI spec: ${filePath}`);
}

// Main execution
if (require.main === module) {
  (async () => {
    const command = process.argv[2];

    if (command === 'create-samples') {
      await createSamplePRD();
      await createSampleOpenAPI();
      console.log('\n✅ Sample files created. Run without arguments to import them.');
    } else {
      await runImportWorkflow();
    }

    process.exit(0);
  })();
}

module.exports = {
  runImportWorkflow,
  createSamplePRD,
  createSampleOpenAPI
};
