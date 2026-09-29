//! Lock-free ring buffer implementation
//!
//! Uses atomic operations for thread-safe producer-consumer pattern
//! without locks for maximum performance.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum RingBufferError {
    #[error("Ring buffer is full")]
    Full,
    #[error("Ring buffer is empty")]
    Empty,
    #[error("Message too large: {size} bytes (max: {max})")]
    MessageTooLarge { size: usize, max: usize },
    #[error("Invalid capacity: {0} (must be power of 2)")]
    InvalidCapacity(usize),
}

/// Ring buffer metadata stored in shared memory
#[repr(C)]
pub struct RingBufferHeader {
    /// Write position (producer)
    pub write_pos: AtomicUsize,
    /// Read position (consumer)
    pub read_pos: AtomicUsize,
    /// Capacity of the buffer
    pub capacity: usize,
    /// Maximum event size
    pub max_event_size: usize,
}

/// Lock-free ring buffer for event passing
pub struct RingBuffer {
    header: Arc<RingBufferHeader>,
    buffer: *mut u8,
    capacity: usize,
}

unsafe impl Send for RingBuffer {}
unsafe impl Sync for RingBuffer {}

impl RingBuffer {
    /// Create a new ring buffer with given capacity
    ///
    /// Capacity must be a power of 2 for efficient modulo operations
    pub fn new(buffer: *mut u8, capacity: usize, max_event_size: usize) -> Result<Self, RingBufferError> {
        if !capacity.is_power_of_two() {
            return Err(RingBufferError::InvalidCapacity(capacity));
        }

        let header = Arc::new(RingBufferHeader {
            write_pos: AtomicUsize::new(0),
            read_pos: AtomicUsize::new(0),
            capacity,
            max_event_size,
        });

        Ok(Self {
            header,
            buffer,
            capacity,
        })
    }

    /// Write data to the ring buffer
    ///
    /// Returns true if write succeeded, false if buffer is full
    pub fn write(&self, data: &[u8]) -> Result<(), RingBufferError> {
        if data.len() > self.header.max_event_size {
            return Err(RingBufferError::MessageTooLarge {
                size: data.len(),
                max: self.header.max_event_size,
            });
        }

        // Calculate required space (4 bytes for length + data)
        let required_space = 4 + data.len();

        loop {
            let write_pos = self.header.write_pos.load(Ordering::Acquire);
            let read_pos = self.header.read_pos.load(Ordering::Acquire);

            // Calculate available space
            let available = if write_pos >= read_pos {
                self.capacity - (write_pos - read_pos)
            } else {
                read_pos - write_pos
            };

            if available < required_space {
                return Err(RingBufferError::Full);
            }

            // Try to claim write position
            let new_write_pos = (write_pos + required_space) % self.capacity;
            
            if self.header.write_pos.compare_exchange(
                write_pos,
                new_write_pos,
                Ordering::Release,
                Ordering::Acquire
            ).is_ok() {
                // Successfully claimed, now write data
                unsafe {
                    // Write length header (4 bytes)
                    let len_bytes = (data.len() as u32).to_le_bytes();
                    for (i, byte) in len_bytes.iter().enumerate() {
                        let pos = (write_pos + i) % self.capacity;
                        *self.buffer.add(pos) = *byte;
                    }

                    // Write data
                    for (i, byte) in data.iter().enumerate() {
                        let pos = (write_pos + 4 + i) % self.capacity;
                        *self.buffer.add(pos) = *byte;
                    }
                }

                return Ok(());
            }
            // CAS failed, retry
        }
    }

    /// Read data from the ring buffer
    ///
    /// Returns None if buffer is empty
    pub fn read(&self) -> Result<Vec<u8>, RingBufferError> {
        loop {
            let read_pos = self.header.read_pos.load(Ordering::Acquire);
            let write_pos = self.header.write_pos.load(Ordering::Acquire);

            // Check if buffer is empty
            if read_pos == write_pos {
                return Err(RingBufferError::Empty);
            }

            // Read length header
            let mut len_bytes = [0u8; 4];
            unsafe {
                for i in 0..4 {
                    let pos = (read_pos + i) % self.capacity;
                    len_bytes[i] = *self.buffer.add(pos);
                }
            }
            let data_len = u32::from_le_bytes(len_bytes) as usize;

            if data_len > self.header.max_event_size {
                // Corrupted data, skip
                return Err(RingBufferError::MessageTooLarge {
                    size: data_len,
                    max: self.header.max_event_size,
                });
            }

            // Read data
            let mut data = vec![0u8; data_len];
            unsafe {
                for i in 0..data_len {
                    let pos = (read_pos + 4 + i) % self.capacity;
                    data[i] = *self.buffer.add(pos);
                }
            }

            // Try to advance read position
            let new_read_pos = (read_pos + 4 + data_len) % self.capacity;
            
            if self.header.read_pos.compare_exchange(
                read_pos,
                new_read_pos,
                Ordering::Release,
                Ordering::Acquire
            ).is_ok() {
                return Ok(data);
            }
            // CAS failed, retry
        }
    }

    /// Check if buffer is empty
    pub fn is_empty(&self) -> bool {
        let read_pos = self.header.read_pos.load(Ordering::Acquire);
        let write_pos = self.header.write_pos.load(Ordering::Acquire);
        read_pos == write_pos
    }

    /// Get current buffer usage
    pub fn usage(&self) -> usize {
        let read_pos = self.header.read_pos.load(Ordering::Acquire);
        let write_pos = self.header.write_pos.load(Ordering::Acquire);

        if write_pos >= read_pos {
            write_pos - read_pos
        } else {
            self.capacity - (read_pos - write_pos)
        }
    }

    /// Get buffer capacity
    pub fn capacity(&self) -> usize {
        self.capacity
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_basic() {
        let capacity = 1024;
        let buffer = vec![0u8; capacity];
        let buffer_ptr = buffer.as_ptr() as *mut u8;

        let rb = RingBuffer::new(buffer_ptr, capacity, 256).unwrap();

        // Write some data
        let data = b"Hello, World!";
        rb.write(data).unwrap();

        // Read it back
        let read_data = rb.read().unwrap();
        assert_eq!(read_data, data);
    }

    #[test]
    fn test_ring_buffer_full() {
        let capacity = 64;
        let buffer = vec![0u8; capacity];
        let buffer_ptr = buffer.as_ptr() as *mut u8;

        let rb = RingBuffer::new(buffer_ptr, capacity, 20).unwrap();

        // Fill the buffer
        while rb.write(b"test").is_ok() {}

        // Should be full now
        assert!(rb.write(b"test").is_err());
    }

    #[test]
    fn test_invalid_capacity() {
        let buffer = vec![0u8; 100];
        let buffer_ptr = buffer.as_ptr() as *mut u8;

        // Not a power of 2
        assert!(RingBuffer::new(buffer_ptr, 100, 10).is_err());
    }
}
