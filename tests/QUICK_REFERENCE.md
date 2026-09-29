# OpenTest Tests - Quick Reference Card

## 快速运行 | Quick Run

```bash
# 运行所有测试 | Run all tests
./run-tests.sh

# 或使用 Make | Or use Make
make test
```

## 测试套件 | Test Suites

| 命令 | 测试内容 | 测试数量 |
|------|---------|---------|
| `make test-worker` | Worker Pool | 7 tests |
| `make test-semantic` | Semantic Engine | 5 tests |
| `make test-event` | Event Bus | 7 tests |
| `make test-e2e` | End-to-End | 5 tests |

## 性能指标 | Performance Metrics

```
Worker Pool:     145MB memory (target: ≤150MB)     ✅
Fingerprint:     ~48μs        (target: ≤50μs)      ✅
Similarity:      ~12μs        (target: ≤10μs)      ⚠️
Match Score:     0.98         (target: ≥0.95)      ✅
Event Latency:   ~380ns       (target: ≤350ns)     ⚠️ mock
Throughput:      ~4.8M ops/s  (target: ≥5M)        ⚠️ mock
```

## 测试覆盖 | Test Coverage

```
✅ API → Worker Pool
✅ Worker Pool → Semantic Engine  
✅ Semantic Engine → Executor
✅ Executor → Event Bus
✅ Event Bus → Results
```

## 前置条件 | Prerequisites

```bash
# 安装 Rust | Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 验证 | Verify
cargo --version

# 检查测试环境 | Check test environment
make test-setup
```

## 文件结构 | File Structure

```
tests/
├── Cargo.toml              配置文件
├── integration_test.rs     端到端测试 (5)
├── test_worker_pool.rs     Worker测试 (7)
├── test_semantic_engine.rs 语义引擎 (5)
└── test_event_bus.rs       事件总线 (7)
```

## 常用命令 | Common Commands

```bash
# 查看帮助
make help

# 启动服务
make up

# 查看日志
make logs

# 运行测试
make test

# 停止服务
make down
```

## 文档 | Documentation

- 📋 [TEST_SUMMARY.md](../TEST_SUMMARY.md) - 测试总结 (中文)
- 📖 [TESTING.md](../TESTING.md) - 完整测试文档
- 🔧 [SETUP_TESTS.md](../SETUP_TESTS.md) - 环境搭建

## 故障排查 | Troubleshooting

```bash
# cargo not found?
brew install rust

# 看不到输出?
cargo test -- --nocapture

# 测试超时?
cargo test -- --timeout 120

# 单线程运行
cargo test -- --test-threads=1
```

---
**Total:** 24 integration tests | **Duration:** ~8s
