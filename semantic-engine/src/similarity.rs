use crate::fingerprint::ElementFingerprint;
use serde::{Deserialize, Serialize};

/// Similarity matching result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarityMatch {
    pub similarity_score: f64,
    pub matched_fingerprint: ElementFingerprint,
    pub confidence: MatchConfidence,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MatchConfidence {
    High,      // >= 0.95
    Medium,    // >= 0.85
    Low,       // >= 0.70
    VeryLow,   // < 0.70
}

/// Similarity matcher using cosine similarity
pub struct SimilarityMatcher {
    threshold: f64,
}

impl Default for SimilarityMatcher {
    fn default() -> Self {
        Self::new(0.95) // Whitepaper specifies >= 0.95 threshold
    }
}

impl SimilarityMatcher {
    pub fn new(threshold: f64) -> Self {
        Self { threshold }
    }

    /// Find best matching element from candidates
    pub fn find_best_match(
        &self,
        target: &ElementFingerprint,
        candidates: &[ElementFingerprint],
    ) -> Option<SimilarityMatch> {
        let mut best_match: Option<(f64, &ElementFingerprint)> = None;

        for candidate in candidates {
            let score = self.calculate_similarity(target, candidate);
            
            if score >= self.threshold {
                if let Some((best_score, _)) = best_match {
                    if score > best_score {
                        best_match = Some((score, candidate));
                    }
                } else {
                    best_match = Some((score, candidate));
                }
            }
        }

        best_match.map(|(score, fp)| SimilarityMatch {
            similarity_score: score,
            matched_fingerprint: fp.clone(),
            confidence: Self::score_to_confidence(score),
        })
    }

    /// Calculate overall similarity between two fingerprints
    pub fn calculate_similarity(&self, a: &ElementFingerprint, b: &ElementFingerprint) -> f64 {
        // Multi-dimensional similarity calculation
        
        // 1. Vector cosine similarity (40% weight)
        let vector_sim = self.cosine_similarity(&a.feature_vector, &b.feature_vector);
        
        // 2. Structural similarity (30% weight)
        let structural_sim = self.structural_similarity(a, b);
        
        // 3. Semantic similarity (20% weight)
        let semantic_sim = self.semantic_similarity(a, b);
        
        // 4. Visual similarity (10% weight)
        let visual_sim = self.visual_similarity(a, b);
        
        // Weighted combination
        vector_sim * 0.4 + structural_sim * 0.3 + semantic_sim * 0.2 + visual_sim * 0.1
    }

    /// Cosine similarity between feature vectors
    fn cosine_similarity(&self, a: &[f64], b: &[f64]) -> f64 {
        if a.len() != b.len() {
            return 0.0;
        }

        let dot_product: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let magnitude_a: f64 = a.iter().map(|x| x * x).sum::<f64>().sqrt();
        let magnitude_b: f64 = b.iter().map(|x| x * x).sum::<f64>().sqrt();

        if magnitude_a == 0.0 || magnitude_b == 0.0 {
            return 0.0;
        }

        (dot_product / (magnitude_a * magnitude_b)).max(0.0).min(1.0)
    }

    /// Structural similarity (tag, attributes, hierarchy)
    fn structural_similarity(&self, a: &ElementFingerprint, b: &ElementFingerprint) -> f64 {
        let mut score = 0.0;
        let mut weight = 0.0;

        // Tag name match (critical)
        if a.tag_name == b.tag_name {
            score += 0.4;
        }
        weight += 0.4;

        // Structural hash match (very strong signal)
        if a.structural_hash == b.structural_hash {
            score += 0.3;
        }
        weight += 0.3;

        // Class overlap
        let class_overlap = self.jaccard_similarity(&a.class_list, &b.class_list);
        score += class_overlap * 0.2;
        weight += 0.2;

        // Depth similarity (same level in tree)
        let depth_diff = (a.depth as i32 - b.depth as i32).abs();
        let depth_sim = (1.0 - (depth_diff as f64 / 10.0)).max(0.0);
        score += depth_sim * 0.1;
        weight += 0.1;

        if weight > 0.0 {
            score / weight
        } else {
            0.0
        }
    }

    /// Semantic similarity (text, ARIA, role)
    fn semantic_similarity(&self, a: &ElementFingerprint, b: &ElementFingerprint) -> f64 {
        let mut score = 0.0;
        let mut weight = 0.0;

        // Text content similarity
        let text_sim = self.text_similarity(&a.text_content, &b.text_content);
        score += text_sim * 0.5;
        weight += 0.5;

        // ARIA label match
        match (&a.aria_label, &b.aria_label) {
            (Some(label_a), Some(label_b)) if label_a == label_b => {
                score += 0.3;
            }
            _ => {}
        }
        weight += 0.3;

        // Role match
        match (&a.role, &b.role) {
            (Some(role_a), Some(role_b)) if role_a == role_b => {
                score += 0.2;
            }
            _ => {}
        }
        weight += 0.2;

        if weight > 0.0 {
            score / weight
        } else {
            0.0
        }
    }

