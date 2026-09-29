//! Event producer

use crate::{EventBus, Event, EventType};
use anyhow::Result;
use std::sync::Arc;

/// Event producer
pub struct Producer {
    bus: Arc<EventBus>,
    source_id: String,
}

impl Producer {
    pub fn new(bus: Arc<EventBus>, source_id: &str) -> Self {
        Self {
            bus,
            source_id: source_id.to_string(),
        }
    }

    /// Publish an event
    pub fn publish(&self, event_type: EventType, data: Vec<u8>) -> Result<()> {
        let event = Event::new(event_type, data, &self.source_id);
        self.bus.publish(&event)
    }

    /// Publish with JSON data
    pub fn publish_json<T: serde::Serialize>(&self, event_type: EventType, data: &T) -> Result<()> {
        let json_bytes = serde_json::to_vec(data)?;
        self.publish(event_type, json_bytes)
    }
}
