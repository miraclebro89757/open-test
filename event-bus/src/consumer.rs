//! Event consumer

use crate::{EventBus, Event, EventType};
use anyhow::Result;
use std::sync::Arc;
use std::time::Duration;

/// Event consumer with filtering
pub struct Consumer {
    bus: Arc<EventBus>,
    filter: Option<Vec<EventType>>,
}

impl Consumer {
    pub fn new(bus: Arc<EventBus>) -> Self {
        Self {
            bus,
            filter: None,
        }
    }

    /// Create consumer with event type filter
    pub fn with_filter(bus: Arc<EventBus>, types: Vec<EventType>) -> Self {
        Self {
            bus,
            filter: Some(types),
        }
    }

    /// Try to consume an event (non-blocking)
    pub fn try_consume(&self) -> Result<Option<Event>> {
        loop {
            match self.bus.try_consume()? {
                Some(event) => {
                    // Apply filter
                    if let Some(ref filter) = self.filter {
                        if !filter.contains(&event.event_type) {
                            continue; // Skip filtered events
                        }
                    }
                    return Ok(Some(event));
                }
                None => return Ok(None),
            }
        }
    }

    /// Blocking consume with timeout
    pub fn consume_timeout(&self, timeout: Duration) -> Result<Option<Event>> {
        let start = std::time::Instant::now();
        
        loop {
            if let Some(event) = self.try_consume()? {
                return Ok(Some(event));
            }
            
            if start.elapsed() >= timeout {
                return Ok(None);
            }
            
            // Small sleep to avoid busy waiting
            std::thread::sleep(Duration::from_micros(10));
        }
    }

    /// Consume with JSON deserialization
    pub fn consume_json<T: serde::de::DeserializeOwned>(&self) -> Result<Option<(Event, T)>> {
        if let Some(event) = self.try_consume()? {
            let data: T = serde_json::from_slice(&event.data)?;
            Ok(Some((event, data)))
        } else {
            Ok(None)
        }
    }
}
