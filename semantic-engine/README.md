# OpenTest Semantic Engine

**Multi-dimensional Element Fingerprinting for Robust Test Automation**

## Overview

The Semantic Engine solves the fundamental problem in test automation: **brittle CSS selectors**. When frontend code is refactored, class names change, IDs are renamed, and traditional selectors break.

Our solution: **Multi-dimensional fingerprinting + cosine similarity matching (>= 0.95 threshold)**

## Architecture

### 1. Multi-Dimensional Fingerprinting

Each element is identified by **four independent dimensions**:

```rust
ElementFingerprint {
    // 1. Structural: DOM hierarchy, tag, attributes
    structural_hash: "a7f3b8e...",
    tag_name: "button",
    attributes: {"class": "btn", "type": "submit"},
    
    // 2. Semantic: Text content, ARIA, role
    text_content: "Submit Form",
    aria_label: Some("Submit"),
    semantic_score: 0.85,
    
    // 3. Visual: Position, size, colors (from CDP)
    visual_hash: Some("9d2c4a1..."),
    bounding_box: Some(BoundingBox { x: 100, y: 200, ... }),
    
    // 4. Contextual: Parent/sibling relationships
    parent_tag: Some("form"),
    depth: 5,
    
    // Combined 100-dimensional feature vector
    feature_vector: [0.8, 0.9, 0.3, ...]
}
```

### 2. Cosine Similarity Matching

When a selector breaks, we find the element by comparing fingerprints:

```rust
similarity = cosine(target_vector, candidate_vector)

if similarity >= 0.95:  # High confidence match
    return element
```

Weighted combination:
- **40%** - Feature vector similarity
- **30%** - Structural similarity (tag, attributes, hierarchy)
- **20%** - Semantic similarity (text, ARIA, role)
- **10%** - Visual similarity (position, size, style)

### 3. Auto-Healing Locators

```rust
// Before refactoring
locator.original_selector = ".btn.primary"
locator.fingerprint = /* captured during recording */

// After refactoring (class changed)
// Old selector: .btn.primary -> FAILS
// Auto-heal: Find by fingerprint -> SUCCESS (similarity: 0.97)
```

## Usage

### Basic Fingerprinting

```rust
use opentest_semantic_engine::FingerprintBuilder;

let html = r#"<button class="btn primary" id="submit">Submit</button>"#;
let fingerprint = FingerprintBuilder::from_html(html)?;

println!("Tag: {}", fingerprint.tag_name);
println!("Hash: {}", fingerprint.structural_hash);
println!("Semantic score: {}", fingerprint.semantic_score);
```

### AST Analysis

```rust
use opentest_semantic_engine::ASTAnalyzer;

let nodes = ASTAnalyzer::parse_html(page_html)?;

// Find all interactive elements
let buttons = ASTAnalyzer::find_interactive_elements(&nodes);

// Extract landmarks
let landmarks = ASTAnalyzer::extract_landmarks(&nodes);
println!("Found {} navigation elements", landmarks.get("nav").unwrap().len());
```

### Similarity Matching

```rust
use opentest_semantic_engine::SimilarityMatcher;

let matcher = SimilarityMatcher::default(); // threshold = 0.95

// Find element after refactoring
let result = matcher.find_best_match(&original_fingerprint, &current_elements)?;

match result {
    Some(match_result) => {
        println!("Found match with {} confidence", match_result.confidence);
        println!("Similarity: {:.2}%", match_result.similarity_score * 100.0);
    }
    None => println!("No match found above threshold"),
}
```

### Element Locator with Auto-Healing

```rust
use opentest_semantic_engine::ElementLocator;

// Record element during test creation
let locator = ElementLocator::new(
    "submit-button",
    ".btn.primary",
    fingerprint
);

// Later, try to locate (even if class changed)
if let Some(match_result) = locator.locate_with_healing(&page_elements) {
    println!("Element found with similarity: {:.2}", match_result.similarity_score);
    println!("Auto-healed selector: {}", locator.generate_selector());
}
```

## Performance

### Benchmarks

```
Fingerprint generation:    ~50μs per element
Similarity calculation:    ~10μs per comparison
AST parsing (1000 nodes):  ~2ms
Batch matching (100 elems): ~1ms
```

### Memory

```
Per fingerprint:           ~500 bytes
Feature vector (100-dim):  800 bytes
Page AST (1000 nodes):     ~500KB
```

## Advantages Over Traditional Selectors

| Feature | CSS Selectors | XPath | OpenTest Fingerprints |
|---------|--------------|-------|----------------------|
| Survives class name changes | ❌ | ❌ | ✅ |
| Survives ID changes | ❌ | ❌ | ✅ |
| Survives structure refactoring | ❌ | ❌ | ✅ (if similarity >= 0.95) |
| Semantic understanding | ❌ | ❌ | ✅ |
| Visual awareness | ❌ | ❌ | ✅ |
| Auto-healing | ❌ | ❌ | ✅ |

## Real-World Example

### Scenario: Button Class Refactoring

**Before:**
```html
<button class="btn btn-primary submit-button" id="submitForm">
    Submit Form
</button>
```

**CSS Selector:** `.submit-button` ✅ Works

**After Frontend Refactor:**
```html
<button class="button button--primary form-submit" data-testid="form-submit-btn">
    Submit Form
</button>
```

**CSS Selector:** `.submit-button` ❌ Breaks!

**OpenTest:** Fingerprint matching finds it with **0.98 similarity** ✅
- Same tag: `button`
- Same text: "Submit Form"
- Same position/size (visual)
- Same semantic role

## Integration with CDP

```rust
// Enhance fingerprint with visual data from Chrome DevTools Protocol
let mut fingerprint = builder.build()?;

// Get from CDP
let bbox = cdp.get_bounding_box(element_id)?;
let styles = cdp.get_computed_styles(element_id)?;

fingerprint.set_visual_info(bbox, styles);
```

## Future Enhancements

1. **Machine Learning**: Train on historical test data to improve matching
2. **Image Recognition**: Use computer vision for visual matching
3. **Behavioral Fingerprints**: Track user interaction patterns
4. **Cross-Browser Normalization**: Handle browser-specific quirks

## Testing

```bash
cargo test

# Run benchmarks
cargo bench

# With coverage
cargo tarpaulin --out Html
```

## License

Apache 2.0

---

**Whitepaper Reference**: Section 2.2 - "Semantic AST & Vision Engine"
