use crate::pool::WorkerPool;
use anyhow::Result;
use serde_json::json;
use std::convert::Infallible;
use std::net::SocketAddr;
use tracing::info;
use warp::Filter;

pub async fn start_health_server(pool: WorkerPool) -> Result<()> {
    let health = warp::path("health")
        .and(warp::get())
        .and(with_pool(pool.clone()))
        .and_then(health_handler);

    let stats = warp::path("stats")
        .and(warp::get())
        .and(with_pool(pool.clone()))
        .and_then(stats_handler);

    let routes = health.or(stats);

    let addr: SocketAddr = "0.0.0.0:8001".parse()?;
    info!("Health check server starting on {}", addr);

    warp::serve(routes).run(addr).await;

    Ok(())
}

fn with_pool(
    pool: WorkerPool,
) -> impl Filter<Extract = (WorkerPool,), Error = Infallible> + Clone {
    warp::any().map(move || pool.clone())
}

async fn health_handler(pool: WorkerPool) -> Result<impl warp::Reply, Infallible> {
    let worker_count = pool.worker_count();
    
    let response = json!({
        "status": "healthy",
        "service": "worker-pool",
        "workers": worker_count,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    Ok(warp::reply::json(&response))
}

async fn stats_handler(pool: WorkerPool) -> Result<impl warp::Reply, Infallible> {
    let stats = pool.get_stats().await;
    
    let response = json!({
        "workers": stats,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    Ok(warp::reply::json(&response))
}
