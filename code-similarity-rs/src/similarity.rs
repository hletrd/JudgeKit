use ahash::AHashSet;
use rayon::prelude::*;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use crate::types::{SimilarityPair, Submission};

/// Normalize source code for similarity comparison.
/// Strips comments, whitespace, and string literals.
/// Preserves C/C++ preprocessor directives (#include, #define, etc.).
///
/// This is a deterministic byte scanner — no regex engine needed.
pub fn normalize_source(source: &str) -> String {
    let mut result = String::with_capacity(source.len());
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        // Single-line comment: //
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'/' {
            // Skip until end of line
            while i < len && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }

        // Block comment: /* ... */
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            if i + 1 < len {
                i += 2; // skip */
            }
            continue;
        }

        // # comments: preserve only C preprocessor directives that start a line.
        if bytes[i] == b'#' {
            let is_line_start = i == 0 || bytes[i - 1] == b'\n';
            if !(is_line_start && is_preprocessor_directive(bytes, i)) {
                while i < len && bytes[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
        }

        // Double-quoted string literals: replace contents with empty
        if bytes[i] == b'"' {
            result.push('"');
            i += 1;
            while i < len && bytes[i] != b'"' {
                // Handle escaped quotes
                if bytes[i] == b'\\' && i + 1 < len {
                    i += 2;
                    continue;
                }
                i += 1;
            }
            if i < len {
                result.push('"');
                i += 1; // skip closing "
            }
            continue;
        }

        // Single-quoted string literals: replace contents with empty
        if bytes[i] == b'\'' {
            result.push('\'');
            i += 1;
            while i < len && bytes[i] != b'\'' {
                if bytes[i] == b'\\' && i + 1 < len {
                    i += 2;
                    continue;
                }
                i += 1;
            }
            if i < len {
                result.push('\'');
                i += 1; // skip closing '
            }
            continue;
        }

        // Whitespace: collapse to single space
        if bytes[i].is_ascii_whitespace() {
            if !result.ends_with(' ') && !result.is_empty() {
                result.push(' ');
            }
            i += 1;
            while i < len && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            continue;
        }

        // Normal character: preserve identifier casing for case-sensitive languages.
        result.push(bytes[i] as char);
        i += 1;
    }

    // Trim trailing space
    if result.ends_with(' ') {
        result.pop();
    }

    result
}

const SIMILARITY_KEYWORDS: &[&str] = &[
    "and",
    "as",
    "asm",
    "auto",
    "await",
    "bool",
    "break",
    "case",
    "catch",
    "char",
    "class",
    "const",
    "constexpr",
    "continue",
    "crate",
    "default",
    "def",
    "define",
    "delete",
    "do",
    "double",
    "elif",
    "else",
    "endif",
    "enum",
    "error",
    "except",
    "export",
    "extends",
    "extern",
    "false",
    "final",
    "finally",
    "float",
    "fn",
    "for",
    "friend",
    "from",
    "goto",
    "if",
    "ifdef",
    "ifndef",
    "impl",
    "import",
    "include",
    "inline",
    "in",
    "int",
    "interface",
    "let",
    "long",
    "macro_rules",
    "match",
    "mod",
    "module",
    "mut",
    "namespace",
    "new",
    "None",
    "not",
    "null",
    "operator",
    "or",
    "package",
    "pragma",
    "private",
    "protected",
    "pub",
    "public",
    "register",
    "restrict",
    "return",
    "self",
    "Self",
    "short",
    "signed",
    "sizeof",
    "static",
    "struct",
    "super",
    "switch",
    "template",
    "this",
    "throw",
    "trait",
    "true",
    "try",
    "type",
    "typedef",
    "typename",
    "undef",
    "union",
    "unsafe",
    "unsigned",
    "use",
    "using",
    "var",
    "virtual",
    "void",
    "volatile",
    "warning",
    "where",
    "while",
    "yield",
];

fn is_identifier_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_'
}

fn is_identifier_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

