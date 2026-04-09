mod similarity;
mod types;

use axum::{
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use std::net::SocketAddr;
use tokio::signal;
use tracing::info;

use crate::similarity::compute_similarity;
use crate::types::{ComputeRequest, ComputeResponse, HealthResponse};

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

    // Run CPU-intensive work on rayon's thread pool via spawn_blocking
    let pairs = match tokio::task::spawn_blocking(move || {
        compute_similarity(submissions, threshold, ngram_size)
    })
    .await
    {
        Ok(result) => result,
        Err(e) => {
            tracing::error!(error = %e, "Similarity computation panicked");
            Vec::new()
        }
    };

    Json(ComputeResponse { pairs })
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
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let host =
        std::env::var("CODE_SIMILARITY_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("CODE_SIMILARITY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3002);

    let app = Router::new()
        .route("/health", get(health))
        .route("/compute", post(compute));

    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .unwrap_or_else(|_| {
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