    /// Visual similarity (position, size, styles)
    fn visual_similarity(&self, a: &ElementFingerprint, b: &ElementFingerprint) -> f64 {
        match (&a.visual_hash, &b.visual_hash) {
            (Some(hash_a), Some(hash_b)) if hash_a == hash_b => 1.0,
            (Some(_), Some(_)) => {
                // Compare bounding boxes
                match (&a.bounding_box, &b.bounding_box) {
                    (Some(bbox_a), Some(bbox_b)) => {
                        let size_a = bbox_a.width * bbox_a.height;
                        let size_b = bbox_b.width * bbox_b.height;
                        
                        if size_a == 0.0 || size_b == 0.0 {
                            return 0.0;
                        }
                        
                        let size_ratio = (size_a / size_b).min(size_b / size_a);
                        size_ratio
                    }
                    _ => 0.5,
                }
            }
            _ => 0.5, // No visual info available, neutral score
        }
    }

    /// Jaccard similarity for sets
    fn jaccard_similarity<T: Eq + std::hash::Hash>(&self, a: &[T], b: &[T]) -> f64 {
        use std::collections::HashSet;

        let set_a: HashSet<_> = a.iter().collect();
        let set_b: HashSet<_> = b.iter().collect();

        let intersection = set_a.intersection(&set_b).count();
        let union = set_a.union(&set_b).count();

        if union == 0 {
            return 0.0;
        }

        intersection as f64 / union as f64
    }

    /// Text similarity using simple character overlap
    fn text_similarity(&self, a: &str, b: &str) -> f64 {
        if a.is_empty() && b.is_empty() {
            return 1.0;
        }
        
        if a.is_empty() || b.is_empty() {
            return 0.0;
        }

        // Normalize and compare
        let a_norm = a.to_lowercase();
        let b_norm = b.to_lowercase();

        if a_norm == b_norm {
            return 1.0;
        }

        // Calculate Levenshtein distance for short strings
        if a_norm.len() < 50 && b_norm.len() < 50 {
            let distance = levenshtein_distance(&a_norm, &b_norm);
            let max_len = a_norm.len().max(b_norm.len());
            return 1.0 - (distance as f64 / max_len as f64);
        }

        // For longer strings, use word overlap
        let words_a: std::collections::HashSet<_> = a_norm.split_whitespace().collect();
        let words_b: std::collections::HashSet<_> = b_norm.split_whitespace().collect();
        
        let intersection = words_a.intersection(&words_b).count();
        let union = words_a.union(&words_b).count();
        
        if union == 0 {
            0.0
        } else {
            intersection as f64 / union as f64
        }
    }

    fn score_to_confidence(score: f64) -> MatchConfidence {
        if score >= 0.95 {
            MatchConfidence::High
        } else if score >= 0.85 {
            MatchConfidence::Medium
        } else if score >= 0.70 {
            MatchConfidence::Low
        } else {
            MatchConfidence::VeryLow
        }
    }
}

/// Levenshtein distance calculation
fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();

    let mut matrix = vec![vec![0; b_len + 1]; a_len + 1];

    for i in 0..=a_len {
        matrix[i][0] = i;
    }
    for j in 0..=b_len {
        matrix[0][j] = j;
    }

    for i in 1..=a_len {
        for j in 1..=b_len {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            matrix[i][j] = (matrix[i - 1][j] + 1)
                .min(matrix[i][j - 1] + 1)
                .min(matrix[i - 1][j - 1] + cost);
        }
    }

    matrix[a_len][b_len]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fingerprint::FingerprintBuilder;

    #[test]
    fn test_cosine_similarity() {
        let matcher = SimilarityMatcher::default();
        
        let vec1 = vec![1.0, 0.0, 1.0, 0.0];
        let vec2 = vec![1.0, 0.0, 1.0, 0.0];
        
        let similarity = matcher.cosine_similarity(&vec1, &vec2);
        assert!((similarity - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_find_best_match() {
        let target = FingerprintBuilder::new("button")
            .with_attribute("class", "btn primary")
            .with_text("Submit")
            .build()
            .unwrap();

        let candidate1 = FingerprintBuilder::new("button")
            .with_attribute("class", "btn primary")
            .with_text("Submit")
            .build()
            .unwrap();

        let candidate2 = FingerprintBuilder::new("div")
            .with_text("Not a button")
            .build()
            .unwrap();

        let matcher = SimilarityMatcher::new(0.8);
        let result = matcher.find_best_match(&target, &[candidate1, candidate2]);

        assert!(result.is_some());
        let match_result = result.unwrap();
        assert!(match_result.similarity_score > 0.8);
    }

    #[test]
    fn test_structural_similarity() {
        let matcher = SimilarityMatcher::default();

        let fp1 = FingerprintBuilder::new("button")
            .with_attribute("class", "btn")
            .build()
            .unwrap();

        let fp2 = FingerprintBuilder::new("button")
            .with_attribute("class", "btn")
            .build()
            .unwrap();

        let similarity = matcher.structural_similarity(&fp1, &fp2);
        assert!(similarity > 0.9);
    }
}