pub fn normalize_identifiers_for_similarity(source: &str) -> String {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut result = String::with_capacity(source.len());
    let mut next_placeholder_id = 1usize;
    let mut identifiers = HashMap::<String, String>::new();

    while i < len {
        if !is_identifier_start(bytes[i]) {
            result.push(bytes[i] as char);
            i += 1;
            continue;
        }

        let start = i;
        i += 1;
        while i < len && is_identifier_char(bytes[i]) {
            i += 1;
        }

        let token = &source[start..i];
        if SIMILARITY_KEYWORDS.contains(&token) {
            result.push_str(token);
            continue;
        }

        let replacement = identifiers.entry(token.to_string()).or_insert_with(|| {
            let placeholder = format!("v{}", next_placeholder_id);
            next_placeholder_id += 1;
            placeholder
        });
        result.push_str(replacement);
    }

    result
}

/// Check if a # at position `pos` starts a C preprocessor directive.
fn is_preprocessor_directive(bytes: &[u8], pos: usize) -> bool {
    let rest = &bytes[pos + 1..]; // skip the #
    let directives: &[&[u8]] = &[
        b"include", b"define", b"pragma", b"ifdef", b"ifndef", b"endif", b"else", b"elif",
        b"undef", b"if ", b"error", b"warning",
    ];
    for d in directives {
        if rest.len() >= d.len() && &rest[..d.len()] == *d {
            return true;
        }
    }
    false
}

/// Generate n-grams from text, hashing each n-gram to u64 for speed.
/// Tokens are split on whitespace (matching the TS implementation).
pub fn generate_ngrams(text: &str, n: usize) -> AHashSet<u64> {
    let tokens: Vec<&str> = text.split_whitespace().collect();
    if tokens.len() < n {
        return AHashSet::new();
    }

    let mut set = AHashSet::with_capacity(tokens.len().saturating_sub(n) + 1);
    for window in tokens.windows(n) {
        let h = hash_ngram(window);
        set.insert(h);
    }
    set
}

/// Hash an n-gram (slice of tokens) to u64 using AHash.
fn hash_ngram(tokens: &[&str]) -> u64 {
    let mut hasher = ahash::AHasher::default();
    for (idx, token) in tokens.iter().enumerate() {
        if idx > 0 {
            b' '.hash(&mut hasher);
        }
        token.hash(&mut hasher);
    }
    hasher.finish()
}

/// Compute Jaccard similarity between two sets of u64 hashes.
pub fn jaccard_similarity(a: &AHashSet<u64>, b: &AHashSet<u64>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 0.0;
    }

    // Iterate over the smaller set for efficiency
    let (smaller, larger) = if a.len() <= b.len() { (a, b) } else { (b, a) };

    let intersection = smaller.iter().filter(|x| larger.contains(x)).count();
    let union = a.len() + b.len() - intersection;

    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

