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
            .any(|prefix| is_trusted_registry_image(image, prefix))
}

fn is_trusted_registry_image(image: &str, prefix: &str) -> bool {
    if !image.starts_with(prefix) {
        return false;
    }

    match prefix.as_bytes().last().copied() {
        Some(b'/' | b':') => true,
        Some(_) => matches!(image.as_bytes().get(prefix.len()), Some(b'/' | b':') | None),
        None => false,
    }
}

/// Validate a docker image reference against an explicit production flag and
/// trusted-registry list. Pure — no process-env access. Tests inject config
/// here instead of mutating the global environment (which races under parallel
/// `cargo test`).
pub fn validate_docker_image_with_config(
    image: &str,
    is_production: bool,
    trusted_prefixes: &[&str],
) -> bool {
    if is_production && trusted_prefixes.is_empty() {
        return false;
    }

    validate_docker_image_with_trusted(image, trusted_prefixes)
}

/// Read `TRUSTED_DOCKER_REGISTRIES` into an owned list (single env boundary).
fn parse_trusted_registries() -> Vec<String> {
    std::env::var("TRUSTED_DOCKER_REGISTRIES")
        .unwrap_or_default()
        .split(',')
        .map(|item| item.trim().to_owned())
        .filter(|item| !item.is_empty())
        .collect()
}

/// Read `JUDGE_PRODUCTION_MODE` into a bool (single env boundary).
fn is_production_mode() -> bool {
    std::env::var("JUDGE_PRODUCTION_MODE")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

/// Validate that a docker image reference is safe (no protocol, alphanumeric
/// start, `judge-*` image name).
///
/// Production behavior (`JUDGE_PRODUCTION_MODE=1`): requires a NON-empty
/// trusted-registry list. When that list is set, unqualified local `judge-*`
/// images are still accepted, but any registry-prefixed image must match a
/// trusted prefix. (The prior wording — "rejects images without a trusted
/// registry prefix" — was inaccurate: unqualified judge-* tags are allowed.)
///
/// This is the env-reading boundary kept for production callers; tests should
/// call [`validate_docker_image_with_config`] instead so they never mutate the
/// process-global environment.
pub fn validate_docker_image(image: &str) -> bool {
    let trusted = parse_trusted_registries();
    let trusted: Vec<&str> = trusted.iter().map(String::as_str).collect();
    validate_docker_image_with_config(image, is_production_mode(), &trusted)
}

/// Pure variant of [`validate_admin_image_tag`] that takes explicit config.
pub fn validate_admin_image_tag_with_config(
    image: &str,
    is_production: bool,
    trusted_prefixes: &[&str],
) -> bool {
    validate_docker_image_with_config(image, is_production, trusted_prefixes)
        && (image.starts_with("judge-") || image.contains("/judge-"))
}

pub fn validate_admin_image_tag(image: &str) -> bool {
    let trusted = parse_trusted_registries();
    let trusted: Vec<&str> = trusted.iter().map(String::as_str).collect();
    validate_admin_image_tag_with_config(image, is_production_mode(), &trusted)
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
        // Inject config explicitly — never mutate the process env (which races
        // under parallel `cargo test`).
        assert!(validate_docker_image_with_config(
            "judge-python:latest",
            false,
            &[],
        ));
        assert!(validate_docker_image_with_trusted(
            "registry.example.com/judge-rust:1.0",
            &["registry.example.com/"],
        ));
        assert!(validate_docker_image_with_trusted(
            "registry.example.com/team/judge-rust:1.0",
            &["registry.example.com/"],
        ));
        assert!(validate_docker_image_with_trusted(
            "registry.example.com:5000/judge-rust:1.0",
            &["registry.example.com"],
        ));
        assert!(validate_docker_image_with_trusted(
            "registry.example.com/team/judge-rust:1.0",
            &["registry.example.com"],
        ));
    }

    #[test]
    fn invalid_docker_images() {
        assert!(!validate_docker_image_with_config("", false, &[]));
        assert!(!validate_docker_image_with_config(
            "http://evil.com/image",
            false,
            &[],
        ));
        assert!(!validate_docker_image_with_config(
            "../../../etc/passwd",
            false,
            &[],
        ));
        assert!(!validate_docker_image_with_config("-flag", false, &[]));
        assert!(!validate_docker_image_with_config("alpine:3.18", false, &[]));
        assert!(!validate_docker_image_with_config(
            "library/judge-python:latest",
            false,
            &[],
        ));
        assert!(!validate_docker_image_with_trusted(
            "registry.example.com/judge-rust:1.0",
            &[],
        ));
        assert!(!validate_docker_image_with_trusted(
            "registry.example.com.evil.com/judge-rust:1.0",
            &["registry.example.com"],
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
        assert!(validate_admin_image_tag_with_config(
            "judge-python:latest",
            false,
            &[],
        ));
        assert!(!validate_admin_image_tag_with_config("alpine:latest", false, &[]));
        assert!(!validate_admin_image_tag_with_config(
            "library/judge-python:latest",
            false,
            &[],
        ));
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
    fn production_mode_rejects_images_without_trusted_registry() {
        // In production with no trusted registries, even simple judge- images are rejected.
        assert!(!validate_docker_image_with_config(
            "judge-python:latest",
            true,
            &[],
        ));
        // With trusted registries configured, trusted-registry images pass.
        assert!(validate_docker_image_with_config(
            "registry.example.com/judge-python:latest",
            true,
            &["registry.example.com"],
        ));
    }

    #[test]
    fn dockerfile_build_path_stays_under_judge_dockerfiles() {
        assert!(validate_dockerfile_path_for_build("docker/Dockerfile.judge-python"));
        assert!(!validate_dockerfile_path_for_build("../docker/Dockerfile.judge-python"));
        assert!(!validate_dockerfile_path_for_build("docker/Dockerfile.app"));
    }
}
