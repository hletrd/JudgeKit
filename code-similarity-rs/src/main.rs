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
    // SEC H-4: in production we refuse to boot without an auth token.
    // A misconfigured deployment (docker port exposed, sandbox escape
    // onto the bridge, etc.) cannot then talk to /compute without a
    // bearer. Local development is unaffected — set NODE_ENV != production
    // or CODE_SIMILARITY_ALLOW_UNAUTHENTICATED=1 to bypass.
    if auth_state.expected.is_none() {
        let allow_unauth = std::env::var("CODE_SIMILARITY_ALLOW_UNAUTHENTICATED")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        let is_production = std::env::var("NODE_ENV")
            .map(|v| v == "production")
            .unwrap_or(false);
        if is_production && !allow_unauth {
            tracing::error!(
                "CODE_SIMILARITY_AUTH_TOKEN is not set in production. Refusing to start. \
                 Set the token, or set CODE_SIMILARITY_ALLOW_UNAUTHENTICATED=1 if you fully understand the risk."
            );
            std::process::exit(1);
        }
        tracing::warn!(
            "CODE_SIMILARITY_AUTH_TOKEN is not set — /compute will accept unauthenticated requests. Set it in production."
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
