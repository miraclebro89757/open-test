//! OpenTest Zero-Allocation Event Bus
//!
//! High-performance IPC using memory-mapped ring buffer.
//!
//! Features:
//! - Zero-copy message passing via shared memory
//! - Lock-free ring buffer with atomic operations
//! - Configurable capacity and message size
//! - Multiple producers, multiple consumers
//! - Sub-microsecond latency

pub mod ring_buffer;
pub mod event;
pub mod bus;
pub mod producer;
pub mod consumer;

pub use ring_buffer::RingBuffer;
pub use event::{Event, EventType};
pub use bus::EventBus;
pub use producer::Producer;
pub use consumer::Consumer;

/// Bus configuration
#[derive(Debug, Clone)]
pub struct BusConfig {
    /// Path to the memory-mapped file
    pub mmap_path: String,
    /// Size of the ring buffer (must be power of 2)
    pub capacity: usize,
    /// Maximum size of a single event in bytes
    pub max_event_size: usize,
    /// Create new file if it doesn't exist
    pub create_if_missing: bool,
}

impl Default for BusConfig {
    fn default() -> Self {
        Self {
            mmap_path: "/tmp/opentest_event_bus.mmap".to_string(),
            capacity: 1024 * 1024, // 1MB ring buffer
            max_event_size: 4096,   // 4KB max event
            create_if_missing: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = BusConfig::default();
        assert!(config.capacity > 0);
        assert!(config.max_event_size > 0);
    }
}
