use anyhow::Result;
use tracing::{info, warn, error};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod worker;
mod pool;
mod task;
mod health;

use crate::pool::WorkerPool;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "opentest_worker_pool=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("OpenTest Worker Pool Manager starting...");
    info!("Architecture: Distributed Worker Pool with Tokio supervision");

    // Determine worker count
    let worker_count = std::env::var("WORKER_COUNT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| num_cpus::get());

    info!("Detected {} CPU cores, spawning {} workers", num_cpus::get(), worker_count);

    // Redis connection
    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://redis:6379".to_string());

    info!("Connecting to Redis: {}", redis_url);

    // Create and start worker pool
    let pool = WorkerPool::new(worker_count, &redis_url).await?;
    
    info!("Worker pool initialized successfully");
    info!("Listening for tasks on channel: executor:tasks");
    info!("Health check endpoint: /health (port 8001)");

    // Start health check server
    let health_server = tokio::spawn(health::start_health_server(pool.clone()));

    // Run the pool
    let pool_result = pool.run().await;

    // Wait for health server
    health_server.abort();

    pool_result
}
