//! Event bus implementation using memory-mapped ring buffer

use crate::{BusConfig, RingBuffer, Event};
use anyhow::Result;
use memmap2::{MmapMut, MmapOptions};
use std::fs::OpenOptions;
use std::sync::Arc;
use parking_lot::RwLock;

/// Zero-allocation event bus
pub struct EventBus {
    config: BusConfig,
    ring_buffer: Arc<RwLock<RingBuffer>>,
    _mmap: Arc<MmapMut>,
}

impl EventBus {
    /// Create or open an event bus
    pub fn new(config: BusConfig) -> Result<Self> {
        // Open or create memory-mapped file
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(config.create_if_missing)
            .open(&config.mmap_path)?;

        // Set file size
        file.set_len(config.capacity as u64)?;

        // Memory map the file
        let mut mmap = unsafe { MmapOptions::new().map_mut(&file)? };

        // Get pointer to the buffer
        let buffer_ptr = mmap.as_mut_ptr();

        // Create ring buffer
        let ring_buffer = RingBuffer::new(
            buffer_ptr,
            config.capacity,
            config.max_event_size,
        )?;

        Ok(Self {
            config,
            ring_buffer: Arc::new(RwLock::new(ring_buffer)),
            _mmap: Arc::new(mmap),
        })
    }

    /// Publish an event
    pub fn publish(&self, event: &Event) -> Result<()> {
        let bytes = event.to_bytes()?;
        
        let rb = self.ring_buffer.read();
        rb.write(&bytes)?;
        
        Ok(())
    }

    /// Try to consume an event (non-blocking)
    pub fn try_consume(&self) -> Result<Option<Event>> {
        let rb = self.ring_buffer.read();
        
        match rb.read() {
            Ok(bytes) => {
                let event = Event::from_bytes(&bytes)?;
                Ok(Some(event))
            }
            Err(crate::ring_buffer::RingBufferError::Empty) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Get buffer usage statistics
    pub fn stats(&self) -> BusStats {
        let rb = self.ring_buffer.read();
        
        BusStats {
            capacity: rb.capacity(),
            used: rb.usage(),
            available: rb.capacity() - rb.usage(),
            utilization: (rb.usage() as f64 / rb.capacity() as f64) * 100.0,
        }
    }

    /// Check if bus is empty
    pub fn is_empty(&self) -> bool {
        let rb = self.ring_buffer.read();
        rb.is_empty()
    }
}

#[derive(Debug, Clone)]
pub struct BusStats {
    pub capacity: usize,
    pub used: usize,
    pub available: usize,
    pub utilization: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::EventType;

    #[test]
    fn test_event_bus_basic() {
        let config = BusConfig {
            mmap_path: "/tmp/test_event_bus.mmap".to_string(),
            capacity: 1024 * 1024,
            max_event_size: 4096,
            create_if_missing: true,
        };

        let bus = EventBus::new(config).unwrap();

        // Publish an event
        let event = Event::new(
            EventType::TestStarted,
            b"test data".to_vec(),
            "test-worker"
        );
        bus.publish(&event).unwrap();

        // Consume the event
        let consumed = bus.try_consume().unwrap().unwrap();
        assert_eq!(consumed.event_type, EventType::TestStarted);
        assert_eq!(consumed.source, "test-worker");
    }

    #[test]
    fn test_bus_stats() {
        let config = BusConfig {
            mmap_path: "/tmp/test_stats_bus.mmap".to_string(),
            capacity: 1024,
            max_event_size: 256,
            create_if_missing: true,
        };

        let bus = EventBus::new(config).unwrap();
        
        let stats = bus.stats();
        assert_eq!(stats.capacity, 1024);
        assert_eq!(stats.used, 0);
    }
}
