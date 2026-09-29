use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

/// Multi-dimensional element fingerprint
/// 
/// Captures multiple aspects of an element for robust identification:
/// 1. Structural: DOM hierarchy, tag name, attributes
/// 2. Visual: Position, size, colors, fonts
/// 3. Semantic: Text content, ARIA labels, role
/// 4. Contextual: Parent/sibling relationships
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementFingerprint {
    // Structural dimension
    pub tag_name: String,
    pub structural_hash: String,
    pub attributes: HashMap<String, String>,
    pub class_list: Vec<String>,
    
    // Semantic dimension
    pub text_content: String,
    pub aria_label: Option<String>,
    pub role: Option<String>,
    pub semantic_score: f64,
    
    // Visual dimension (from CDP)
    pub visual_hash: Option<String>,
    pub bounding_box: Option<BoundingBox>,
    pub computed_styles: HashMap<String, String>,
    
    // Contextual dimension
    pub parent_tag: Option<String>,
    pub sibling_count: usize,
    pub depth: usize,
    
    // Combined fingerprint vector (for cosine similarity)
    pub feature_vector: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Builder for creating element fingerprints
pub struct FingerprintBuilder {
    tag_name: String,
    attributes: HashMap<String, String>,
    text_content: String,
    parent_tag: Option<String>,
    depth: usize,
}

impl FingerprintBuilder {
    pub fn new(tag_name: &str) -> Self {
        Self {
            tag_name: tag_name.to_lowercase(),
            attributes: HashMap::new(),
            text_content: String::new(),
            parent_tag: None,
            depth: 0,
        }
    }

    pub fn from_html(html: &str) -> Result<ElementFingerprint, anyhow::Error> {
        use scraper::{Html, Selector};
        
        let document = Html::parse_fragment(html);
        let selector = Selector::parse("*").unwrap();
        
        let element = document.select(&selector).next()
            .ok_or_else(|| anyhow::anyhow!("No element found"))?;
        
        let tag_name = element.value().name();
        let mut builder = Self::new(tag_name);
        
        // Extract attributes
        for (name, value) in element.value().attrs() {
            builder.attributes.insert(name.to_string(), value.to_string());
        }
        
        // Extract text content
        builder.text_content = element.text().collect::<String>().trim().to_string();
        
        builder.build()
    }

    pub fn with_attribute(mut self, key: &str, value: &str) -> Self {
        self.attributes.insert(key.to_string(), value.to_string());
        self
    }

    pub fn with_text(mut self, text: &str) -> Self {
        self.text_content = text.to_string();
        self
    }

    pub fn with_parent(mut self, parent_tag: &str) -> Self {
        self.parent_tag = Some(parent_tag.to_string());
        self
    }

    pub fn with_depth(mut self, depth: usize) -> Self {
        self.depth = depth;
        self
    }

    pub fn build(self) -> Result<ElementFingerprint, anyhow::Error> {
        // 1. Calculate structural hash
        let structural_hash = self.compute_structural_hash();
        
        // 2. Extract class list
        let class_list = self.extract_class_list();
        
        // 3. Calculate semantic score
        let semantic_score = self.compute_semantic_score();
        
        // 4. Extract ARIA attributes
        let aria_label = self.attributes.get("aria-label").cloned();
        let role = self.attributes.get("role").cloned();
        
        // 5. Build feature vector for similarity matching
        let feature_vector = self.build_feature_vector(&class_list, semantic_score);
        
        Ok(ElementFingerprint {
            tag_name: self.tag_name,
            structural_hash,
            attributes: self.attributes,
            class_list,
            text_content: self.text_content,
            aria_label,
            role,
            semantic_score,
            visual_hash: None,
            bounding_box: None,
            computed_styles: HashMap::new(),
            parent_tag: self.parent_tag,
            sibling_count: 0,
            depth: self.depth,
            feature_vector,
        })
    }

    fn compute_structural_hash(&self) -> String {
        let mut hasher = Sha256::new();
        
        // Hash tag name
        hasher.update(self.tag_name.as_bytes());
        
        // Hash sorted attributes (excluding volatile ones)
        let mut sorted_attrs: Vec<_> = self.attributes.iter()
            .filter(|(k, _)| !Self::is_volatile_attribute(k))
            .collect();
        sorted_attrs.sort_by_key(|(k, _)| *k);
        
        for (key, value) in sorted_attrs {
            hasher.update(key.as_bytes());
            hasher.update(value.as_bytes());
        }
        
        // Hash text content (first 100 chars)
        let text_sample = self.text_content.chars().take(100).collect::<String>();
        hasher.update(text_sample.as_bytes());
        
        let result = hasher.finalize();
        format!("{:x}", result)[..16].to_string()
    }

    fn is_volatile_attribute(key: &str) -> bool {
        // Attributes that change frequently and shouldn't affect structural identity
        matches!(key, "style" | "data-testid" | "aria-busy" | "aria-selected")
    }

    fn extract_class_list(&self) -> Vec<String> {
        self.attributes.get("class")
            .map(|classes| {
                classes.split_whitespace()
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default()
    }

    fn compute_semantic_score(&self) -> f64 {
        let mut score = 0.0;
        
        // 1. Has meaningful text content
        if !self.text_content.trim().is_empty() {
            score += 0.3;
        }
        
        // 2. Has ARIA label
        if self.attributes.contains_key("aria-label") {
            score += 0.2;
        }
        
        // 3. Has semantic role
        if self.attributes.contains_key("role") {
            score += 0.2;
        }
        
        // 4. Has ID (unique identifier)
        if self.attributes.contains_key("id") {
            score += 0.15;
        }
        
        // 5. Is interactive element
        if matches!(self.tag_name.as_str(), "button" | "a" | "input" | "select" | "textarea") {
            score += 0.15;
        }
        
        score.min(1.0)
    }

    fn build_feature_vector(&self, class_list: &[String], semantic_score: f64) -> Vec<f64> {
        let mut vector = Vec::with_capacity(100);
        
        // 1. Tag name encoding (one-hot-like)
        let tag_score = match self.tag_name.as_str() {
            "button" => 1.0,
            "a" => 0.9,
            "input" => 0.8,
            "div" => 0.3,
            "span" => 0.2,
            _ => 0.5,
        };
        vector.push(tag_score);
        
        // 2. Semantic score
        vector.push(semantic_score);
        
        // 3. Text content length (normalized)
        let text_len_norm = (self.text_content.len() as f64 / 100.0).min(1.0);
        vector.push(text_len_norm);
        
        // 4. Class count
        let class_count_norm = (class_list.len() as f64 / 5.0).min(1.0);
        vector.push(class_count_norm);
        
        // 5. Attribute count
        let attr_count_norm = (self.attributes.len() as f64 / 10.0).min(1.0);
        vector.push(attr_count_norm);
        
        // 6. Depth in tree
        let depth_norm = (self.depth as f64 / 20.0).min(1.0);
        vector.push(depth_norm);
        
        // 7. Has ID
        vector.push(if self.attributes.contains_key("id") { 1.0 } else { 0.0 });
        
        // 8. Has name
        vector.push(if self.attributes.contains_key("name") { 1.0 } else { 0.0 });
        
        // 9-28. Top 20 most common class name hashes
        let common_classes = [
            "btn", "button", "primary", "secondary", "submit", "cancel",
            "form", "input", "text", "link", "nav", "menu", "dropdown",
            "modal", "dialog", "tooltip", "card", "container", "wrapper", "flex"
        ];
        
        for class_name in common_classes {
            let has_class = class_list.iter().any(|c| c.contains(class_name));
            vector.push(if has_class { 1.0 } else { 0.0 });
        }
        
        // Pad to fixed size
        while vector.len() < 100 {
            vector.push(0.0);
        }
        
        vector
    }
}

impl ElementFingerprint {
    /// Update visual information from CDP
    pub fn set_visual_info(&mut self, bbox: BoundingBox, styles: HashMap<String, String>) {
        self.bounding_box = Some(bbox);
        self.computed_styles = styles;
        self.visual_hash = Some(self.compute_visual_hash());
    }

    fn compute_visual_hash(&self) -> String {
        let mut hasher = Sha256::new();
        
        if let Some(ref bbox) = self.bounding_box {
            hasher.update(format!("{:.0},{:.0},{:.0},{:.0}", 
                bbox.x, bbox.y, bbox.width, bbox.height).as_bytes());
        }
        
        // Hash key style properties
        for key in ["background-color", "color", "font-family", "font-size"] {
            if let Some(value) = self.computed_styles.get(key) {
                hasher.update(value.as_bytes());
            }
        }
        
        let result = hasher.finalize();
        format!("{:x}", result)[..16].to_string()
    }

    /// Get a human-readable description for debugging
    pub fn description(&self) -> String {
        let mut parts = vec![self.tag_name.clone()];
        
        if let Some(id) = self.attributes.get("id") {
            parts.push(format!("#{}",id));
        }
        
        if !self.class_list.is_empty() {
            parts.push(format!(".{}", self.class_list.join(".")));
        }
        
        if !self.text_content.is_empty() {
            let text = self.text_content.chars().take(30).collect::<String>();
            parts.push(format!("'{}'", text));
        }
        
        parts.join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fingerprint_builder() {
        let fingerprint = FingerprintBuilder::new("button")
            .with_attribute("id", "submit-btn")
            .with_attribute("class", "btn primary")
            .with_text("Submit")
            .with_depth(3)
            .build()
            .unwrap();

        assert_eq!(fingerprint.tag_name, "button");
        assert_eq!(fingerprint.text_content, "Submit");
        assert_eq!(fingerprint.class_list, vec!["btn", "primary"]);
        assert!(fingerprint.semantic_score > 0.5);
        assert_eq!(fingerprint.feature_vector.len(), 100);
    }

    #[test]
    fn test_from_html() {
        let html = r#"<button class="btn primary" id="submit">Click Me</button>"#;
        let fingerprint = FingerprintBuilder::from_html(html).unwrap();

        assert_eq!(fingerprint.tag_name, "button");
        assert_eq!(fingerprint.text_content, "Click Me");
        assert!(fingerprint.attributes.contains_key("id"));
    }

    #[test]
    fn test_structural_hash_stability() {
        let fp1 = FingerprintBuilder::new("button")
            .with_attribute("class", "btn primary")
            .with_text("Submit")
            .build()
            .unwrap();

        let fp2 = FingerprintBuilder::new("button")
            .with_attribute("class", "btn primary")
            .with_text("Submit")
            .build()
            .unwrap();

        assert_eq!(fp1.structural_hash, fp2.structural_hash);
    }
}
