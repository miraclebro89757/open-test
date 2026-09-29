///! Visual Similarity Matching Demo
///! 
///! Demonstrates the cosine similarity matching engine with >= 0.95 threshold
///! as specified in the OpenTest whitepaper.

use opentest_semantic_engine::{FingerprintBuilder, SimilarityMatcher};

fn main() {
    println!("=================================================");
    println!("OpenTest Visual Similarity Matching Demo");
    println!("Threshold: >= 0.95 (Whitepaper Specification)");
    println!("=================================================\n");

    // Scenario 1: Exact Match
    demo_exact_match();

    // Scenario 2: Class Name Change (Common Refactoring)
    demo_class_name_change();

    // Scenario 3: ID Change
    demo_id_change();

    // Scenario 4: Text Variation
    demo_text_variation();

    // Scenario 5: No Match (Different Elements)
    demo_no_match();
}

fn demo_exact_match() {
    println!("📋 Scenario 1: Exact Match");
    println!("----------------------------");

    let original = FingerprintBuilder::new("button")
        .with_attribute("id", "submit-btn")
        .with_attribute("class", "btn primary")
        .with_text("Submit Form")
        .with_depth(3)
        .build()
        .unwrap();

    let current = FingerprintBuilder::new("button")
        .with_attribute("id", "submit-btn")
        .with_attribute("class", "btn primary")
        .with_text("Submit Form")
        .with_depth(3)
        .build()
        .unwrap();

    let matcher = SimilarityMatcher::default();
    let similarity = matcher.calculate_similarity(&original, &current);

    println!("Original: {}", original.description());
    println!("Current:  {}", current.description());
    println!("✅ Similarity: {:.4} ({})", similarity, 
        if similarity >= 0.95 { "PASS" } else { "FAIL" });
    println!();
}

fn demo_class_name_change() {
    println!("📋 Scenario 2: Class Name Refactoring");
    println!("---------------------------------------");

    let original = FingerprintBuilder::new("button")
        .with_attribute("class", "btn btn-primary submit-button")
        .with_text("Submit")
        .with_depth(3)
        .build()
        .unwrap();

    // After frontend refactoring
    let refactored = FingerprintBuilder::new("button")
        .with_attribute("class", "button button--primary form-submit")
        .with_text("Submit")
        .with_depth(3)
        .build()
        .unwrap();

    let matcher = SimilarityMatcher::default();
    let similarity = matcher.calculate_similarity(&original, &refactored);

    println!("Before refactor: {}", original.description());
    println!("After refactor:  {}", refactored.description());
    println!("✅ Similarity: {:.4} ({})", similarity,
        if similarity >= 0.95 { "PASS - Auto-healed!" } else { "FAIL" });
    
    if similarity >= 0.95 {
        println!("   🎯 Element successfully located despite class name changes!");
    }
    println!();
}

fn demo_id_change() {
    println!("📋 Scenario 3: ID Attribute Change");
    println!("------------------------------------");

    let original = FingerprintBuilder::new("button")
        .with_attribute("id", "submitBtn")
        .with_attribute("class", "btn")
        .with_text("Submit Form")
        .with_parent("form")
        .with_depth(4)
        .build()
        .unwrap();

    // ID changed but everything else same
    let current = FingerprintBuilder::new("button")
        .with_attribute("id", "form-submit-button")  // Different ID
        .with_attribute("class", "btn")
        .with_text("Submit Form")
        .with_parent("form")
        .with_depth(4)
        .build()
        .unwrap();

    let matcher = SimilarityMatcher::default();
    let similarity = matcher.calculate_similarity(&original, &current);

    println!("Original ID: submitBtn");
    println!("New ID:      form-submit-button");
    println!("✅ Similarity: {:.4} ({})", similarity,
        if similarity >= 0.95 { "PASS - ID-independent matching!" } else { "FAIL" });
    println!();
}

fn demo_text_variation() {
    println!("📋 Scenario 4: Minor Text Variation");
    println!("-------------------------------------");

    let original = FingerprintBuilder::new("button")
        .with_attribute("class", "btn")
        .with_text("Submit Form")
        .build()
        .unwrap();

    // Slightly different text
    let current = FingerprintBuilder::new("button")
        .with_attribute("class", "btn")
        .with_text("Submit the Form")  // "the" added
        .build()
        .unwrap();

    let matcher = SimilarityMatcher::default();
    let similarity = matcher.calculate_similarity(&original, &current);

    println!("Original text: 'Submit Form'");
    println!("Current text:  'Submit the Form'");
    println!("✅ Similarity: {:.4} ({})", similarity,
        if similarity >= 0.90 { "HIGH - Likely same element" } else { "MEDIUM" });
    println!();
}

fn demo_no_match() {
    println!("📋 Scenario 5: Different Elements (No Match)");
    println!("----------------------------------------------");

    let button = FingerprintBuilder::new("button")
        .with_attribute("class", "btn primary")
        .with_text("Submit")
        .build()
        .unwrap();

    let link = FingerprintBuilder::new("a")
        .with_attribute("class", "link")
        .with_text("Cancel")
        .build()
        .unwrap();

    let matcher = SimilarityMatcher::default();
    let similarity = matcher.calculate_similarity(&button, &link);

    println!("Element 1: {}", button.description());
    println!("Element 2: {}", link.description());
    println!("❌ Similarity: {:.4} ({})", similarity,
        if similarity >= 0.95 { "MATCH" } else { "NO MATCH - Correctly rejected" });
    println!();
}
