/**
 * Data Fixture Resolver
 * 数据装置管理器 - 解决测试用例中的前置数据与环境配置问题
 * 
 * 核心职责:
 * 1. 管理测试账号池 (Test Accounts Pool)
 * 2. 管理测试环境配置 (Environment Configurations)
 * 3. 管理测试数据模板 (Test Data Templates)
 * 4. 为测试用例注入确定性的 Fixtures
 */

const { getDriver } = require('../db/neo4j');

/**
 * Test Account Registry
 * 测试账号注册表
 */
class TestAccountRegistry {
  constructor() {
    this.accounts = new Map();
  }

  /**
   * Register a test account
   * @param {Object} account - Test account configuration
   */
  register(account) {
    const key = `${account.env}_${account.username}`;
    this.accounts.set(key, {
      ...account,
      registered_at: new Date().toISOString()
    });
  }

  /**
   * Get account by username and environment
   * @param {string} username - Account username
   * @param {string} env - Environment name
   * @returns {Object|null} Account configuration
   */
  get(username, env = 'STAGING_ENV_02') {
    const key = `${env}_${username}`;
    return this.accounts.get(key) || null;
  }

  /**
   * Get account by role
   * @param {string} role - User role (e.g., 'gold_member', 'new_user')
   * @param {string} env - Environment name
   * @returns {Object|null} Account configuration
   */
  getByRole(role, env = 'STAGING_ENV_02') {
    for (const [_, account] of this.accounts) {
      if (account.env === env && account.role === role) {
        return account;
      }
    }
    return null;
  }

  /**
   * List all accounts for an environment
   * @param {string} env - Environment name
   * @returns {Array} List of accounts
   */
  listByEnv(env = 'STAGING_ENV_02') {
    const accounts = [];
    for (const [_, account] of this.accounts) {
      if (account.env === env) {
        accounts.push(account);
      }
    }
    return accounts;
  }
}

/**
 * Environment Configuration Registry
 * 环境配置注册表
 */
class EnvironmentRegistry {
  constructor() {
    this.environments = new Map();
  }

  /**
   * Register an environment
   * @param {Object} env - Environment configuration
   */
  register(env) {
    this.environments.set(env.name, {
      ...env,
      registered_at: new Date().toISOString()
    });
  }

  /**
   * Get environment by name
   * @param {string} name - Environment name
   * @returns {Object|null} Environment configuration
   */
  get(name) {
    return this.environments.get(name) || null;
  }

  /**
   * List all environments
   * @returns {Array} List of environments
   */
  list() {
    return Array.from(this.environments.values());
  }
}

/**
 * Test Data Template Registry
 * 测试数据模板注册表
 */
class TestDataTemplateRegistry {
  constructor() {
    this.templates = new Map();
  }

  /**
   * Register a test data template
   * @param {Object} template - Test data template
   */
  register(template) {
    this.templates.set(template.template_id, {
      ...template,
      registered_at: new Date().toISOString()
    });
  }

  /**
   * Get template by ID
   * @param {string} templateId - Template ID
   * @returns {Object|null} Template configuration
   */
  get(templateId) {
    return this.templates.get(templateId) || null;
  }

  /**
   * Get template by scenario
   * @param {string} scenario - Test scenario (e.g., 'payment', 'login')
   * @returns {Object|null} Template configuration
   */
  getByScenario(scenario) {
    for (const [_, template] of this.templates) {
      if (template.scenario === scenario) {
        return template;
      }
    }
    return null;
  }

  /**
   * List all templates
   * @returns {Array} List of templates
   */
  list() {
    return Array.from(this.templates.values());
  }
}

/**
 * Fixture Resolver
 * 数据装置解析器 - 为测试用例注入确定性的 Fixtures
 */
class FixtureResolver {
  constructor() {
    this.accountRegistry = new TestAccountRegistry();
    this.environmentRegistry = new EnvironmentRegistry();
    this.dataTemplateRegistry = new TestDataTemplateRegistry();
    
    // Initialize with default fixtures
    this.initializeDefaultFixtures();
  }

