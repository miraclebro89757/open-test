//! Event types and serialization

use serde::{Deserialize, Serialize};

/// Event types supported by the bus
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EventType {
    /// Test execution started
    TestStarted,
    /// Test execution completed
    TestCompleted,
    /// Test failed
    TestFailed,
    /// Element located
    ElementLocated,
    /// Screenshot captured
    ScreenshotCaptured,
    /// CDP command sent
    CdpCommand,
    /// CDP response received
    CdpResponse,
    /// Worker status update
    WorkerStatus,
    /// Custom event
    Custom(String),
}

/// Event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    /// Event type
    pub event_type: EventType,
    /// Timestamp (microseconds since epoch)
    pub timestamp_us: u64,
    /// Event data (JSON or binary)
    pub data: Vec<u8>,
    /// Source identifier
    pub source: String,
}

impl Event {
    pub fn new(event_type: EventType, data: Vec<u8>, source: &str) -> Self {
        Self {
            event_type,
            timestamp_us: Self::now_us(),
            data,
            source: source.to_string(),
        }
    }

    pub fn now_us() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64
    }

    /// Serialize event to bytes using bincode (zero-copy)
    pub fn to_bytes(&self) -> Result<Vec<u8>, bincode::Error> {
        bincode::serialize(self)
    }

    /// Deserialize event from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_serialization() {
        let event = Event::new(
            EventType::TestStarted,
            b"test data".to_vec(),
            "worker-1"
        );

        let bytes = event.to_bytes().unwrap();
        let decoded = Event::from_bytes(&bytes).unwrap();

        assert_eq!(decoded.event_type, EventType::TestStarted);
        assert_eq!(decoded.source, "worker-1");
        assert_eq!(decoded.data, b"test data");
    }
}
