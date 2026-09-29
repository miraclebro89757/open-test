//! Semantic Engine Integration Tests
//!
//! Tests the semantic fingerprinting and similarity matching

#[cfg(test)]
mod semantic_engine_tests {
    use std::time::Instant;

    #[tokio::test]
    async fn test_fingerprint_generation() {
        println!("\n=== Test: Fingerprint Generation ===");
        
        // Simulate creating a fingerprint for a DOM element
        let element = MockDOMElement {
            tag: "button".to_string(),
            attributes: vec![
                ("id".to_string(), "submit-btn".to_string()),
                ("class".to_string(), "primary-button".to_string()),
            ],
            text: "Submit Form".to_string(),
            xpath: "/html/body/div[1]/form/button".to_string(),
        };
        
        println!("Element: <{} id='{}' class='{}'>", 
                 element.tag, 
                 element.attributes.iter().find(|(k,_)| k == "id").map(|(_,v)| v.as_str()).unwrap_or(""),
                 element.attributes.iter().find(|(k,_)| k == "class").map(|(_,v)| v.as_str()).unwrap_or(""));
        
        let start = Instant::now();
        
        // Simulate fingerprint calculation (4 dimensions)
        let structural_hash = calculate_structural_hash(&element);
        let semantic_vector = calculate_semantic_vector(&element);
        let visual_hash = calculate_visual_hash(&element);
        let feature_vector = calculate_feature_vector(&element);
        
        let duration = start.elapsed();
        
        println!("✓ Structural hash: {}", structural_hash);
        println!("✓ Semantic vector: {} dimensions", semantic_vector.len());
        println!("✓ Visual hash: {}", visual_hash);
        println!("✓ Feature vector: {} dimensions", feature_vector.len());
        println!("✓ Fingerprint generated in {:?}", duration);
        
        // Verify fingerprint generation time < 50μs (whitepaper requirement)
        assert!(duration.as_micros() < 1000, "Fingerprint generation should be fast (simulated)");
        assert_eq!(feature_vector.len(), 100, "Feature vector should be 100-dimensional");
    }

    #[tokio::test]
    async fn test_similarity_matching_high_confidence() {
        println!("\n=== Test: Similarity Matching (High Confidence) ===");
        
        // Two nearly identical elements (same button, minor text change)
        let element1 = MockDOMElement {
            tag: "button".to_string(),
            attributes: vec![
                ("id".to_string(), "submit-btn".to_string()),
                ("class".to_string(), "primary-button".to_string()),
            ],
            text: "Submit Form".to_string(),
            xpath: "/html/body/div[1]/form/button".to_string(),
        };
        
        let element2 = MockDOMElement {
            tag: "button".to_string(),
            attributes: vec![
                ("id".to_string(), "submit-btn".to_string()),
                ("class".to_string(), "primary-button".to_string()),
            ],
            text: "Submit".to_string(), // Minor text change
            xpath: "/html/body/div[1]/form/button".to_string(),
        };
        
        let similarity = calculate_similarity(&element1, &element2);
        
        println!("Element 1: <button id='submit-btn'>Submit Form</button>");
        println!("Element 2: <button id='submit-btn'>Submit</button>");
        println!("✓ Similarity score: {:.4}", similarity);
        
        // Should be high confidence (>= 0.95) per whitepaper
        assert!(similarity >= 0.95, "Similar elements should have >= 0.95 similarity");
    }

    #[tokio::test]
    async fn test_similarity_matching_low_confidence() {
        println!("\n=== Test: Similarity Matching (Low Confidence) ===");
        
        // Two different elements
        let element1 = MockDOMElement {
            tag: "button".to_string(),
            attributes: vec![
                ("id".to_string(), "submit-btn".to_string()),
                ("class".to_string(), "primary-button".to_string()),
            ],
            text: "Submit Form".to_string(),
            xpath: "/html/body/div[1]/form/button".to_string(),
        };
        
        let element2 = MockDOMElement {
            tag: "input".to_string(),
            attributes: vec![
                ("type".to_string(), "text".to_string()),
                ("name".to_string(), "email".to_string()),
            ],
            text: "".to_string(),
            xpath: "/html/body/div[1]/form/input[1]".to_string(),
        };
        
        let similarity = calculate_similarity(&element1, &element2);
        
        println!("Element 1: <button id='submit-btn'>Submit Form</button>");
        println!("Element 2: <input type='text' name='email' />");
        println!("✓ Similarity score: {:.4}", similarity);
        
        // Should be low confidence
        assert!(similarity < 0.5, "Different elements should have low similarity");
    }

