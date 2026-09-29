# OpenTest Knowledge Graph - 需求关联知识库

基于 Neo4j 图数据库的需求管理与测试追溯系统。

## 📋 架构设计

**规范文档**: `SPEC-REQ-NEO4J-OBSIDIAN-001 v1.0.0-GA`

### 为什么选择 Neo4j 而不是向量数据库？

| 维度 | 向量检索 | Neo4j 图数据库 |
|------|---------|--------------|
| 匹配确定性 | ❌ 概率性模糊 | ✅ 100% 确定性图遍历 |
| 多层因果血缘 | ❌ 无传递性血缘 | ✅ 任意深度多跳查询 |
| 状态与时序版本 | ❌ 丢失上下文 | ✅ 带属性的有向边 |
| 孤岛感知 | ❌ 无法检测 | ✅ 图拓扑闭环分析 |
| 本地协同 | ❌ 纯后端黑盒 | ✅ 双向映射 Obsidian |

## 🏗️ 核心数据模型

### 节点类型 (Node Labels)

```
:Module         - 业务领域模块 (如 MOD_CHECKOUT, MOD_AUTH)
:Requirement    - 业务需求节点 (如 REQ-PAY-02)
:TestPoint      - 细粒度测试点 (如 TP-2FA-NORMAL)
:TestCase       - 物理测试用例代码 (如 CASE-E2E-902)
:RunExecution   - CI 测试运行执行记录
```

### 关系类型 (Relationship Types)

```
(:Requirement)-[:BELONGS_TO]->(:Module)
(:Requirement)-[:DECOMPOSED_INTO {angle}]->(:TestPoint)
(:TestPoint)-[:VERIFIED_BY {status, since}]->(:TestCase)
(:TestCase)-[:EXECUTES_IN]->(:RunExecution)
(:Requirement)-[:EVOLVED_FROM {diffType}]->(:Requirement)
(:Requirement)-[:SUPERSEDES]->(:Requirement)
(:Requirement)-[:DEPENDS_ON {type}]->(:Requirement)
```

## 🚀 快速开始

### 1. 初始化 Neo4j Schema

```bash
# 连接到 Neo4j 数据库
docker exec -it opentest-neo4j cypher-shell -u neo4j -p your_password

# 执行 Schema 初始化
:source schema.cypher
```

### 2. 使用 Node.js 客户端

```bash
cd knowledge-graph
npm install
npm run init-schema
```

### 3. 导入需求文档

```bash
# 上传 PRD Markdown 文件
curl -X POST http://localhost:8080/api/requirements/upload \
  -F "file=@requirements.md" \
  -F "module_id=MOD_CHECKOUT"
```

## 📊 核心功能

### 1. 需求文档解析 (AST Parsing)

自动解析 Markdown/DOCX/OpenAPI 文档，提取：
- Feature & Scenario
- Given-When-Then 结构
- 前置条件、动作、预期产出

### 2. 4 维测试点拆分

强制覆盖 4 个专项维度：

1. **功能正向与边界 (FUNCTIONAL)**
   - Happy Path 正常流程
   - 边界值测试

2. **异常与弱网容错 (EXCEPTION)**
   - 超时、重试、幂等性
   - 弱网场景

3. **安全与权限合规 (SECURITY)**
   - 越权防护 (IDOR)
   - 限流防暴力
   - 数据脱敏

4. **性能与并发冲突 (PERFORMANCE)**
   - 行级锁冲突
   - 并发扣减
   - 对账补偿

### 3. 时态图谱版本管理

- ✅ 历史不可篡改
- ✅ 版本追溯 (EVOLVED_FROM)
- ✅ 时间旅行查询

演化三态：
- **向下兼容扩展 (Additive)**
- **行为修正 (Mutation)**
- **功能废弃 (Deprecation)**

### 4. PRD 质量检测

自动检测：
- 🔍 孤儿需求（无测试覆盖）
- 🔍 孤儿测试点（未实现用例）
- 🔍 循环依赖死锁
- 🔍 模糊量化（"尽量"、"大概"等词）

