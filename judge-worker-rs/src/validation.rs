fn validate_docker_image_with_trusted(image: &str, trusted_prefixes: &[&str]) -> bool {
    if image.is_empty() || image.contains("://") {
        return false;
    }
    let first = image.as_bytes()[0];
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    let basic_format_ok = image
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/' | ':'));

    if !basic_format_ok {
        return false;
    }

    let segments: Vec<&str> = image.split('/').collect();
    let first_segment = segments.first().copied().unwrap_or_default();
    let has_registry_prefix = segments.len() > 1 && first_segment.contains('.');
    let image_name = segments
        .last()
        .and_then(|segment| segment.split(':').next())
        .unwrap_or_default();

    if !image_name.starts_with("judge-") {
        return false;
    }

    if !has_registry_prefix {
        return segments.len() == 1;
    }

    !trusted_prefixes.is_empty()
        && trusted_prefixes
            .iter()
            .any(|prefix| image.starts_with(prefix))
}

/// Validate that a docker image reference is safe (no protocol, alphanumeric start).
pub fn validate_docker_image(image: &str) -> bool {
    let trusted = std::env::var("TRUSTED_DOCKER_REGISTRIES").unwrap_or_default();
    let trusted: Vec<&str> = trusted
        .split(',')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .collect();

    validate_docker_image_with_trusted(image, &trusted)
}

pub fn validate_admin_image_tag(image: &str) -> bool {
    validate_docker_image(image) && (image.starts_with("judge-") || image.contains("/judge-"))
}

pub fn validate_image_filter(filter: &str) -> bool {
    !filter.is_empty()
        && filter.contains("judge-")
        && filter
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/' | ':' | '*'))
}

pub fn validate_dockerfile_path_for_build(path: &str) -> bool {
    path.starts_with("docker/Dockerfile.judge-")
        && !path.contains("..")
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'))
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
        assert!(validate_docker_image_with_trusted(
            "registry.example.com/judge-rust:1.0",
            &["registry.example.com/"],
        ));
        assert!(validate_docker_image_with_trusted(
            "registry.example.com/team/judge-rust:1.0",
            &["registry.example.com/"],
        ));
    }

    #[test]
    fn invalid_docker_images() {
        assert!(!validate_docker_image(""));
        assert!(!validate_docker_image("http://evil.com/image"));
        assert!(!validate_docker_image("../../../etc/passwd"));
        assert!(!validate_docker_image("-flag"));
        assert!(!validate_docker_image("alpine:3.18"));
        assert!(!validate_docker_image("library/judge-python:latest"));
        assert!(!validate_docker_image_with_trusted(
            "registry.example.com/judge-rust:1.0",
            &[],
        ));
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

    #[test]
    fn admin_image_tag_must_stay_in_judge_namespace() {
        assert!(validate_admin_image_tag("judge-python:latest"));
        assert!(!validate_admin_image_tag("alpine:latest"));
        assert!(!validate_admin_image_tag("library/judge-python:latest"));
    }

    #[test]
    fn image_filter_accepts_only_judge_scoped_patterns() {
        assert!(validate_image_filter("judge-*"));
        assert!(validate_image_filter("registry.example.com/judge-*"));
        assert!(!validate_image_filter(""));
        assert!(!validate_image_filter("*"));
        assert!(!validate_image_filter("python*"));
    }

    #[test]
    fn dockerfile_build_path_stays_under_judge_dockerfiles() {
        assert!(validate_dockerfile_path_for_build("docker/Dockerfile.judge-python"));
        assert!(!validate_dockerfile_path_for_build("../docker/Dockerfile.judge-python"));
        assert!(!validate_dockerfile_path_for_build("docker/Dockerfile.app"));
    }
}
