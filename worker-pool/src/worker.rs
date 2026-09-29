use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{interval, timeout};
use tracing::{info, warn, error, debug};
use uuid::Uuid;

use crate::task::{Task, TaskResult};

/// Worker status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum WorkerStatus {
    Idle,
    Busy,
    Degraded,
    Failed,
}

/// Worker statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerStats {
    pub total_tasks: u64,
    pub successful_tasks: u64,
    pub failed_tasks: u64,
    pub avg_execution_time_ms: f64,
    pub memory_usage_mb: f64,
}

impl Default for WorkerStats {
    fn default() -> Self {
        Self {
            total_tasks: 0,
            successful_tasks: 0,
            failed_tasks: 0,
            avg_execution_time_ms: 0.0,
            memory_usage_mb: 0.0,
        }
    }
}

/// Worker instance
pub struct Worker {
    pub id: Uuid,
    pub name: String,
    status: Arc<RwLock<WorkerStatus>>,
    stats: Arc<RwLock<WorkerStats>>,
    task_rx: mpsc::Receiver<Task>,
    result_tx: mpsc::Sender<TaskResult>,
}

impl Worker {
    pub fn new(
        id: Uuid,
        task_rx: mpsc::Receiver<Task>,
        result_tx: mpsc::Sender<TaskResult>,
    ) -> Self {
        let name = format!("worker-{}", &id.to_string()[..8]);
        
        Self {
            id,
            name,
            status: Arc::new(RwLock::new(WorkerStatus::Idle)),
            stats: Arc::new(RwLock::new(WorkerStats::default())),
            task_rx,
            result_tx,
        }
    }

    pub async fn status(&self) -> WorkerStatus {
        self.status.read().await.clone()
    }

    pub async fn stats(&self) -> WorkerStats {
        self.stats.read().await.clone()
    }

    async fn set_status(&self, new_status: WorkerStatus) {
        let mut status = self.status.write().await;
        *status = new_status;
    }

    /// Main worker loop - processes tasks from the channel
    pub async fn run(mut self) -> Result<()> {
        info!("[{}] Worker started", self.name);

        // Heartbeat interval for health monitoring
        let mut heartbeat = interval(Duration::from_secs(30));

        loop {
            tokio::select! {
                // Process incoming tasks
                Some(task) = self.task_rx.recv() => {
                    self.process_task(task).await;
                }
                
                // Heartbeat for monitoring
                _ = heartbeat.tick() => {
                    self.report_health().await;
                }
                
                else => {
                    warn!("[{}] Channel closed, shutting down", self.name);
                    break;
                }
            }
        }

        info!("[{}] Worker stopped", self.name);
        Ok(())
    }

    async fn process_task(&mut self, task: Task) {
        info!("[{}] Processing task: {}", self.name, task.id);
        
        self.set_status(WorkerStatus::Busy).await;
        let start_time = std::time::Instant::now();

        // Execute task with timeout (default 5 minutes)
        let task_timeout = Duration::from_secs(task.timeout_secs.unwrap_or(300));
        
        let result = match timeout(task_timeout, self.execute_task(&task)).await {
            Ok(Ok(output)) => {
                // Success
                let duration = start_time.elapsed();
                info!("[{}] Task {} completed in {:?}", self.name, task.id, duration);
                
                self.update_stats(true, duration.as_millis() as f64).await;
                
                TaskResult {
                    task_id: task.id,
                    worker_id: self.id,
                    success: true,
                    output: Some(output),
                    error: None,
                    duration_ms: duration.as_millis() as u64,
                }
            }
            Ok(Err(e)) => {
                // Task failed
                let duration = start_time.elapsed();
                error!("[{}] Task {} failed: {}", self.name, task.id, e);
                
                self.update_stats(false, duration.as_millis() as f64).await;
                
                TaskResult {
                    task_id: task.id,
                    worker_id: self.id,
                    success: false,
                    output: None,
                    error: Some(e.to_string()),
                    duration_ms: duration.as_millis() as u64,
                }
            }
            Err(_) => {
                // Timeout
                error!("[{}] Task {} timed out after {:?}", self.name, task.id, task_timeout);
                
                self.update_stats(false, task_timeout.as_millis() as f64).await;
                
                TaskResult {
                    task_id: task.id,
                    worker_id: self.id,
                    success: false,
                    output: None,
                    error: Some(format!("Task timed out after {:?}", task_timeout)),
                    duration_ms: task_timeout.as_millis() as u64,
                }
            }
        };

        // Send result back
        if let Err(e) = self.result_tx.send(result).await {
            error!("[{}] Failed to send result: {}", self.name, e);
        }

        self.set_status(WorkerStatus::Idle).await;
    }

    async fn execute_task(&self, task: &Task) -> Result<String> {
        debug!("[{}] Executing task: {:?}", self.name, task);

        // Simulate task execution
        // In real implementation, this would:
        // 1. Parse task payload
        // 2. Execute browser automation via CDP
        // 3. Capture results
        // 4. Return output
        
        tokio::time::sleep(Duration::from_millis(100)).await;

        Ok(format!("Task {} completed by worker {}", task.id, self.name))
    }

    async fn update_stats(&self, success: bool, duration_ms: f64) {
        let mut stats = self.stats.write().await;
        
        stats.total_tasks += 1;
        if success {
            stats.successful_tasks += 1;
        } else {
            stats.failed_tasks += 1;
        }

        // Update rolling average
        let total = stats.total_tasks as f64;
        stats.avg_execution_time_ms = 
            (stats.avg_execution_time_ms * (total - 1.0) + duration_ms) / total;

        // Estimate memory usage (placeholder)
        stats.memory_usage_mb = 150.0;
    }

    async fn report_health(&self) {
        let status = self.status.read().await;
        let stats = self.stats.read().await;
        
        debug!(
            "[{}] Health check - Status: {:?}, Tasks: {}, Success rate: {:.1}%",
            self.name,
            *status,
            stats.total_tasks,
            if stats.total_tasks > 0 {
                (stats.successful_tasks as f64 / stats.total_tasks as f64) * 100.0
            } else {
                0.0
            }
        );
    }
}