### 5. Obsidian 双链联动

导出为本地 Markdown 仓库：

```
OpenTest-Vault/
├── 01_Requirements/
│   └── REQ-PAY-02.md
├── 02_TestPoints/
│   └── TP-2FA-01.md
├── 03_TestCases/
│   └── CASE-E2E-902.md
└── 04_Modules/
    └── MOD_CHECKOUT.md
```

支持 Obsidian WikiLinks: `[[REQ-PAY-02]]`

## 📖 API 文档

### 需求管理

```bash
# 上传需求文档
POST /api/requirements/upload

# 查询需求详情
GET /api/requirements/:id

# 查询需求演化历史
GET /api/requirements/:id/history

# 查询需求依赖关系
GET /api/requirements/:id/dependencies
```

### 测试点管理

```bash
# 自动拆分测试点
POST /api/requirements/:id/decompose

# 查询测试点列表
GET /api/test-points?requirement_id=:id

# 关联测试用例
POST /api/test-points/:id/verify
```

### 质量检测

```bash
# 运行质量检测
POST /api/quality/check

# 查看检测报告
GET /api/quality/report

# 查询孤儿需求
GET /api/quality/orphan-requirements

# 查询循环依赖
GET /api/quality/circular-dependencies
```

### Obsidian 导出

```bash
# 导出到本地 Obsidian 仓库
POST /api/obsidian/export

# 同步单个需求
POST /api/obsidian/sync/:requirement_id
```

## 🔧 配置

### Neo4j 连接配置

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
NEO4J_DATABASE=neo4j
```

### Obsidian 仓库配置

```env
OBSIDIAN_VAULT_PATH=/Users/you/OpenTest-Vault
OBSIDIAN_AUTO_SYNC=true
```

## 📚 Cypher 查询示例

### 查询所有活跃需求

```cypher
MATCH (r:Requirement {status: 'ACTIVE'})-[:BELONGS_TO]->(m:Module)
RETURN m.name AS module, r.id AS req_id, r.title AS title
ORDER BY m.name, r.priority;
```

### 查询需求的测试覆盖率

```cypher
MATCH (r:Requirement {id: 'REQ-PAY-02'})
OPTIONAL MATCH (r)-[:DECOMPOSED_INTO]->(tp:TestPoint)
OPTIONAL MATCH (tp)-[:VERIFIED_BY]->(tc:TestCase)
WITH r, count(DISTINCT tp) AS total_points, count(DISTINCT tc) AS covered_points
RETURN r.id, r.title, 
       total_points, 
       covered_points,
       CASE WHEN total_points > 0 
            THEN toFloat(covered_points) / total_points * 100 
            ELSE 0 END AS coverage_percent;
```

### 查询孤儿需求（漏测盲区）

```cypher
MATCH (r:Requirement {status: 'ACTIVE'})
WHERE NOT (r)-[:DECOMPOSED_INTO]->(:TestPoint)
RETURN r.id AS orphan_req_id, r.title AS title, r.priority;
```

### 查询循环依赖

```cypher
MATCH path = (r1:Requirement)-[:DEPENDS_ON*2..6]->(r1)
RETURN [n IN nodes(path) | n.id] AS circular_cycle;
```

### 需求演化历史追溯

```cypher
MATCH path = (current:Requirement {id: 'REQ-PAY-02', version: 'v2.0'})
             -[:EVOLVED_FROM*0..]->(ancestor:Requirement)
RETURN [n IN nodes(path) | {
  id: n.id, 
  version: n.version, 
  title: n.title,
  status: n.status
}] AS evolution_chain;
```

### 影响分析（某需求变更影响哪些测试用例）

```cypher
MATCH (r:Requirement {id: 'REQ-PAY-02'})
MATCH (r)-[:DECOMPOSED_INTO*1..2]->(tp:TestPoint)
MATCH (tp)-[:VERIFIED_BY]->(tc:TestCase)
RETURN r.id, r.version, collect(DISTINCT tc.id) AS affected_test_cases;
```

## 🧪 测试

```bash
# 运行单元测试
npm test

