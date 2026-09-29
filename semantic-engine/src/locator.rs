//! Element locator with auto-healing capabilities
//! 
//! This module combines all fingerprinting techniques to:
//! 1. Store element fingerprints during test recording
//! 2. Find elements even after frontend refactoring
//! 3. Auto-heal broken selectors using similarity matching

use crate::fingerprint::ElementFingerprint;
use crate::similarity::{SimilarityMatcher, SimilarityMatch};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementLocator {
    pub id: String,
    pub original_selector: String,
    pub fingerprint: ElementFingerprint,
    pub fallback_selectors: Vec<String>,
}

impl ElementLocator {
    pub fn new(id: &str, selector: &str, fingerprint: ElementFingerprint) -> Self {
        Self {
            id: id.to_string(),
            original_selector: selector.to_string(),
            fingerprint,
            fallback_selectors: vec![],
        }
    }

    /// Try to locate element with auto-healing
    pub fn locate_with_healing(
        &self,
        candidates: &[ElementFingerprint],
    ) -> Option<SimilarityMatch> {
        let matcher = SimilarityMatcher::default();
        matcher.find_best_match(&self.fingerprint, candidates)
    }

    /// Generate CSS selector from fingerprint
    pub fn generate_selector(&self) -> String {
        let fp = &self.fingerprint;
        
        // Priority: ID > unique class > tag + text
        if let Some(id) = fp.attributes.get("id") {
            return format!("#{}", id);
        }
        
        if !fp.class_list.is_empty() {
            return format!("{}.{}", fp.tag_name, fp.class_list.join("."));
        }
        
        if !fp.text_content.is_empty() {
            let text_sample = fp.text_content.chars().take(20).collect::<String>();
            return format!("{}:contains('{}')", fp.tag_name, text_sample);
        }
        
        fp.tag_name.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fingerprint::FingerprintBuilder;

    #[test]
    fn test_generate_selector() {
        let fp = FingerprintBuilder::new("button")
            .with_attribute("id", "submit-btn")
            .build()
            .unwrap();

        let locator = ElementLocator::new("test", "#submit-btn", fp);
        assert_eq!(locator.generate_selector(), "#submit-btn");
    }

    #[test]
    fn test_locate_with_healing() {
        let original_fp = FingerprintBuilder::new("button")
            .with_attribute("class", "btn primary")
            .with_text("Submit")
            .build()
            .unwrap();

        let locator = ElementLocator::new("submit", ".btn.primary", original_fp);

        // Element after refactoring (class changed but structure same)
        let refactored_fp = FingerprintBuilder::new("button")
            .with_attribute("class", "button button-primary")
            .with_text("Submit")
            .build()
            .unwrap();

        let result = locator.locate_with_healing(&[refactored_fp]);
        assert!(result.is_some());
    }
}
