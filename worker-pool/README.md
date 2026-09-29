# OpenTest Worker Pool Manager

**Distributed Worker Pool with Rust Tokio Supervision**

## Architecture

Based on the OpenTest whitepaper, this component implements:

### 1. Tokio Process Supervision
- Async worker lifecycle management
- Automatic worker restart on failure
- Health monitoring and metrics collection

### 2. Dynamic Task Distribution
- Redis pub/sub for task queue
- Priority-based task scheduling
- Load balancing across workers

### 3. CDP Context Multiplexing (Future)
- Efficient browser context reuse
- Memory-optimized CDP connection pooling
- Reduced overhead per test execution

## Features

- **Zero-downtime Worker Replacement**: Failed workers are automatically restarted
- **Health Monitoring**: `/health` and `/stats` endpoints on port 8001
- **Metrics Collection**: Per-worker statistics tracking
- **Graceful Shutdown**: Proper cleanup on termination

## Configuration

Environment variables:

```bash
REDIS_URL=redis://localhost:6379  # Redis connection
WORKER_COUNT=4                     # Number of workers (default: CPU count)
RUST_LOG=info                      # Log level
```

## API Endpoints

### Health Check
```bash
GET http://localhost:8001/health

Response:
{
  "status": "healthy",
  "service": "worker-pool",
  "workers": 4,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Worker Statistics
```bash
GET http://localhost:8001/stats

Response:
{
  "workers": [
    {
      "id": "uuid",
      "name": "worker-1",
      "status": "Idle",
      "stats": {
        "total_tasks": 100,
        "successful_tasks": 95,
        "failed_tasks": 5,
        "avg_execution_time_ms": 1250.5,
        "memory_usage_mb": 150.0
      }
    }
  ],
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Task Format

Workers listen on Redis channel `executor:tasks`:

```json
{
  "action": "execute_tests",
  "execution_id": "uuid",
  "project_id": "uuid",
  "test_cases": [...]
}
```

## Results Format

Workers publish to Redis channel `executor:results`:

```json
{
  "task_id": "uuid",
  "worker_id": "uuid",
  "success": true,
  "output": "Task completed",
  "error": null,
  "duration_ms": 1234
}
```

## Performance Characteristics

Based on whitepaper benchmarks:

- **Memory per worker**: ~150MB (vs 300MB with traditional executors)
- **Task throughput**: 100+ concurrent tasks
- **Restart time**: <100ms per worker
- **CDP context reuse**: Up to 10x memory reduction (future enhancement)

## Development

```bash
# Build
cargo build --release

# Run locally
REDIS_URL=redis://localhost:6379 cargo run

# Run tests
cargo test

# Run with verbose logging
RUST_LOG=debug cargo run
```

## Architecture Diagram

```
┌──────────────────────────────────────┐
│        Worker Pool Manager           │
│      (Tokio Async Runtime)           │
└──────────────┬───────────────────────┘
               │
     ┌─────────┴─────────┐
     │                   │
┌────▼────┐       ┌─────▼─────┐
│ Worker 1│  ...  │ Worker N  │
│ (Tokio) │       │  (Tokio)  │
└────┬────┘       └─────┬─────┘
     │                  │
     └──────────┬───────┘
                │
        ┌───────▼────────┐
        │  Redis Pub/Sub │
        │  (Task Queue)  │
        └────────────────┘
```

## Future Enhancements

As per whitepaper roadmap:

1. **CDP Context Pooling** - Reuse browser contexts across tests
2. **Zero-Allocation Event Bus** - Shared memory mmap for IPC
3. **Smart Failure Recovery** - Automatic retry with exponential backoff
4. **Resource-aware Scheduling** - CPU/memory-based load balancing

## License

Apache 2.0
