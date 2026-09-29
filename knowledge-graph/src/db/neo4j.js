const neo4j = require('neo4j-driver');
require('dotenv').config();

/**
 * Neo4j Database Client
 * Singleton pattern for connection management
 */
class Neo4jClient {
  constructor() {
    this.driver = null;
    this.connected = false;
  }

  /**
   * Connect to Neo4j database
   */
  async connect() {
    if (this.connected) {
      return this.driver;
    }

    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD;

    if (!password) {
      throw new Error('NEO4J_PASSWORD environment variable is required');
    }

    try {
      this.driver = neo4j.driver(
        uri,
        neo4j.auth.basic(user, password),
        {
          maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 60 * 1000, // 60 seconds
        }
      );

      // Verify connectivity
      await this.driver.verifyConnectivity();
      this.connected = true;

      console.log('✅ Neo4j connected successfully');
      console.log(`   URI: ${uri}`);
      console.log(`   User: ${user}`);

      return this.driver;
    } catch (error) {
      console.error('❌ Failed to connect to Neo4j:', error.message);
      throw error;
    }
  }

  /**
   * Get a session for executing queries
   * @param {string} database - Database name (default: neo4j)
   * @param {string} mode - Access mode (READ or WRITE)
   */
  getSession(database = 'neo4j', mode = 'WRITE') {
    if (!this.connected) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }

    const accessMode = mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE;
    
    return this.driver.session({
      database,
      defaultAccessMode: accessMode
    });
  }

  /**
   * Execute a single Cypher query
   * @param {string} cypher - Cypher query string
   * @param {object} params - Query parameters
   * @param {string} database - Database name
   */
  async run(cypher, params = {}, database = 'neo4j') {
    const session = this.getSession(database);
    
    try {
      const result = await session.run(cypher, params);
      return result.records;
    } catch (error) {
      console.error('Query execution error:', error.message);
      console.error('Cypher:', cypher);
      console.error('Params:', params);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a transaction with multiple queries
   * @param {function} txFunc - Transaction function
   * @param {string} database - Database name
   */
  async runTransaction(txFunc, database = 'neo4j') {
    const session = this.getSession(database);
    
    try {
      return await session.executeWrite(txFunc);
    } catch (error) {
      console.error('Transaction execution error:', error.message);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Initialize database schema (constraints and indexes)
   */
  async initializeSchema() {
    console.log('Initializing Neo4j schema...');
    
    const constraints = [
      'CREATE CONSTRAINT module_id_unique IF NOT EXISTS FOR (m:Module) REQUIRE m.id IS UNIQUE',
      'CREATE CONSTRAINT req_id_version_unique IF NOT EXISTS FOR (r:Requirement) REQUIRE (r.id, r.version) IS UNIQUE',
      'CREATE CONSTRAINT test_point_id_unique IF NOT EXISTS FOR (tp:TestPoint) REQUIRE tp.id IS UNIQUE',
      'CREATE CONSTRAINT test_case_id_unique IF NOT EXISTS FOR (tc:TestCase) REQUIRE tc.id IS UNIQUE',
      'CREATE CONSTRAINT run_execution_id_unique IF NOT EXISTS FOR (re:RunExecution) REQUIRE re.id IS UNIQUE'
    ];

    const indexes = [
      'CREATE INDEX module_name_index IF NOT EXISTS FOR (m:Module) ON (m.name)',
      'CREATE INDEX req_status_index IF NOT EXISTS FOR (r:Requirement) ON (r.status)',
      'CREATE INDEX req_priority_index IF NOT EXISTS FOR (r:Requirement) ON (r.priority)',
      'CREATE INDEX req_module_index IF NOT EXISTS FOR (r:Requirement) ON (r.module_id)',
      'CREATE INDEX test_point_angle_index IF NOT EXISTS FOR (tp:TestPoint) ON (tp.angle)',
      'CREATE INDEX test_point_status_index IF NOT EXISTS FOR (tp:TestPoint) ON (tp.status)',
      'CREATE INDEX test_case_status_index IF NOT EXISTS FOR (tc:TestCase) ON (tc.status)',
      'CREATE INDEX test_case_file_index IF NOT EXISTS FOR (tc:TestCase) ON (tc.file_path)',
      'CREATE INDEX run_execution_status_index IF NOT EXISTS FOR (re:RunExecution) ON (re.status)',
      'CREATE INDEX run_execution_timestamp_index IF NOT EXISTS FOR (re:RunExecution) ON (re.timestamp)'
    ];

    try {
      // Create constraints
      for (const constraint of constraints) {
        await this.run(constraint);
        console.log('  ✓ Created constraint');
      }

      // Create indexes
      for (const index of indexes) {
        await this.run(index);
        console.log('  ✓ Created index');
      }

      console.log('✅ Schema initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize schema:', error.message);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const query = `
      MATCH (n)
      WITH labels(n) AS labels, count(*) AS count
      RETURN labels[0] AS nodeType, count
      ORDER BY count DESC
    `;

    const records = await this.run(query);
    
    const stats = {};
    for (const record of records) {
      stats[record.get('nodeType')] = record.get('count').toNumber();
    }

    return stats;
  }

  /**
   * Close the database connection
   */
  async close() {
    if (this.driver) {
      await this.driver.close();
      this.connected = false;
      console.log('Neo4j connection closed');
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.driver.verifyConnectivity();
      return { status: 'healthy', connected: true };
    } catch (error) {
      return { status: 'unhealthy', connected: false, error: error.message };
    }
  }
}

// Export singleton instance
const client = new Neo4jClient();

module.exports = client;
