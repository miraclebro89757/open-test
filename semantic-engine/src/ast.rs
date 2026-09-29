use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::fingerprint::{ElementFingerprint, FingerprintBuilder};

/// DOM Node representation for AST analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DOMNode {
    pub tag_name: String,
    pub attributes: HashMap<String, String>,
    pub text_content: String,
    pub children: Vec<DOMNode>,
    pub fingerprint: Option<ElementFingerprint>,
}

/// AST Analyzer for extracting semantic information from DOM
pub struct ASTAnalyzer;

impl ASTAnalyzer {
    /// Parse HTML into DOM tree with fingerprints
    pub fn parse_html(html: &str) -> Result<Vec<DOMNode>, anyhow::Error> {
        use scraper::{Html, ElementRef};
        
        let document = Html::parse_document(html);
        let root = document.root_element();
        
        Ok(Self::parse_element(root, 0))
    }

    fn parse_element(element: ElementRef, depth: usize) -> Vec<DOMNode> {
        let mut nodes = Vec::new();
        
        let tag_name = element.value().name();
        
        // Skip script, style, and meta tags
        if matches!(tag_name, "script" | "style" | "meta" | "link") {
            return nodes;
        }
        
        // Build attributes map
        let mut attributes = HashMap::new();
        for (name, value) in element.value().attrs() {
            attributes.insert(name.to_string(), value.to_string());
        }
        
        // Get direct text content (not from children)
        let text_content = element.text()
            .collect::<String>()
            .trim()
            .to_string();
        
        // Build fingerprint
        let mut builder = FingerprintBuilder::new(tag_name);
        for (k, v) in &attributes {
            builder = builder.with_attribute(k, v);
        }
        builder = builder.with_text(&text_content);
        builder = builder.with_depth(depth);
        
        if let Some(parent) = element.parent_element() {
            builder = builder.with_parent(parent.value().name());
        }
        
        let fingerprint = builder.build().ok();
        
        // Parse children
        let children: Vec<DOMNode> = element.children()
            .filter_map(|child| {
                ElementRef::wrap(child)
                    .map(|e| Self::parse_element(e, depth + 1))
            })
            .flatten()
            .collect();
        
        nodes.push(DOMNode {
            tag_name: tag_name.to_string(),
            attributes,
            text_content,
            children,
            fingerprint,
        });
        
        nodes
    }

    /// Find all interactive elements in the tree
    pub fn find_interactive_elements(nodes: &[DOMNode]) -> Vec<&ElementFingerprint> {
        let mut result = Vec::new();
        
        for node in nodes {
            if Self::is_interactive(&node.tag_name) {
                if let Some(ref fp) = node.fingerprint {
                    result.push(fp);
                }
            }
            
            result.extend(Self::find_interactive_elements(&node.children));
        }
        
        result
    }

    fn is_interactive(tag: &str) -> bool {
        matches!(tag, "button" | "a" | "input" | "select" | "textarea")
    }

    /// Extract semantic landmarks (main, nav, header, footer, etc.)
    pub fn extract_landmarks(nodes: &[DOMNode]) -> HashMap<String, Vec<&ElementFingerprint>> {
        let mut landmarks = HashMap::new();
        
        Self::extract_landmarks_recursive(nodes, &mut landmarks);
        
        landmarks
    }

    fn extract_landmarks_recursive<'a>(
        nodes: &'a [DOMNode],
        landmarks: &mut HashMap<String, Vec<&'a ElementFingerprint>>,
    ) {
        for node in nodes {
            // Check for landmark tags
            if matches!(node.tag_name.as_str(), "nav" | "main" | "header" | "footer" | "aside" | "section") {
                if let Some(ref fp) = node.fingerprint {
                    landmarks.entry(node.tag_name.clone())
                        .or_insert_with(Vec::new)
                        .push(fp);
                }
            }
            
            // Check for ARIA landmarks
            if let Some(role) = node.attributes.get("role") {
                if matches!(role.as_str(), "navigation" | "main" | "banner" | "contentinfo" | "complementary") {
                    if let Some(ref fp) = node.fingerprint {
                        landmarks.entry(format!("aria-{}", role))
                            .or_insert_with(Vec::new)
                            .push(fp);
                    }
                }
            }
            
            Self::extract_landmarks_recursive(&node.children, landmarks);
        }
    }

    /// Calculate page structure signature
    pub fn calculate_page_signature(nodes: &[DOMNode]) -> String {
        use sha2::{Digest, Sha256};
        
        let mut hasher = Sha256::new();
        
        // Hash the page structure
        Self::hash_structure(nodes, &mut hasher);
        
        let result = hasher.finalize();
        format!("{:x}", result)[..32].to_string()
    }

    fn hash_structure<D: Digest>(nodes: &[DOMNode], hasher: &mut D) {
        for node in nodes {
            hasher.update(node.tag_name.as_bytes());
            
            // Hash important attributes
            if let Some(id) = node.attributes.get("id") {
                hasher.update(b"id:");
                hasher.update(id.as_bytes());
            }
            
            if let Some(role) = node.attributes.get("role") {
                hasher.update(b"role:");
                hasher.update(role.as_bytes());
            }
            
            Self::hash_structure(&node.children, hasher);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_html() {
        let html = r#"
            <html>
                <body>
                    <nav>
                        <button id="menu">Menu</button>
                    </nav>
                    <main>
                        <h1>Welcome</h1>
                        <button class="btn">Click me</button>
                    </main>
                </body>
            </html>
        "#;

        let nodes = ASTAnalyzer::parse_html(html).unwrap();
        assert!(!nodes.is_empty());
    }

    #[test]
    fn test_find_interactive_elements() {
        let html = r#"
            <div>
                <button>Button 1</button>
                <span>Text</span>
                <a href="#">Link</a>
                <button>Button 2</button>
            </div>
        "#;

        let nodes = ASTAnalyzer::parse_html(html).unwrap();
        let interactive = ASTAnalyzer::find_interactive_elements(&nodes);
        
        assert_eq!(interactive.len(), 3); // 2 buttons + 1 link
    }

    #[test]
    fn test_extract_landmarks() {
        let html = r#"
            <html>
                <body>
                    <nav>Navigation</nav>
                    <main>Main content</main>
                    <footer>Footer</footer>
                </body>
            </html>
        "#;

        let nodes = ASTAnalyzer::parse_html(html).unwrap();
        let landmarks = ASTAnalyzer::extract_landmarks(&nodes);
        
        assert!(landmarks.contains_key("nav"));
        assert!(landmarks.contains_key("main"));
        assert!(landmarks.contains_key("footer"));
    }
}
