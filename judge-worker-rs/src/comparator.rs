use memchr::memchr;

/// Trim trailing ASCII whitespace (space, tab, carriage return) from a byte slice.
/// Returns a subslice with no heap allocation.
#[inline]
fn trim_end(line: &[u8]) -> &[u8] {
    let mut end = line.len();
    while end > 0 && matches!(line[end - 1], b' ' | b'\t' | b'\r') {
        end -= 1;
    }
    &line[..end]
}

/// Iterator that yields lines (without the trailing `\n`) from a byte slice.
/// Works with both `\n` and `\r\n` line endings; the `\r` is left in and
/// stripped by `trim_end` during comparison so behavior matches TypeScript's
/// `trimEnd()`.
struct Lines<'a> {
    remaining: &'a [u8],
    done: bool,
}

impl<'a> Lines<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { remaining: data, done: false }
    }
}

impl<'a> Iterator for Lines<'a> {
    type Item = &'a [u8];

    fn next(&mut self) -> Option<Self::Item> {
        if self.done {
            return None;
        }
        match memchr(b'\n', self.remaining) {
            Some(pos) => {
                let line = &self.remaining[..pos];
                self.remaining = &self.remaining[pos + 1..];
                Some(line)
            }
            None => {
                // Last line (no trailing newline)
                self.done = true;
                Some(self.remaining)
            }
        }
    }
}

/// Compare two judge outputs using the same normalization as the TypeScript
/// reference implementation:
///
/// ```text
/// normalize(s) = s.split("\n")
///                 .map(line => line.trimEnd())
///                 .join("\n")
///                 .trim()
/// ```
///
/// The outer `.trim()` means leading *and* trailing blank lines are ignored
/// globally, but only trailing whitespace is removed per-line (leading
/// whitespace on a line is preserved).
///
/// This implementation mirrors the documented normalization directly so
/// boundary spaces and tabs are treated the same as JavaScript `.trim()`.
pub fn compare_output(expected: &[u8], actual: &[u8]) -> bool {
    normalize_exact_output(expected) == normalize_exact_output(actual)
}

#[inline]
fn is_ascii_trim_byte(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\r' | b'\n')
}

fn normalize_exact_output(data: &[u8]) -> Vec<u8> {
    let mut normalized = Vec::with_capacity(data.len());

    for (index, line) in Lines::new(data).map(trim_end).enumerate() {
        if index > 0 {
            normalized.push(b'\n');
        }
        normalized.extend_from_slice(line);
    }

    let start = normalized
        .iter()
        .position(|byte| !is_ascii_trim_byte(*byte))
        .unwrap_or(normalized.len());
    let end = normalized
        .iter()
        .rposition(|byte| !is_ascii_trim_byte(*byte))
        .map(|index| index + 1)
        .unwrap_or(start);

    normalized[start..end].to_vec()
}