  /**
   * Initialize default test fixtures
   */
  initializeDefaultFixtures() {
    // Register default environments
    this.environmentRegistry.register({
      name: 'STAGING_ENV_02',
      base_url: 'https://staging-02.opentest.com',
      api_base_url: 'https://api-staging-02.opentest.com',
      database: 'staging_db_02',
      redis_host: 'redis-staging-02',
      features_enabled: ['sms_2fa', 'wallet', 'payment']
    });

    this.environmentRegistry.register({
      name: 'PRODUCTION',
      base_url: 'https://opentest.com',
      api_base_url: 'https://api.opentest.com',
      database: 'production_db',
      redis_host: 'redis-prod',
      features_enabled: ['sms_2fa', 'wallet', 'payment', 'analytics']
    });

    // Register default test accounts
    this.accountRegistry.register({
      env: 'STAGING_ENV_02',
      username: 'tester_gold_01@corp.com',
      password: 'Password#2026',
      role: 'gold_member',
      initial_balance: '1000.00',
      bound_phone: '13800138000',
      phone_verified: true,
      kyc_verified: true,
      member_level: 'gold'
    });

    this.accountRegistry.register({
      env: 'STAGING_ENV_02',
      username: 'tester_new_01@corp.com',
      password: 'NewUser#2026',
      role: 'new_user',
      initial_balance: '0.00',
      bound_phone: null,
      phone_verified: false,
      kyc_verified: false,
      member_level: 'basic'
    });

    this.accountRegistry.register({
      env: 'STAGING_ENV_02',
      username: 'tester_insufficient_01@corp.com',
      password: 'Test#2026',
      role: 'insufficient_balance',
      initial_balance: '50.00',
      bound_phone: '13900139000',
      phone_verified: true,
      kyc_verified: true,
      member_level: 'silver'
    });

    // Register test data templates
    this.dataTemplateRegistry.register({
      template_id: 'TPL_PAYMENT_SMS_2FA',
      scenario: 'payment_with_sms',
      description: '支付场景 - 带短信二次验证',
      test_payload: {
        item_id: 'SKU_LAPTOP_PRO',
        item_name: 'MacBook Pro 16"',
        item_price: '100.00',
        quantity: 1,
        mock_sms_code: '902188',
        expected_sms_phone_masked: '138****8000'
      }
    });

    this.dataTemplateRegistry.register({
      template_id: 'TPL_LOGIN_STANDARD',
      scenario: 'login',
      description: '标准登录场景',
      test_payload: {
        login_method: 'email',
        remember_me: false,
        expected_redirect: '/dashboard'
      }
    });

    this.dataTemplateRegistry.register({
      template_id: 'TPL_INSUFFICIENT_BALANCE',
      scenario: 'payment_fail',
      description: '余额不足支付失败场景',
      test_payload: {
        item_id: 'SKU_EXPENSIVE_ITEM',
        item_price: '9999.00',
        expected_error_code: 'INSUFFICIENT_BALANCE',
        expected_error_msg: '账户余额不足'
      }
    });
  }

  /**
   * Resolve fixtures for a test requirement
   * @param {Object} requirement - Test requirement from Neo4j
   * @param {Object} options - Resolution options
   * @returns {Object} Resolved fixtures
   */
  async resolveForRequirement(requirement, options = {}) {
    const scenario = this.detectScenario(requirement);
    const env = options.env || 'STAGING_ENV_02';

    // Get environment configuration
    const environment = this.environmentRegistry.get(env);
    if (!environment) {
      throw new Error(`Environment ${env} not found`);
    }

    // Determine required account role
    const accountRole = this.determineAccountRole(requirement, scenario);
    const testAccount = this.accountRegistry.getByRole(accountRole, env);
    if (!testAccount) {
      throw new Error(`No test account found for role ${accountRole} in ${env}`);
    }

    // Get test data template
    const dataTemplate = this.dataTemplateRegistry.getByScenario(scenario);

    return {
      env: environment.name,
      environment,
      test_account: {
        username: testAccount.username,
        password: testAccount.password,
        initial_balance: testAccount.initial_balance,
        bound_phone: testAccount.bound_phone,
        member_level: testAccount.member_level
      },
      test_payload: dataTemplate ? dataTemplate.test_payload : {},
      scenario,
      resolved_at: new Date().toISOString()
    };
  }