# 运行集成测试
npm run test:integration

# 测试 Schema 完整性
npm run test:schema
```

## 📁 文件结构

```
knowledge-graph/
├── schema.cypher           # Neo4j Schema 定义
├── package.json            # Node.js 依赖
├── src/
│   ├── db/
│   │   └── neo4j.js       # Neo4j 连接客户端
│   ├── parsers/
│   │   ├── markdown.js    # Markdown 解析器
│   │   ├── docx.js        # DOCX 解析器
│   │   └── openapi.js     # OpenAPI 解析器
│   ├── decomposer/
│   │   └── test-point.js  # 4 维测试点拆分引擎
│   ├── versioning/
│   │   └── temporal.js    # 时态版本管理
│   ├── quality/
│   │   └── checker.js     # 质量检测算法
│   ├── obsidian/
│   │   └── exporter.js    # Obsidian 导出器
│   └── api/
│       └── routes.js      # API 路由
├── prompts/
│   ├── ast-parser.txt     # AST 解析 Prompt
│   ├── decomposer.txt     # 测试点拆分 Prompt
│   └── reviewer.txt       # 质量评审 Prompt
└── examples/
    ├── sample-prd.md      # 示例 PRD
    └── sample-queries.cypher  # 示例查询
```

## 🤖 Agent 集成

### System Prompt 模板

```text
你是一个精通 Neo4j 知识图谱与软件可测试性架构的专家 Agent。

核心任务:
1. 接收 PRD 文本，禁止使用概率性模糊向量
2. 解析为符合属性图规范的实体
3. 沿着 4 个维度严格拆分测试点
4. 输出标准 Cypher 语句
5. 生成 Obsidian [[WikiLinks]] Markdown
6. 输出 PRD 质量体检诊断
```

详见: `prompts/` 目录

## 📝 开发计划

- [x] **Task 1**: Neo4j Schema 定义 (完成)
  - ✅ 5 种节点类型
  - ✅ 7 种关系类型
  - ✅ 唯一约束与索引

- [x] **Task 2**: 需求文档 AST 解析器 (完成)
  - ✅ Markdown 解析器 (Given-When-Then 提取)
  - ✅ DOCX 解析器 (mammoth)
  - ✅ OpenAPI 解析器 (自动生成测试点)
  - ✅ 统一解析入口
  - ✅ 模糊语言检测
  - ✅ 优先级自动识别

- [ ] **Task 3**: 4 维测试点拆分引擎
  - [ ] Functional 维度拆分
  - [ ] Exception 维度拆分
  - [ ] Security 维度拆分
  - [ ] Performance 维度拆分
  - [ ] 拆分规则引擎

- [ ] **Task 4**: 时态版本管理系统
  - [ ] EVOLVED_FROM 关系管理
  - [ ] 版本差异计算
  - [ ] 时间旅行查询

- [ ] **Task 5**: PRD 质量检测算法
  - [ ] 孤儿需求检测
  - [ ] 孤儿测试点检测
  - [ ] 循环依赖检测
  - [ ] 模糊量化词检测
  - [ ] 质量评分系统

- [ ] **Task 6**: Obsidian 导出器
  - [ ] Vault 结构生成
  - [ ] WikiLinks 双向链接
  - [ ] Markdown 导出
  - [ ] 自动同步机制

- [ ] **Task 7**: REST API 与 Agent Prompts
  - [ ] API 路由实现
  - [ ] Agent System Prompts
  - [ ] 前端可视化界面

## 🔗 相关文档

- [Neo4j 官方文档](https://neo4j.com/docs/)
- [Cypher 查询语言](https://neo4j.com/docs/cypher-manual/)
- [Obsidian 帮助文档](https://help.obsidian.md/)
- [规范文档](./SPEC-REQ-NEO4J-OBSIDIAN-001.md)

---

**Status**: 🚧 开发中  
**Version**: 0.1.0  
**Last Updated**: 2024-09-29
