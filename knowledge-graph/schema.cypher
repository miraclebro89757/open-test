// ============================================================================
// OpenTest Knowledge Graph Schema Definition
// Based on: SPEC-REQ-NEO4J-OBSIDIAN-001 v1.0.0-GA
// ============================================================================

// ============================================================================
// 1. NODE CONSTRAINTS (唯一性约束)
// ============================================================================

// Module 节点约束
CREATE CONSTRAINT module_id_unique IF NOT EXISTS
FOR (m:Module) REQUIRE m.id IS UNIQUE;

// Requirement 节点约束 (id + version 联合唯一)
CREATE CONSTRAINT req_id_version_unique IF NOT EXISTS
FOR (r:Requirement) REQUIRE (r.id, r.version) IS UNIQUE;

// TestPoint 节点约束
CREATE CONSTRAINT test_point_id_unique IF NOT EXISTS
FOR (tp:TestPoint) REQUIRE tp.id IS UNIQUE;

// TestCase 节点约束
CREATE CONSTRAINT test_case_id_unique IF NOT EXISTS
FOR (tc:TestCase) REQUIRE tc.id IS UNIQUE;

// RunExecution 节点约束
CREATE CONSTRAINT run_execution_id_unique IF NOT EXISTS
FOR (re:RunExecution) REQUIRE re.id IS UNIQUE;

// ============================================================================
// 2. NODE INDEXES (性能索引)
// ============================================================================

// Module 索引
CREATE INDEX module_name_index IF NOT EXISTS
FOR (m:Module) ON (m.name);

// Requirement 索引
CREATE INDEX req_status_index IF NOT EXISTS
FOR (r:Requirement) ON (r.status);

CREATE INDEX req_priority_index IF NOT EXISTS
FOR (r:Requirement) ON (r.priority);

CREATE INDEX req_module_index IF NOT EXISTS
FOR (r:Requirement) ON (r.module_id);

// TestPoint 索引
CREATE INDEX test_point_angle_index IF NOT EXISTS
FOR (tp:TestPoint) ON (tp.angle);

CREATE INDEX test_point_status_index IF NOT EXISTS
FOR (tp:TestPoint) ON (tp.status);

// TestCase 索引
CREATE INDEX test_case_status_index IF NOT EXISTS
FOR (tc:TestCase) ON (tc.status);

CREATE INDEX test_case_file_index IF NOT EXISTS
FOR (tc:TestCase) ON (tc.file_path);

// RunExecution 索引
CREATE INDEX run_execution_status_index IF NOT EXISTS
FOR (re:RunExecution) ON (re.status);

CREATE INDEX run_execution_timestamp_index IF NOT EXISTS
FOR (re:RunExecution) ON (re.timestamp);

// ============================================================================
// 3. SAMPLE DATA STRUCTURE (示例数据结构说明)
// ============================================================================

// Module 节点属性
// {
//   id: "MOD_CHECKOUT",
//   name: "核心结算与支付域",
//   description: "处理购物车结算、支付、订单生成等核心流程",
//   created_at: 1714521600000,
//   updated_at: 1714521600000
// }

// Requirement 节点属性
// {
//   id: "REQ-PAY-02",
//   version: "v2.0",
//   title: "支付二次验证与账户划扣",
//   module_id: "MOD_CHECKOUT",
//   priority: "P0",        // P0/P1/P2/P3
//   status: "ACTIVE",      // ACTIVE/DEPRECATED/DRAFT
//   preconditions: ["User must be authenticated", "Cart amount > 0"],
//   actions: ["Click submit pay", "Verify 6-digit SMS 2FA code"],
//   expected_outcomes: ["Deduct balance", "Redirect to success page"],
//   hash: "sha256_hash_of_raw_content",
//   raw_content: "完整的 PRD 原文",
//   created_at: 1714521600000,
//   updated_at: 1714521600000
// }