  /**
   * Detect test scenario from requirement
   * @param {Object} requirement - Test requirement
   * @returns {string} Detected scenario
   */
  detectScenario(requirement) {
    const title = (requirement.title || '').toLowerCase();
    const description = (requirement.description || '').toLowerCase();
    const text = `${title} ${description}`;

    // Pattern matching for common scenarios
    if (text.includes('支付') || text.includes('payment') || text.includes('结算')) {
      if (text.includes('短信') || text.includes('sms') || text.includes('2fa')) {
        return 'payment_with_sms';
      }
      if (text.includes('余额不足') || text.includes('insufficient')) {
        return 'payment_fail';
      }
      return 'payment';
    }

    if (text.includes('登录') || text.includes('login')) {
      return 'login';
    }

    if (text.includes('注册') || text.includes('register') || text.includes('signup')) {
      return 'register';
    }

    if (text.includes('充值') || text.includes('recharge') || text.includes('topup')) {
      return 'wallet_topup';
    }

    return 'generic';
  }

  /**
   * Determine required account role for a requirement
   * @param {Object} requirement - Test requirement
   * @param {string} scenario - Test scenario
   * @returns {string} Account role
   */
  determineAccountRole(requirement, scenario) {
    const title = (requirement.title || '').toLowerCase();
    const description = (requirement.description || '').toLowerCase();
    const text = `${title} ${description}`;

    // Check for explicit role mentions
    if (text.includes('黄金会员') || text.includes('gold')) {
      return 'gold_member';
    }

    if (text.includes('新用户') || text.includes('new user')) {
      return 'new_user';
    }

    if (text.includes('余额不足') || text.includes('insufficient')) {
      return 'insufficient_balance';
    }

    // Default role by scenario
    const scenarioDefaults = {
      'payment_with_sms': 'gold_member',
      'payment': 'gold_member',
      'payment_fail': 'insufficient_balance',
      'login': 'gold_member',
      'register': 'new_user',
      'wallet_topup': 'gold_member'
    };

    return scenarioDefaults[scenario] || 'gold_member';
  }

  /**
   * Load fixtures from Neo4j (for dynamic fixture management)
   * @returns {Promise<void>}
   */
  async loadFromNeo4j() {
    const driver = getDriver();
    const session = driver.session();

    try {
      // Query for fixture configurations stored in Neo4j
      const query = `
        MATCH (f:TestFixture)
        RETURN f
        ORDER BY f.created_at DESC
      `;

      const result = await session.run(query);
      
      result.records.forEach(record => {
        const fixture = record.get('f').properties;
        
        if (fixture.type === 'account') {
          this.accountRegistry.register(JSON.parse(fixture.config));
        } else if (fixture.type === 'environment') {
          this.environmentRegistry.register(JSON.parse(fixture.config));
        } else if (fixture.type === 'data_template') {
          this.dataTemplateRegistry.register(JSON.parse(fixture.config));
        }
      });

    } finally {
      await session.close();
    }
  }

  /**
   * Save fixtures to Neo4j (for persistence)
   * @returns {Promise<void>}
   */
  async saveToNeo4j() {
    const driver = getDriver();
    const session = driver.session();

    try {
      await session.writeTransaction(async (tx) => {
        // Save accounts
        for (const account of this.accountRegistry.accounts.values()) {
          await tx.run(`
            MERGE (f:TestFixture {fixture_id: $fixtureId})
            SET f.type = 'account',
                f.config = $config,
                f.updated_at = datetime()
          `, {
            fixtureId: `account_${account.env}_${account.username}`,
            config: JSON.stringify(account)
          });
        }

        // Save environments
        for (const env of this.environmentRegistry.environments.values()) {
          await tx.run(`
            MERGE (f:TestFixture {fixture_id: $fixtureId})
            SET f.type = 'environment',
                f.config = $config,
                f.updated_at = datetime()
          `, {
            fixtureId: `env_${env.name}`,
            config: JSON.stringify(env)
          });
        }

        // Save data templates
        for (const template of this.dataTemplateRegistry.templates.values()) {
          await tx.run(`
            MERGE (f:TestFixture {fixture_id: $fixtureId})
            SET f.type = 'data_template',
                f.config = $config,
                f.updated_at = datetime()
          `, {
            fixtureId: template.template_id,
            config: JSON.stringify(template)
          });
        }
      });

    } finally {
      await session.close();
    }
  }
}

// Global singleton instance
let globalResolver = null;

/**
 * Get global fixture resolver instance
 * @returns {FixtureResolver}
 */
function getFixtureResolver() {
  if (!globalResolver) {
    globalResolver = new FixtureResolver();
  }
  return globalResolver;
}

module.exports = {
  FixtureResolver,
  TestAccountRegistry,
  EnvironmentRegistry,
  TestDataTemplateRegistry,
  getFixtureResolver
};
