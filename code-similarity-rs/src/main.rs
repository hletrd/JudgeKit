mod similarity;
mod types;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::IntoResponse,
    routing::{get, post},
};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::signal;
use tracing::info;

use crate::similarity::compute_similarity;
use crate::types::{ComputeRequest, ComputeResponse, HealthResponse};

// Body size cap for /compute. Large enough for assignments with many
// submissions but bounded so an attacker on the docker network cannot
// OOM the process with a giant payload.
const MAX_COMPUTE_BODY_BYTES: usize = 16 * 1024 * 1024;

/// Hard cap on the number of submissions per /compute request. The similarity
/// algorithm is O(n^2); a leaked/bruteable sidecar token must not be able to
/// pin fleet CPU via a single oversized payload. Mirrors the TS-side cap
/// (MAX_SUBMISSIONS_FOR_SIMILARITY in src/lib/assignments/code-similarity.ts).
const MAX_SUBMISSIONS: usize = 500;

/// True when a /compute payload exceeds the submission cap. Extracted so the
/// boundary can be unit-tested without standing up an axum router.
fn exceeds_submission_cap(count: usize) -> bool {
    count > MAX_SUBMISSIONS
}

/// Bearer token loaded from CODE_SIMILARITY_AUTH_TOKEN at startup.
/// When unset we keep the service open (and log a warning) so local
/// single-machine setups without docker-networked callers still work.
#[derive(Clone)]
struct AuthState {
    expected: Option<Arc<String>>,
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

async fn require_bearer(
    State(auth): State<AuthState>,
    req: Request,
    next: Next,
) -> Result<impl IntoResponse, StatusCode> {
    let Some(expected) = auth.expected.as_ref() else {
        return Ok(next.run(req).await);
    };

    let header = req.headers().get(axum::http::header::AUTHORIZATION);
    let Some(raw) = header.and_then(|value| value.to_str().ok()) else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let Some(token) = raw.strip_prefix("Bearer ") else {
        return Err(StatusCode::UNAUTHORIZED);
    };

    if constant_time_eq(token.as_bytes(), expected.as_bytes()) {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn health() -> impl IntoResponse {
    Json(HealthResponse { ok: true })
}

async fn compute(Json(req): Json<ComputeRequest>) -> impl IntoResponse {
    let threshold = req.threshold;
    let ngram_size = req.ngram_size;
    let submissions = req.submissions;

    // Bound the O(n^2) workload at the boundary. Without this, a caller with a
    // valid token (or one bruteable over the docker bridge) can pin the CPU
    // with thousands of submissions in a single request.
    if exceeds_submission_cap(submissions.len()) {
        tracing::warn!(
            count = submissions.len(),
            max = MAX_SUBMISSIONS,
            "code-similarity /compute rejected: too many submissions"
        );
        return (StatusCode::PAYLOAD_TOO_LARGE, Json(ComputeResponse { pairs: Vec::new() }))
            .into_response();
    }

    if !(0.0..=1.0).contains(&threshold) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ComputeResponse { pairs: Vec::new() }),
        )
            .into_response();
    }

    if ngram_size == 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(ComputeResponse { pairs: Vec::new() }),
        )
            .into_response();
    }

    // Run CPU-intensive work on rayon's thread pool via spawn_blocking
    let pairs = match tokio::task::spawn_blocking(move || {
        compute_similarity(submissions, threshold, ngram_size)
    })
    .await
    {
        Ok(result) => result,
        Err(e) => {
            tracing::error!(error = %e, "Similarity computation panicked");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ComputeResponse { pairs: Vec::new() }),
            )
                .into_response();
        }
    };

    (StatusCode::OK, Json(ComputeResponse { pairs })).into_response()
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => { info!("received Ctrl+C, shutting down"); }
        () = terminate => { info!("received SIGTERM, shutting down"); }
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let host = std::env::var("CODE_SIMILARITY_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("CODE_SIMILARITY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3002);

    let auth_state = AuthState {
        expected: std::env::var("CODE_SIMILARITY_AUTH_TOKEN")
            .ok()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .map(Arc::new),
    };
    // SEC H-4 / SEC-21-4: fail-closed by default, regardless of NODE_ENV.
    // The previous gate depended on NODE_ENV=production propagating from
    // Node land into the Rust container — which it doesn't automatically
    // when the sidecar runs under a separate `docker compose` service
    // with its own environment. To remove the foot-gun, the only opt-out
    // is now the explicit CODE_SIMILARITY_ALLOW_UNAUTHENTICATED=1 flag.
    // Local development MUST either set the token or set the explicit
    // opt-out.
    if auth_state.expected.is_none() {
        let allow_unauth = std::env::var("CODE_SIMILARITY_ALLOW_UNAUTHENTICATED")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if !allow_unauth {
            tracing::error!(
                "CODE_SIMILARITY_AUTH_TOKEN is not set. Refusing to start. \
                 Set the token, or set CODE_SIMILARITY_ALLOW_UNAUTHENTICATED=1 if you fully understand the risk."
            );
            std::process::exit(1);
        }
        tracing::warn!(
            "CODE_SIMILARITY_AUTH_TOKEN is not set and CODE_SIMILARITY_ALLOW_UNAUTHENTICATED=1 — /compute will accept unauthenticated requests."
        );
    }

    let protected = Router::new()
        .route("/compute", post(compute))
        .layer(DefaultBodyLimit::max(MAX_COMPUTE_BODY_BYTES))
        .layer(middleware::from_fn_with_state(auth_state.clone(), require_bearer));

    let app = Router::new()
        .route("/health", get(health))
        .merge(protected);

    let addr: SocketAddr = format!("{host}:{port}").parse().unwrap_or_else(|_| {
        tracing::warn!("invalid host/port, falling back to 127.0.0.1:{port}");
        SocketAddr::from(([127, 0, 0, 1], port))
    });

    info!(%addr, "code-similarity starting");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind listener");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");

    info!("code-similarity stopped");
}

#[cfg(test)]
mod tests {
    use super::{MAX_SUBMISSIONS, exceeds_submission_cap};

    #[test]
    fn submission_cap_boundary() {
        // At the cap is allowed; one over is rejected.
        assert!(!exceeds_submission_cap(MAX_SUBMISSIONS));
        assert!(!exceeds_submission_cap(MAX_SUBMISSIONS.saturating_sub(1)));
        assert!(exceeds_submission_cap(MAX_SUBMISSIONS + 1));
        // A 5000-submission contest payload (the DoS scenario from PERF-2/FDR-3)
        // is rejected.
        assert!(exceeds_submission_cap(5000));
        assert_eq!(MAX_SUBMISSIONS, 500);
    }
}