/// Compute similarity pairs across all submissions, grouped by (problem, language).
/// Cross-language pairs are never compared, reducing false positives.
/// Uses rayon for parallel pairwise comparison within each group.
pub fn compute_similarity(
    submissions: Vec<Submission>,
    threshold: f64,
    ngram_size: usize,
) -> Vec<SimilarityPair> {
    // Group by (problem_id, language) so cross-language pairs are never compared
    let mut by_key: HashMap<(String, String), Vec<Submission>> = HashMap::new();
    for sub in submissions {
        by_key
            .entry((sub.problem_id.clone(), sub.language.clone()))
            .or_default()
            .push(sub);
    }

    // Process each group in parallel
    let groups: Vec<((String, String), Vec<Submission>)> = by_key.into_iter().collect();

    groups
        .par_iter()
        .flat_map(|((problem_id, language), subs)| {
            // Pre-compute normalized n-grams for each submission
            let ngrams: Vec<(&str, AHashSet<u64>)> = subs
                .iter()
                .map(|s| {
                    let normalized =
                        normalize_identifiers_for_similarity(&normalize_source(&s.source_code));
                    let ng = generate_ngrams(&normalized, ngram_size);
                    (s.user_id.as_str(), ng)
                })
                .collect();

            let mut pairs = Vec::new();

            // Pairwise comparison
            for i in 0..ngrams.len() {
                for j in (i + 1)..ngrams.len() {
                    let sim = jaccard_similarity(&ngrams[i].1, &ngrams[j].1);
                    if sim >= threshold {
                        pairs.push(SimilarityPair {
                            user_id_1: ngrams[i].0.to_string(),
                            user_id_2: ngrams[j].0.to_string(),
                            problem_id: problem_id.clone(),
                            language: language.clone(),
                            similarity: (sim * 1000.0).round() / 1000.0,
                        });
                    }
                }
            }

            pairs
        })
        .collect()
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -------------------------------------------------------------------------
    // normalize_source tests — matching TS test cases
    // -------------------------------------------------------------------------

    #[test]
    fn strips_single_line_comments() {
        let src = "int x = 1; // this is a comment\nint y = 2;";
        let result = normalize_source(src);
        assert!(!result.contains("this is a comment"));
    }

    #[test]
    fn strips_block_comments() {
        let src = "int x; /* block\ncomment */ int y;";
        let result = normalize_source(src);
        assert!(!result.contains("block"));
        assert!(!result.contains("comment"));
    }

    #[test]
    fn strips_hash_comments() {
        let src = "x = 1\n# this is a python comment\ny = 2";
        let result = normalize_source(src);
        assert!(!result.contains("this is a python comment"));
    }

    #[test]
    fn preserves_preprocessor_directives() {
        let directives = [
            ("#include <stdio.h>", "#include"),
            ("#define MAX 100", "#define"),
            ("#pragma once", "#pragma"),
            ("#ifdef DEBUG", "#ifdef"),
            ("#ifndef HEADER", "#ifndef"),
            ("#endif", "#endif"),
        ];
        for (directive, keyword) in &directives {
            let result = normalize_source(directive);
            assert!(
                result.contains(keyword),
                "Expected '{}' to contain '{}', got '{}'",
                directive,
                keyword,
                result
            );
        }
    }

    #[test]
    fn collapses_whitespace() {
        let src = "int   x   =   1;";
        let result = normalize_source(src);
        assert!(
            !result.contains("  "),
            "Should not have consecutive spaces: '{}'",
            result
        );
    }

    #[test]
    fn preserves_identifier_casing() {
        let src = "INT X = HELLO;";
        let result = normalize_source(src);
        assert_eq!(result, "INT X = HELLO;");
    }

    #[test]
    fn normalizes_renamed_identifiers_to_the_same_placeholder_stream() {
        let left = normalize_identifiers_for_similarity(&normalize_source(
            "int total = left + right; return total;",
        ));
        let right = normalize_identifiers_for_similarity(&normalize_source(
            "int answer = alpha + beta; return answer;",
        ));

        assert_eq!(left, "int v1 = v2 + v3; return v1;");
        assert_eq!(right, left);
    }

    #[test]
    fn preserves_keywords_and_preprocessor_directives_when_normalizing_identifiers() {
        let normalized = normalize_identifiers_for_similarity(&normalize_source(
            "#include <stdio.h>
for (int i = 0; i < n; i++) return value;",
        ));

        assert!(normalized.contains("#include"));
        assert!(normalized.contains("for"));
        assert!(normalized.contains("int"));
        assert!(normalized.contains("return"));
    }

    #[test]
    fn replaces_string_literals() {
        let src = r#"printf("hello world");"#;
        let result = normalize_source(src);
        assert!(!result.contains("hello world"));
        assert!(result.contains("\"\""));
    }

    // -------------------------------------------------------------------------
    // jaccard_similarity tests — matching TS test cases
    // -------------------------------------------------------------------------

    fn str_set(items: &[&str]) -> AHashSet<u64> {
        items
            .iter()
            .map(|s| {
                let mut hasher = ahash::AHasher::default();
                s.hash(&mut hasher);
                hasher.finish()
            })
            .collect()
    }

    #[test]
    fn identical_sets_return_one() {
        let a = str_set(&["foo bar", "bar baz", "baz qux"]);
        let b = str_set(&["foo bar", "bar baz", "baz qux"]);
        assert_eq!(jaccard_similarity(&a, &b), 1.0);
    }

    #[test]
    fn disjoint_sets_return_zero() {
        let a = str_set(&["alpha beta", "beta gamma"]);
        let b = str_set(&["delta epsilon", "epsilon zeta"]);
        assert_eq!(jaccard_similarity(&a, &b), 0.0);
    }

    #[test]
    fn empty_sets_return_zero() {
        let a: AHashSet<u64> = AHashSet::new();
        let b: AHashSet<u64> = AHashSet::new();
        assert_eq!(jaccard_similarity(&a, &b), 0.0);
    }

    #[test]
    fn partial_overlap_between_zero_and_one() {
        let a = str_set(&["a b", "b c", "c d"]);
        let b = str_set(&["b c", "c d", "d e"]);
        let sim = jaccard_similarity(&a, &b);
        assert!(sim > 0.0);
        assert!(sim < 1.0);
    }

    #[test]
    fn symmetry() {
        let a = str_set(&["x y", "y z", "z w"]);
        let b = str_set(&["y z", "z w", "w v", "v u"]);
        assert_eq!(jaccard_similarity(&a, &b), jaccard_similarity(&b, &a));
    }

    #[test]
    fn known_overlap_value() {
        // intersection = 1 element, union = 3 elements => 1/3
        let a = str_set(&["a b", "b c"]);
        let b = str_set(&["b c", "c d"]);
        let sim = jaccard_similarity(&a, &b);
        assert!((sim - 1.0 / 3.0).abs() < 1e-10);
    }

    // -------------------------------------------------------------------------
    // compute_similarity end-to-end test
    // -------------------------------------------------------------------------

    #[test]
    fn compute_similarity_finds_identical_submissions() {
        let submissions = vec![
            Submission {
                user_id: "user1".to_string(),
                problem_id: "prob1".to_string(),
                language: "cpp".to_string(),
                source_code: "int main() { return 0; }".to_string(),
            },
            Submission {
                user_id: "user2".to_string(),
                problem_id: "prob1".to_string(),
                language: "cpp".to_string(),
                source_code: "int main() { return 0; }".to_string(),
            },
            Submission {
                user_id: "user3".to_string(),
                problem_id: "prob1".to_string(),
                language: "cpp".to_string(),
                source_code:
                    "completely different code with no overlap whatsoever unique tokens here"
                        .to_string(),
            },
        ];

        let pairs = compute_similarity(submissions, 0.85, 3);
        // user1 and user2 should be flagged (identical code)
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].similarity, 1.0);
    }

    #[test]
    fn compute_similarity_groups_by_problem() {
        let submissions = vec![
            Submission {
                user_id: "user1".to_string(),
                problem_id: "prob1".to_string(),
                language: "cpp".to_string(),
                source_code: "int main() { return 0; }".to_string(),
            },
            Submission {
                user_id: "user2".to_string(),
                problem_id: "prob2".to_string(),
                language: "cpp".to_string(),
                source_code: "int main() { return 0; }".to_string(),
            },
        ];

        let pairs = compute_similarity(submissions, 0.85, 3);
        // Different problems — should not be compared
        assert!(pairs.is_empty());
    }

    // -------------------------------------------------------------------------
    // Cross-validation: Rust normalize_source matches TS normalizeSource
    // -------------------------------------------------------------------------

    #[test]
    fn cross_validate_normalize_with_ts_expected_outputs() {
        let cases = vec![
            ("int x = 1; // comment\nint y = 2;", "int x = 1; int y = 2;"),
            ("int x; /* block\ncomment */ int y;", "int x; int y;"),
            ("x = 1\n# python comment\ny = 2", "x = 1 y = 2"),
            ("INT X = HELLO;", "INT X = HELLO;"),
            ("int   x   =   1;", "int x = 1;"),
        ];

        for (input, expected) in cases {
            let result = normalize_source(input);
            assert_eq!(result, expected, "Failed for input: {:?}", input);
        }
    }

    // -------------------------------------------------------------------------
    // normalize_source — edge cases for 100% coverage
    // -------------------------------------------------------------------------

    #[test]
    fn normalize_empty_input() {
        assert_eq!(normalize_source(""), "");
    }

    #[test]
    fn normalize_only_whitespace() {
        assert_eq!(normalize_source("   \n\t  "), "");
    }

    #[test]
    fn normalize_only_comments() {
        assert_eq!(normalize_source("// just a comment"), "");
        assert_eq!(normalize_source("/* block only */"), "");
    }

    #[test]
    fn normalize_escaped_quotes_in_strings() {
        let src = r#"char *s = "hello \"world\"";"#;
        let result = normalize_source(src);
        assert!(!result.contains("hello"));
        assert!(!result.contains("world"));
        assert!(result.contains("\"\""));
    }

    #[test]
    fn normalize_single_quoted_strings() {
        let src = "char c = 'x';";
        let result = normalize_source(src);
        assert!(!result.contains("x"));
        assert!(result.contains("''"));
    }

    #[test]
    fn normalize_escaped_single_quotes() {
        let src = r"char c = '\'';";
        let result = normalize_source(src);
        assert!(result.contains("''"));
    }

    #[test]
    fn normalize_unterminated_block_comment() {
        // Gracefully handle unterminated block comment
        let src = "int x; /* never closed";
        let result = normalize_source(src);
        assert!(result.contains("int x;"));
    }

    #[test]
    fn normalize_unterminated_double_quote() {
        // Unterminated string: opening quote emitted, content stripped, no closing quote
        let src = "char *s = \"unterminated";
        let result = normalize_source(src);
        assert!(!result.contains("unterminated"));
        assert!(result.contains("char"));
    }

    #[test]
    fn normalize_unterminated_single_quote() {
        let src = "char c = 'unterminated";
        let result = normalize_source(src);
        assert!(!result.contains("unterminated"));
        assert!(result.contains("char"));
    }

    #[test]
    fn normalize_hash_not_at_line_start() {
        let src = "x = a # inline comment";
        let result = normalize_source(src);
        assert_eq!(result, "x = a");
    }

    #[test]
    fn normalize_mixed_comment_styles() {
        let src = "a = 1; // line\nb = 2; /* block */ c = 3;\n# py comment\nd = 4;";
        let result = normalize_source(src);
        assert_eq!(result, "a = 1; b = 2; c = 3; d = 4;");
    }

    #[test]
    fn normalize_adjacent_strings() {
        let src = r#""hello" "world""#;
        let result = normalize_source(src);
        assert_eq!(result, "\"\" \"\"");
    }

    #[test]
    fn normalize_preserves_all_preprocessor_types() {
        // Test the remaining preprocessor directives
        let cases = [
            "#else",
            "#elif",
            "#undef FOO",
            "#if 1",
            "#error msg",
            "#warning msg",
        ];
        for directive in &cases {
            let result = normalize_source(directive);
            let keyword = directive.split_whitespace().next().unwrap();
            assert!(
                result.contains(keyword),
                "Directive '{}' lost keyword '{}', got '{}'",
                directive,
                keyword,
                result
            );
        }
    }

    #[test]
    fn normalize_comment_at_end_of_file_no_newline() {
        let src = "x = 1; // trailing";
        let result = normalize_source(src);
        assert_eq!(result, "x = 1;");
    }

    #[test]
    fn normalize_block_comment_with_stars() {
        let src = "a; /*** fancy ***/ b;";
        let result = normalize_source(src);
        assert_eq!(result, "a; b;");
    }

    // -------------------------------------------------------------------------
    // generate_ngrams — edge cases
    // -------------------------------------------------------------------------

    #[test]
    fn ngrams_empty_text() {
        let result = generate_ngrams("", 3);
        assert!(result.is_empty());
    }

    #[test]
    fn ngrams_text_shorter_than_n() {
        let result = generate_ngrams("one two", 3);
        assert!(result.is_empty());
    }

    #[test]
    fn ngrams_text_exactly_n_tokens() {
        let result = generate_ngrams("a b c", 3);
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn ngrams_unigrams() {
        let result = generate_ngrams("a b c d", 1);
        assert_eq!(result.len(), 4);
    }

    #[test]
    fn ngrams_with_extra_whitespace() {
        // split_whitespace handles multiple spaces
        let result = generate_ngrams("a   b   c", 2);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn ngrams_duplicate_windows() {
        // "a b a b" with n=2 has windows: "a b", "b a", "a b" — but set deduplicates
        let result = generate_ngrams("a b a b", 2);
        assert_eq!(result.len(), 2); // "a b" and "b a"
    }

    // -------------------------------------------------------------------------
    // jaccard_similarity — edge cases
    // -------------------------------------------------------------------------

    #[test]
    fn jaccard_one_empty_one_nonempty() {
        let a: AHashSet<u64> = AHashSet::new();
        let b = str_set(&["x"]);
        assert_eq!(jaccard_similarity(&a, &b), 0.0);
        assert_eq!(jaccard_similarity(&b, &a), 0.0);
    }

    #[test]
    fn jaccard_single_element_identical() {
        let a = str_set(&["only"]);
        let b = str_set(&["only"]);
        assert_eq!(jaccard_similarity(&a, &b), 1.0);
    }

    #[test]
    fn jaccard_superset() {
        let a = str_set(&["x", "y"]);
        let b = str_set(&["x", "y", "z"]);
        let sim = jaccard_similarity(&a, &b);
        assert!((sim - 2.0 / 3.0).abs() < 1e-10);
    }

    // -------------------------------------------------------------------------
    // compute_similarity — edge cases
    // -------------------------------------------------------------------------

    #[test]
    fn compute_similarity_empty_submissions() {
        let pairs = compute_similarity(vec![], 0.85, 3);
        assert!(pairs.is_empty());
    }

    #[test]
    fn compute_similarity_single_submission() {
        let submissions = vec![Submission {
            user_id: "user1".to_string(),
            problem_id: "prob1".to_string(),
            language: "cpp".to_string(),
            source_code: "int main() {}".to_string(),
        }];
        let pairs = compute_similarity(submissions, 0.85, 3);
        assert!(pairs.is_empty());
    }

    #[test]
    fn compute_similarity_below_threshold() {
        let submissions = vec![
            Submission {
                user_id: "user1".to_string(),
                problem_id: "prob1".to_string(),
                language: "cpp".to_string(),
                source_code: "int solve() { int total = left + right; return total; }".to_string(),
            },
            Submission {
                user_id: "user2".to_string(),
                problem_id: "prob1".to_string(),
                language: "cpp".to_string(),
                source_code: "while (value < limit) { value--; }".to_string(),
            },
        ];
        let pairs = compute_similarity(submissions, 0.85, 3);
        assert!(pairs.is_empty());
    }

    #[test]
    fn compute_similarity_multiple_problems_with_pairs() {
        let submissions = vec![
            Submission {
                user_id: "u1".to_string(),
                problem_id: "p1".to_string(),
                language: "cpp".to_string(),
                source_code: "int main() { return 0; }".to_string(),
            },
            Submission {
                user_id: "u2".to_string(),
                problem_id: "p1".to_string(),
                language: "cpp".to_string(),
                source_code: "int main() { return 0; }".to_string(),
            },
            Submission {
                user_id: "u3".to_string(),
                problem_id: "p2".to_string(),
                language: "cpp".to_string(),
                source_code: "void foo() { bar(); }".to_string(),
            },
            Submission {
                user_id: "u4".to_string(),
                problem_id: "p2".to_string(),
                language: "cpp".to_string(),
                source_code: "void foo() { bar(); }".to_string(),
            },
        ];
        let pairs = compute_similarity(submissions, 0.85, 3);
        assert_eq!(pairs.len(), 2);
        // Verify pairs are within their own problem groups
        for pair in &pairs {
            assert_ne!(pair.problem_id, ""); // has a problem_id
            if pair.problem_id == "p1" {
                assert!(
                    (pair.user_id_1 == "u1" && pair.user_id_2 == "u2")
                        || (pair.user_id_1 == "u2" && pair.user_id_2 == "u1")
                );
            } else {
                assert!(
                    (pair.user_id_1 == "u3" && pair.user_id_2 == "u4")
                        || (pair.user_id_1 == "u4" && pair.user_id_2 == "u3")
                );
            }
        }
    }

    #[test]
    fn compute_similarity_rounds_to_three_decimals() {
        // Two submissions with partial but high similarity
        let submissions = vec![
            Submission {
                user_id: "u1".to_string(),
                problem_id: "p1".to_string(),
                language: "cpp".to_string(),
                source_code: "a b c d e f g h i j k".to_string(),
            },
            Submission {
                user_id: "u2".to_string(),
                problem_id: "p1".to_string(),
                language: "cpp".to_string(),
                source_code: "a b c d e f g h i j k l".to_string(),
            },
        ];
        let pairs = compute_similarity(submissions, 0.0, 3);
        if !pairs.is_empty() {
            let sim_str = format!("{}", pairs[0].similarity);
            // At most 3 decimal places
            if let Some(dot_pos) = sim_str.find('.') {
                assert!(sim_str.len() - dot_pos - 1 <= 3);
            }
        }
    }

    #[test]
    fn compute_similarity_strips_comments_before_comparing() {
        // Same code but with different comments — should still match
        let submissions = vec![
            Submission {
                user_id: "u1".to_string(),
                problem_id: "p1".to_string(),
                language: "cpp".to_string(),
                source_code: "int main() { return 0; } // author: alice".to_string(),
            },
            Submission {
                user_id: "u2".to_string(),
                problem_id: "p1".to_string(),
                language: "cpp".to_string(),
                source_code: "int main() { return 0; } // author: bob".to_string(),
            },
        ];
        let pairs = compute_similarity(submissions, 0.85, 3);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].similarity, 1.0);
    }
}
