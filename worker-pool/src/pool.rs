use anyhow::Result;
use dashmap::DashMap;
use futures::StreamExt;
use redis::AsyncCommands;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{info, warn, error};
use uuid::Uuid;

use crate::task::{Task, TaskResult};
use crate::worker::{Worker, WorkerStatus, WorkerStats};

/// Worker pool manager
#[derive(Clone)]
pub struct WorkerPool {
    workers: Arc<DashMap<Uuid, WorkerHandle>>,
    task_tx: mpsc::Sender<Task>,
    result_rx: Arc<tokio::sync::Mutex<mpsc::Receiver<TaskResult>>>,
    redis_client: redis::Client,
}

struct WorkerHandle {
    id: Uuid,
    name: String,
    task_tx: mpsc::Sender<Task>,
    handle: tokio::task::JoinHandle<Result<()>>,
}

impl WorkerPool {
    pub async fn new(worker_count: usize, redis_url: &str) -> Result<Self> {
        info!("Initializing worker pool with {} workers", worker_count);

        let redis_client = redis::Client::open(redis_url)?;
        
        // Test Redis connection
        let mut conn = redis_client.get_async_connection().await?;
        let _: String = redis::cmd("PING").query_async(&mut conn).await?;
        info!("Redis connection established");

        let workers = Arc::new(DashMap::new());
        let (result_tx, result_rx) = mpsc::channel(1000);
        let (task_tx, _) = mpsc::channel(100);

        let mut pool = Self {
            workers,
            task_tx,
            result_rx: Arc::new(tokio::sync::Mutex::new(result_rx)),
            redis_client,
        };

        // Spawn workers
        for i in 0..worker_count {
            pool.spawn_worker(i).await?;
        }

        Ok(pool)
    }

    async fn spawn_worker(&mut self, index: usize) -> Result<()> {
        let worker_id = Uuid::new_v4();
        let (worker_task_tx, worker_task_rx) = mpsc::channel(10);
        let (worker_result_tx, _) = mpsc::channel(10);

        let worker = Worker::new(worker_id, worker_task_rx, worker_result_tx);
        let worker_name = worker.name.clone();

        let handle = tokio::spawn(async move {
            worker.run().await
        });

        let worker_handle = WorkerHandle {
            id: worker_id,
            name: worker_name.clone(),
            task_tx: worker_task_tx,
            handle,
        };

        self.workers.insert(worker_id, worker_handle);
        info!("Spawned worker {}: {}", index, worker_name);

        Ok(())
    }

    pub async fn run(self) -> Result<()> {
        info!("Worker pool running, listening for tasks...");

        // Spawn task listener
        let listener = tokio::spawn(self.clone().listen_for_tasks());

        // Spawn result processor
        let processor = tokio::spawn(self.clone().process_results());

        // Spawn health monitor
        let monitor = tokio::spawn(self.clone().monitor_workers());

        // Wait for all tasks
        tokio::select! {
            res = listener => {
                error!("Task listener stopped: {:?}", res);
            }
            res = processor => {
                error!("Result processor stopped: {:?}", res);
            }
            res = monitor => {
                error!("Health monitor stopped: {:?}", res);
            }
        }

        Ok(())
    }

    async fn listen_for_tasks(self) -> Result<()> {
        let mut conn = self.redis_client.get_async_connection().await?;
        let mut pubsub = conn.into_pubsub();
        
        pubsub.subscribe("executor:tasks").await?;
        info!("Subscribed to executor:tasks channel");

        let mut stream = pubsub.on_message();

        while let Some(msg) = stream.next().await {
            let payload: String = msg.get_payload()?;
            
            match serde_json::from_str::<serde_json::Value>(&payload) {
                Ok(json) => {
                    info!("Received task: {}", json);
                    
                    // Convert to Task
                    let task = Task {
                        id: Uuid::new_v4(),
                        task_type: json["action"].as_str().unwrap_or("execute").to_string(),
                        payload: json.clone(),
                        priority: 1,
                        timeout_secs: Some(300),
                    };

                    // Dispatch to available worker
                    if let Err(e) = self.dispatch_task(task).await {
                        error!("Failed to dispatch task: {}", e);
                    }
                }
                Err(e) => {
                    warn!("Failed to parse task payload: {}", e);
                }
            }
        }

        Ok(())
    }

    async fn dispatch_task(&self, task: Task) -> Result<()> {
        // Find an idle worker
        let worker = self.workers.iter()
            .find(|w| {
                // Check if worker channel has capacity
                !w.task_tx.is_closed()
            })
            .map(|w| w.value().clone());

        if let Some(worker) = worker {
            worker.task_tx.send(task).await?;
            info!("Dispatched task to worker: {}", worker.name);
            Ok(())
        } else {
            warn!("No available workers, task queued");
            // In production, implement task queueing
            Ok(())
        }
    }

    async fn process_results(self) -> Result<()> {
        let mut result_rx = self.result_rx.lock().await;

        while let Some(result) = result_rx.recv().await {
            info!("Task {} completed: success={}", result.task_id, result.success);

            // Publish result to Redis
            let mut conn = self.redis_client.get_async_connection().await?;
            let result_json = serde_json::to_string(&result)?;
            
            let _: () = conn.publish("executor:results", result_json).await?;
        }

        Ok(())
    }

    async fn monitor_workers(self) -> Result<()> {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));

        loop {
            interval.tick().await;

            let worker_count = self.workers.len();
            info!("Health check: {} workers active", worker_count);

            // Check for failed workers and restart them
            let failed_workers: Vec<Uuid> = self.workers.iter()
                .filter(|w| w.handle.is_finished())
                .map(|w| *w.key())
                .collect();

            for worker_id in failed_workers {
                warn!("Worker {} failed, restarting", worker_id);
                self.workers.remove(&worker_id);
                // Restart worker logic would go here
            }
        }
    }

    pub fn worker_count(&self) -> usize {
        self.workers.len()
    }

    pub async fn get_stats(&self) -> Vec<(Uuid, String, WorkerStatus, WorkerStats)> {
        // In a real implementation, workers would report their stats
        // For now, return placeholder data
        vec![]
    }
}