/// Compare outputs using floating-point tolerance.
///
/// Tokens are compared pairwise. If both tokens parse as f64, they are
/// considered equal if EITHER the absolute error OR relative error is
/// within the given tolerances. Non-numeric tokens are compared exactly.
pub fn compare_float_output(
    expected: &[u8],
    actual: &[u8],
    abs_error: Option<f64>,
    rel_error: Option<f64>,
) -> bool {
    let abs_eps = abs_error.unwrap_or(1e-9);
    let rel_eps = rel_error.unwrap_or(1e-9);

    let exp_str = String::from_utf8_lossy(expected);
    let act_str = String::from_utf8_lossy(actual);

    let exp_tokens: Vec<&str> = exp_str.split_whitespace().collect();
    let act_tokens: Vec<&str> = act_str.split_whitespace().collect();

    if exp_tokens.len() != act_tokens.len() {
        return false;
    }

    for (exp_tok, act_tok) in exp_tokens.iter().zip(act_tokens.iter()) {
        match (exp_tok.parse::<f64>(), act_tok.parse::<f64>()) {
            (Ok(exp_val), Ok(act_val)) => {
                // f64::parse accepts "nan"/"inf"/"-inf", but the abs/rel
                // tolerance math yields NaN for these and would wrongly fail.
                // Handle the IEEE-754 special values explicitly.
                if exp_val.is_nan() || act_val.is_nan() {
                    // Both NaN => equal; exactly one NaN => mismatch.
                    if exp_val.is_nan() != act_val.is_nan() {
                        return false;
                    }
                } else if exp_val.is_infinite() || act_val.is_infinite() {
                    // Equal only if both are infinite with the same sign.
                    // (inf == inf is true, inf == -inf is false in IEEE-754;
                    // NaN is already excluded above.)
                    if exp_val != act_val {
                        return false;
                    }
                } else {
                    let diff = (exp_val - act_val).abs();
                    let abs_ok = diff <= abs_eps;
                    let rel_ok = if exp_val.abs() > f64::EPSILON {
                        diff <= rel_eps * exp_val.abs()
                    } else {
                        diff <= abs_eps
                    };
                    if !abs_ok && !rel_ok {
                        return false;
                    }
                }
            }
            _ => {
                // Non-numeric tokens: exact comparison (trimmed)
                if exp_tok != act_tok {
                    return false;
                }
            }
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::{compare_output, compare_float_output};

    #[test]
    fn exact_match() {
        assert!(compare_output(b"hello\nworld", b"hello\nworld"));
    }

    #[test]
    fn trailing_whitespace_per_line() {
        assert!(compare_output(b"hello   \nworld\t", b"hello\nworld"));
    }

    #[test]
    fn trailing_newlines() {
        assert!(compare_output(b"hello\nworld\n", b"hello\nworld"));
        assert!(compare_output(b"hello\nworld\n\n", b"hello\nworld"));
        assert!(compare_output(b"hello\nworld", b"hello\nworld\n\n\n"));
    }

    #[test]
    fn both_empty() {
        assert!(compare_output(b"", b""));
    }

    #[test]
    fn one_empty_one_whitespace() {
        // TypeScript: normalize("   \n\n  ") == normalize("") == ""
        assert!(compare_output(b"", b"   \n\n  "));
        assert!(compare_output(b"   \n\n  ", b""));
        assert!(compare_output(b"\n\n\n", b""));
        assert!(compare_output(b"", b"\n\n\n"));
    }

    #[test]
    fn different_content() {
        assert!(!compare_output(b"hello", b"world"));
        assert!(!compare_output(b"hello\nworld", b"hello\nearth"));
    }

    #[test]
    fn float_nan_and_infinity() {
        // Both NaN => equal (parse accepts nan/NaN/NAN).
        assert!(compare_float_output(b"nan", b"NaN", None, None));
        assert!(compare_float_output(b"1.0 nan 2.0", b"1.0 NAN 2.0", None, None));
        // Exactly one NaN => mismatch.
        assert!(!compare_float_output(b"nan", b"1.0", None, None));
        assert!(!compare_float_output(b"1.0", b"nan", None, None));
        // Same-sign infinity => equal.
        assert!(compare_float_output(b"inf", b"inf", None, None));
        assert!(compare_float_output(b"-inf", b"-inf", None, None));
        assert!(compare_float_output(b"inf", b"Infinity", None, None));
        // Opposite-sign / finite-vs-infinite => mismatch.
        assert!(!compare_float_output(b"inf", b"-inf", None, None));
        assert!(!compare_float_output(b"inf", b"1.0", None, None));
    }

    #[test]
    fn extra_blank_lines_at_end() {
        assert!(compare_output(b"a\nb\n\n\n", b"a\nb"));
        assert!(compare_output(b"a\nb", b"a\nb\n\n\n"));
    }

    #[test]
    fn windows_line_endings() {
        assert!(compare_output(b"hello\r\nworld\r\n", b"hello\nworld\n"));
        assert!(compare_output(b"hello\r\nworld", b"hello\nworld"));
        // Trailing \r on a line without \n
        assert!(compare_output(b"hello\r", b"hello"));
    }

    #[test]
    fn unicode_content() {
        let exp = "こんにちは\n世界\n".as_bytes();
        let act = "こんにちは\n世界".as_bytes();
        assert!(compare_output(exp, act));

        let exp2 = "héllo\nwörld  \n".as_bytes();
        let act2 = "héllo\nwörld".as_bytes();
        assert!(compare_output(exp2, act2));
    }

    #[test]
    fn large_output() {
        let line = b"the quick brown fox jumps over the lazy dog\n";
        let exp: Vec<u8> = line.repeat(10_000);
        let mut act: Vec<u8> = line.repeat(10_000);
        // Add trailing spaces to each line in `act`
        let act_str: Vec<u8> = act
            .chunks(line.len())
            .flat_map(|l| {
                // l ends with \n; insert two spaces before the newline
                let mut v = l[..l.len() - 1].to_vec();
                v.extend_from_slice(b"  \n");
                v
            })
            .collect();
        act = act_str;
        assert!(compare_output(&exp, &act));

        // Mismatched content should fail fast
        let mut bad = line.repeat(10_000);
        bad[500] = b'X';
        assert!(!compare_output(&exp, &bad));
    }

    #[test]
    fn mixed_trailing_spaces_and_tabs() {
        assert!(compare_output(b"a  \t \nb\t\t", b"a\nb"));
        assert!(!compare_output(b"a  X\nb", b"a\nb"));
    }

    #[test]
    fn single_line_match() {
        assert!(compare_output(b"42", b"42"));
        assert!(compare_output(b"42\n", b"42"));
        assert!(compare_output(b"42   ", b"42"));
        assert!(compare_output(b"42", b" 42"));
        assert!(compare_output(b"\t42", b"42"));
        assert!(compare_output(b"\n 42", b"42"));
    }

    #[test]
    fn single_line_mismatch() {
        assert!(!compare_output(b"42", b"43"));
        assert!(!compare_output(b"42", b"420"));
        assert!(!compare_output(b"420", b"42"));
    }

    #[test]
    fn internal_blank_lines_preserved() {
        // Internal blank lines are significant — must NOT be collapsed
        assert!(compare_output(b"a\n\nb", b"a\n\nb"));
        assert!(!compare_output(b"a\n\n\nb", b"a\n\nb"));
        assert!(!compare_output(b"a\n\nb", b"a\n\n\nb"));
        assert!(!compare_output(b"a\nb", b"a\n\nb"));
        assert!(!compare_output(b"a\n\nb", b"a\nb"));
    }

    #[test]
    fn float_exact_match() {
        assert!(compare_float_output(b"1.0 2.0 3.0", b"1.0 2.0 3.0", None, None));
    }

    #[test]
    fn float_within_absolute_error() {
        assert!(compare_float_output(
            b"1.000000",
            b"1.000001",
            Some(1e-5),
            None,
        ));
    }

    #[test]
    fn float_exceeds_absolute_error() {
        assert!(!compare_float_output(
            b"1.000000",
            b"1.001000",
            Some(1e-5),
            None,
        ));
    }

    #[test]
    fn float_within_relative_error() {
        assert!(compare_float_output(
            b"1000.0",
            b"1000.001",
            None,
            Some(1e-5),
        ));
    }

    #[test]
    fn float_exceeds_relative_error() {
        assert!(!compare_float_output(
            b"1000.0",
            b"1010.0",
            None,
            Some(1e-5),
        ));
    }

    #[test]
    fn float_mixed_numeric_and_text() {
        assert!(compare_float_output(
            b"YES 3.14159",
            b"YES 3.14159",
            Some(1e-6),
            None,
        ));
        assert!(!compare_float_output(
            b"YES 3.14159",
            b"NO 3.14159",
            Some(1e-6),
            None,
        ));
    }

    #[test]
    fn float_different_token_count() {
        assert!(!compare_float_output(
            b"1.0 2.0",
            b"1.0 2.0 3.0",
            Some(1e-6),
            None,
        ));
    }

    #[test]
    fn float_multiline() {
        assert!(compare_float_output(
            b"1.0\n2.0\n3.0",
            b"1.0000001\n2.0000001\n3.0000001",
            Some(1e-6),
            None,
        ));
    }

    #[test]
    fn float_zero_expected() {
        // When expected is 0, relative error doesn't apply well,
        // should fall back to absolute error
        assert!(compare_float_output(
            b"0.0",
            b"0.0000001",
            Some(1e-6),
            Some(1e-6),
        ));
    }

    #[test]
    fn float_negative_values() {
        assert!(compare_float_output(
            b"-1.5",
            b"-1.5000001",
            Some(1e-6),
            None,
        ));
    }
}
