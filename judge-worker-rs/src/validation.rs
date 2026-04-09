/// Validate that a docker image reference is safe (no protocol, alphanumeric start).
pub fn validate_docker_image(image: &str) -> bool {
    if image.is_empty() || image.contains("://") {
        return false;
    }
    let first = image.as_bytes()[0];
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    image
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/' | ':'))
}

/// Validate that a file extension is safe (starts with dot, alphanumeric + dots only).
pub fn validate_extension(ext: &str) -> bool {
    !ext.is_empty()
        && ext.starts_with('.')
        && ext.len() <= 16
        && ext.chars().all(|c| c.is_ascii_alphanumeric() || c == '.')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_docker_images() {
        assert!(validate_docker_image("judge-python:latest"));
        assert!(validate_docker_image("alpine:3.18"));
        assert!(validate_docker_image("registry.example.com/judge-rust:1.0"));
    }

    #[test]
    fn invalid_docker_images() {
        assert!(!validate_docker_image(""));
        assert!(!validate_docker_image("http://evil.com/image"));
        assert!(!validate_docker_image("../../../etc/passwd"));
        assert!(!validate_docker_image("-flag"));
    }

    #[test]
    fn valid_extensions() {
        assert!(validate_extension(".py"));
        assert!(validate_extension(".cpp"));
        assert!(validate_extension(".rs"));
        assert!(validate_extension(".java"));
    }

    #[test]
    fn invalid_extensions() {
        assert!(!validate_extension(""));
        assert!(!validate_extension("py"));
        assert!(!validate_extension("/../../../etc"));
        assert!(!validate_extension(".a_very_long_extension_name"));
    }
}
