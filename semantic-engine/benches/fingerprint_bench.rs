use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use opentest_semantic_engine::{FingerprintBuilder, SimilarityMatcher, ASTAnalyzer};

fn bench_fingerprint_creation(c: &mut Criterion) {
    c.bench_function("fingerprint_creation", |b| {
        b.iter(|| {
            FingerprintBuilder::new("button")
                .with_attribute("id", "test-btn")
                .with_attribute("class", "btn primary large")
                .with_text("Click Me")
                .with_depth(5)
                .build()
                .unwrap()
        })
    });
}

fn bench_similarity_calculation(c: &mut Criterion) {
    let fp1 = FingerprintBuilder::new("button")
        .with_attribute("class", "btn primary")
        .with_text("Submit")
        .build()
        .unwrap();

    let fp2 = FingerprintBuilder::new("button")
        .with_attribute("class", "button button-primary")
        .with_text("Submit")
        .build()
        .unwrap();

    let matcher = SimilarityMatcher::default();

    c.bench_function("similarity_calculation", |b| {
        b.iter(|| {
            matcher.calculate_similarity(black_box(&fp1), black_box(&fp2))
        })
    });
}

fn bench_batch_matching(c: &mut Criterion) {
    let target = FingerprintBuilder::new("button")
        .with_attribute("class", "btn primary")
        .with_text("Submit")
        .build()
        .unwrap();

    let mut group = c.benchmark_group("batch_matching");
    
    for size in [10, 50, 100, 500].iter() {
        let candidates: Vec<_> = (0..*size)
            .map(|i| {
                FingerprintBuilder::new("button")
                    .with_attribute("id", &format!("btn-{}", i))
                    .with_text(&format!("Button {}", i))
                    .build()
                    .unwrap()
            })
            .collect();

        group.bench_with_input(BenchmarkId::from_parameter(size), size, |b, _| {
            let matcher = SimilarityMatcher::default();
            b.iter(|| {
                matcher.find_best_match(black_box(&target), black_box(&candidates))
            });
        });
    }
    group.finish();
}

fn bench_ast_parsing(c: &mut Criterion) {
    let html = r#"
        <html>
            <body>
                <nav>
                    <ul>
                        <li><a href="/">Home</a></li>
                        <li><a href="/about">About</a></li>
                    </ul>
                </nav>
                <main>
                    <h1>Welcome</h1>
                    <form>
                        <input type="text" name="username" />
                        <input type="password" name="password" />
                        <button type="submit">Login</button>
                    </form>
                </main>
            </body>
        </html>
    "#;

    c.bench_function("ast_parsing", |b| {
        b.iter(|| {
            ASTAnalyzer::parse_html(black_box(html)).unwrap()
        })
    });
}

fn bench_feature_vector_comparison(c: &mut Criterion) {
    let vec1: Vec<f64> = (0..100).map(|i| (i as f64) / 100.0).collect();
    let vec2: Vec<f64> = (0..100).map(|i| ((i + 5) as f64) / 100.0).collect();

    let matcher = SimilarityMatcher::default();

    c.bench_function("feature_vector_cosine", |b| {
        b.iter(|| {
            matcher.calculate_similarity(
                &dummy_fingerprint_with_vector(vec1.clone()),
                &dummy_fingerprint_with_vector(vec2.clone())
            )
        })
    });
}

fn dummy_fingerprint_with_vector(vec: Vec<f64>) -> opentest_semantic_engine::ElementFingerprint {
    use std::collections::HashMap;
    opentest_semantic_engine::ElementFingerprint {
        tag_name: "div".to_string(),
        structural_hash: "test".to_string(),
        attributes: HashMap::new(),
        class_list: vec![],
        text_content: String::new(),
        aria_label: None,
        role: None,
        semantic_score: 0.5,
        visual_hash: None,
        bounding_box: None,
        computed_styles: HashMap::new(),
        parent_tag: None,
        sibling_count: 0,
        depth: 1,
        feature_vector: vec,
    }
}

criterion_group!(
    benches,
    bench_fingerprint_creation,
    bench_similarity_calculation,
    bench_batch_matching,
    bench_ast_parsing,
    bench_feature_vector_comparison
);
criterion_main!(benches);