// TestPoint 节点属性
// {
//   id: "TP-2FA-01",
//   title: "6位短信验证码正常核销",
//   angle: "FUNCTIONAL",   // FUNCTIONAL/EXCEPTION/SECURITY/PERFORMANCE
//   status: "ACTIVE",      // ACTIVE/DEPRECATED
//   acceptance_criteria: "输入正确6位验证码后成功完成支付",
//   deprecated: false,
//   created_at: 1714521600000,
//   updated_at: 1714521600000
// }

// TestCase 节点属性
// {
//   id: "CASE-E2E-902",
//   title: "verify 6-digit sms 2fa on checkout",
//   file_path: "tests/e2e/checkout_2fa.spec.ts",
//   start_line: 5,
//   end_line: 18,
//   status: "ACTIVE",      // ACTIVE/SKIPPED/DEPRECATED
//   last_execution_status: "PASSED",  // PASSED/FAILED/SKIPPED
//   last_execution_time: 14,  // milliseconds
//   created_at: 1714521600000,
//   updated_at: 1714521600000
// }

// RunExecution 节点属性
// {
//   id: "RUN-20240929-001",
//   timestamp: 1714521600000,
//   status: "PASSED",      // PASSED/FAILED/SKIPPED
//   duration_ms: 14,
//   error_message: null,
//   ci_build_id: "github-actions-12345",
//   git_commit: "abc123def",
//   created_at: 1714521600000
// }

// ============================================================================
// 4. RELATIONSHIP TYPES (关系类型定义)
// ============================================================================

// (:Requirement)-[:BELONGS_TO]->(:Module)
// 属性: { created_at: timestamp }

// (:Requirement)-[:DECOMPOSED_INTO]->(:TestPoint)
// 属性: { 
//   angle: 'FUNCTIONAL' | 'EXCEPTION' | 'SECURITY' | 'PERFORMANCE',
//   created_at: timestamp
// }

// (:TestPoint)-[:VERIFIED_BY]->(:TestCase)
// 属性: { 
//   status: 'ACTIVE' | 'DEPRECATED',
//   since: 'v2.0',
//   created_at: timestamp
// }

// (:TestCase)-[:EXECUTES_IN]->(:RunExecution)
// 属性: { created_at: timestamp }

// (:Requirement)-[:EVOLVED_FROM]->(:Requirement)
// 属性: { 
//   diff_type: 'MUTATION' | 'ADDITIVE' | 'DEPRECATED',
//   timestamp: 1714521600000,
//   change_summary: "从单步划扣升级为二次验证"
// }

// (:Requirement)-[:SUPERSEDES]->(:Requirement)
// 属性: { timestamp: 1714521600000 }

// (:Requirement)-[:DEPENDS_ON]->(:Requirement)
// 属性: { 
//   dependency_type: 'HARD' | 'SOFT',
//   created_at: timestamp
// }

// ============================================================================
// 5. GRAPH INITIALIZATION (初始化示例)
// ============================================================================

// 创建示例模块
MERGE (m:Module {id: 'MOD_CHECKOUT'})
ON CREATE SET 
  m.name = '核心结算与支付域',
  m.description = '处理购物车结算、支付、订单生成等核心流程',
  m.created_at = timestamp(),
  m.updated_at = timestamp();

MERGE (m2:Module {id: 'MOD_AUTH'})
ON CREATE SET 
  m2.name = '用户认证与授权',
  m2.description = '处理用户登录、注册、权限验证等',
  m2.created_at = timestamp(),
  m2.updated_at = timestamp();

// ============================================================================
// 6. UTILITY QUERIES (常用查询)
// ============================================================================

// 查看所有约束
// SHOW CONSTRAINTS;

// 查看所有索引
// SHOW INDEXES;

// 查看数据库统计
// CALL db.stats.retrieve('GRAPH COUNTS');

// 清空所有数据 (危险操作！)
// MATCH (n) DETACH DELETE n;

// ============================================================================
// END OF SCHEMA
// ============================================================================