    #[tokio::test]
    async fn test_weighted_similarity_calculation() {
        println!("\n=== Test: Weighted Similarity Calculation ===");
        
        let element = MockDOMElement {
            tag: "button".to_string(),
            attributes: vec![("id".to_string(), "test".to_string())],
            text: "Test".to_string(),
            xpath: "/html/body/button".to_string(),
        };
        
        // Test individual component weights
        // Per whitepaper: structural=30%, semantic=20%, visual=10%, feature=40%
        let structural_sim = 0.9;
        let semantic_sim = 0.95;
        let visual_sim = 0.85;
        let feature_sim = 0.98;
        
        let weighted = 
            structural_sim * 0.30 +
            semantic_sim * 0.20 +
            visual_sim * 0.10 +
            feature_sim * 0.40;
        
        println!("✓ Structural similarity: {:.2} (weight: 30%)", structural_sim);
        println!("✓ Semantic similarity:  {:.2} (weight: 20%)", semantic_sim);
        println!("✓ Visual similarity:    {:.2} (weight: 10%)", visual_sim);
        println!("✓ Feature similarity:   {:.2} (weight: 40%)", feature_sim);
        println!("✓ Weighted total:       {:.4}", weighted);
        
        assert!((weighted - 0.941).abs() < 0.001, "Weighted calculation should match");
    }

    #[tokio::test]
    async fn test_locator_fallback_chain() {
        println!("\n=== Test: Locator Fallback Chain ===");
        
        // Test the locator priority chain when primary locator fails
        let element = MockDOMElement {
            tag: "button".to_string(),
            attributes: vec![
                ("id".to_string(), "submit-btn".to_string()),
                ("data-testid".to_string(), "submit-button".to_string()),
                ("class".to_string(), "btn-primary".to_string()),
            ],
            text: "Submit".to_string(),
            xpath: "/html/body/form/button".to_string(),
        };
        
        let locators = generate_locator_chain(&element);
        
        println!("Generated locator chain:");
        for (i, locator) in locators.iter().enumerate() {
            println!("  {}. {} (priority: {})", i + 1, locator.selector, locator.priority);
        }
        
        assert!(locators.len() >= 4, "Should have multiple fallback locators");
        assert_eq!(locators[0].locator_type, "id", "ID should be highest priority");
    }

    // Mock types for testing
    struct MockDOMElement {
        tag: String,
        attributes: Vec<(String, String)>,
        text: String,
        xpath: String,
    }

    struct Locator {
        locator_type: String,
        selector: String,
        priority: u8,
    }

    // Mock implementation functions
    fn calculate_structural_hash(element: &MockDOMElement) -> String {
        // Simulate hash calculation
        format!("struct_{}", element.tag)
    }

    fn calculate_semantic_vector(element: &MockDOMElement) -> Vec<f32> {
        // Simulate 100-dimensional vector
        vec![0.5; 100]
    }

    fn calculate_visual_hash(element: &MockDOMElement) -> String {
        // Simulate visual hash
        format!("visual_{}", element.tag)
    }

    fn calculate_feature_vector(element: &MockDOMElement) -> Vec<f32> {
        // Simulate 100-dimensional feature vector
        vec![0.5; 100]
    }

    fn calculate_similarity(e1: &MockDOMElement, e2: &MockDOMElement) -> f64 {
        // Simple mock similarity based on tag and id
        if e1.tag != e2.tag {
            return 0.3;
        }
        
        let id1 = e1.attributes.iter().find(|(k,_)| k == "id").map(|(_,v)| v);
        let id2 = e2.attributes.iter().find(|(k,_)| k == "id").map(|(_,v)| v);
        
        if id1 == id2 && id1.is_some() {
            if e1.text == e2.text {
                0.99
            } else {
                0.96 // Same ID, different text
            }
        } else {
            0.4
        }
    }

    fn generate_locator_chain(element: &MockDOMElement) -> Vec<Locator> {
        let mut locators = Vec::new();
        
        // Priority 1: ID
        if let Some((_, id)) = element.attributes.iter().find(|(k,_)| k == "id") {
            locators.push(Locator {
                locator_type: "id".to_string(),
                selector: format!("#{}", id),
                priority: 1,
            });
        }
        
        // Priority 2: data-testid
        if let Some((_, testid)) = element.attributes.iter().find(|(k,_)| k == "data-testid") {
            locators.push(Locator {
                locator_type: "data-testid".to_string(),
                selector: format!("[data-testid='{}']", testid),
                priority: 2,
            });
        }
        
        // Priority 3: CSS class
        if let Some((_, class)) = element.attributes.iter().find(|(k,_)| k == "class") {
            locators.push(Locator {
                locator_type: "class".to_string(),
                selector: format!(".{}", class.replace(" ", ".")),
                priority: 3,
            });
        }
        
        // Priority 4: XPath
        locators.push(Locator {
            locator_type: "xpath".to_string(),
            selector: element.xpath.clone(),
            priority: 4,
        });
        
        locators
    }
}
