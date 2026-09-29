//! OpenTest Semantic Engine
//! 
//! Multi-dimensional element fingerprinting for robust test automation
//! 
//! Based on whitepaper architecture:
//! - DOM structure fingerprinting
//! - Visual feature extraction
//! - Semantic text analysis
//! - Position-based heuristics
//! - Cosine similarity matching (>= 0.95 threshold)

pub mod fingerprint;
pub mod ast;
pub mod similarity;
pub mod visual;
pub mod locator;

pub use fingerprint::{ElementFingerprint, FingerprintBuilder};
pub use ast::{DOMNode, ASTAnalyzer};
pub use similarity::SimilarityMatcher;
pub use locator::ElementLocator;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_fingerprint() {
        let html = r#"<button class="btn primary" id="submit">Submit</button>"#;
        let fingerprint = FingerprintBuilder::from_html(html).unwrap();
        
        assert!(fingerprint.structural_hash.len() > 0);
        assert!(fingerprint.text_content.contains("Submit"));
    }
}
