use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::signal;
use tracing::{info, warn};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

struct RateLimitEntry {
    attempts: u32,
    window_started_at: u64,
    blocked_until: Option<u64>,
    consecutive_blocks: u32,
    last_attempt: u64,
}

type Store = Arc<DashMap<String, RateLimitEntry>>;

// Maximum block duration: 24 hours
const MAX_BLOCK_MS: u64 = 24 * 60 * 60 * 1000;
// Eviction threshold: entries older than 24 hours
const EVICTION_AGE_MS: u64 = MAX_BLOCK_MS;
// Eviction interval: every 60 seconds
const EVICTION_INTERVAL_SECS: u64 = 60;
// Cap on consecutive_blocks exponent to prevent overflow
const MAX_CONSECUTIVE_BLOCKS_EXP: u32 = 4;

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckRequest {
    key: String,
    max_attempts: u32,
    window_ms: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckResponse {
    allowed: bool,
    remaining: u32,
    retry_after: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordFailureRequest {
    key: String,
    max_attempts: u32,
    window_ms: u64,
    block_ms: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordFailureResponse {
    blocked: bool,
    blocked_until: Option<u64>,
}

#[derive(Deserialize)]
struct ResetRequest {
    key: String,
}

#[derive(Deserialize, Serialize)]
struct OkResponse {
    ok: bool,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn health() -> impl IntoResponse {
    Json(OkResponse { ok: true })
}

async fn check(
    State(store): State<Store>,
    Json(req): Json<CheckRequest>,
) -> impl IntoResponse {
    let now = now_ms();

    let mut entry = store.entry(req.key).or_insert_with(|| RateLimitEntry {
        attempts: 0,
        window_started_at: now,
        blocked_until: None,
        consecutive_blocks: 0,
        last_attempt: now,
    });

    let e = entry.value_mut();

    // Check if currently blocked
    if let Some(until) = e.blocked_until {
        if until > now {
            return (
                StatusCode::OK,
                Json(CheckResponse {
                    allowed: false,
                    remaining: 0,
                    retry_after: Some(until - now),
                }),
            );
        }
        // Block expired — clear it
        e.blocked_until = None;
    }

    // Check if window expired — reset
    if e.window_started_at + req.window_ms <= now {
        e.attempts = 0;
        e.window_started_at = now;
    }

    // Check if at or over limit
    if e.attempts >= req.max_attempts {
        let retry_after = (e.window_started_at + req.window_ms).saturating_sub(now);
        return (
            StatusCode::OK,
            Json(CheckResponse {
                allowed: false,
                remaining: 0,
                retry_after: Some(retry_after),
            }),
        );
    }

    // Allowed — increment
    e.attempts += 1;
    e.last_attempt = now;
    let remaining = req.max_attempts.saturating_sub(e.attempts);

    (
        StatusCode::OK,
        Json(CheckResponse {
            allowed: true,
            remaining,
            retry_after: None,
        }),
    )
}

async fn record_failure(
    State(store): State<Store>,
    Json(req): Json<RecordFailureRequest>,
) -> impl IntoResponse {
    let now = now_ms();

    let mut entry = store.entry(req.key).or_insert_with(|| RateLimitEntry {
        attempts: 0,
        window_started_at: now,
        blocked_until: None,
        consecutive_blocks: 0,
        last_attempt: now,
    });

    let e = entry.value_mut();

    // If currently blocked, just return the block status
    if let Some(until) = e.blocked_until {
        if until > now {
            return (
                StatusCode::OK,
                Json(RecordFailureResponse {
                    blocked: true,
                    blocked_until: Some(until),
                }),
            );
        }
        // Block expired — clear it
        e.blocked_until = None;
    }

    // Reset window if expired
    if e.window_started_at + req.window_ms <= now {
        e.attempts = 0;
        e.window_started_at = now;
    }

    // Record the failure
    e.attempts += 1;
    e.last_attempt = now;

    // Check if threshold reached
    if e.attempts >= req.max_attempts {
        let exp = e.consecutive_blocks.min(MAX_CONSECUTIVE_BLOCKS_EXP);
        let multiplier = 2u64.pow(exp);
        let block_duration = (req.block_ms * multiplier).min(MAX_BLOCK_MS);
        let blocked_until = now + block_duration;
        e.blocked_until = Some(blocked_until);
        e.consecutive_blocks += 1;

        return (
            StatusCode::OK,
            Json(RecordFailureResponse {
                blocked: true,
                blocked_until: Some(blocked_until),
            }),
        );
    }

    (
        StatusCode::OK,
        Json(RecordFailureResponse {
            blocked: false,
            blocked_until: None,
        }),
    )
}

async fn reset(
    State(store): State<Store>,
    Json(req): Json<ResetRequest>,
) -> impl IntoResponse {
    store.remove(&req.key);
    Json(OkResponse { ok: true })
}

// ---------------------------------------------------------------------------
// Eviction background task
// ---------------------------------------------------------------------------

fn spawn_eviction_task(store: Store) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(EVICTION_INTERVAL_SECS));
        loop {
            interval.tick().await;
            let now = now_ms();
            let before = store.len();
            store.retain(|_, entry| {
                // Keep entries that were active within the eviction window
                // or that have an active block
                let active = now.saturating_sub(entry.last_attempt) < EVICTION_AGE_MS;
                let blocked = entry
                    .blocked_until
                    .map(|until| until > now)
                    .unwrap_or(false);
                active || blocked
            });
            let evicted = before.saturating_sub(store.len());
            if evicted > 0 {
                info!(evicted, remaining = store.len(), "eviction sweep complete");
            }
        }
    });
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
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let host = std::env::var("RATE_LIMITER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("RATE_LIMITER_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);

    let store: Store = Arc::new(DashMap::new());

    // Start background eviction
    spawn_eviction_task(Arc::clone(&store));

    let app = Router::new()
        .route("/health", get(health))
        .route("/check", post(check))
        .route("/record-failure", post(record_failure))
        .route("/reset", post(reset))
        .with_state(store);

    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .unwrap_or_else(|_| {
            warn!("invalid host/port, falling back to 127.0.0.1:{port}");
            SocketAddr::from(([127, 0, 0, 1], port))
        });

    info!(%addr, "rate limiter starting");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind listener");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");

    info!("rate limiter stopped");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::response::Response;

    async fn decode_json<T: for<'de> serde::Deserialize<'de>>(response: impl IntoResponse) -> T {
        let response: Response = response.into_response();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn check_increments_and_blocks_at_limit() {
        let store: Store = Arc::new(DashMap::new());

        let first: CheckResponse = decode_json(check(
            State(Arc::clone(&store)),
            Json(CheckRequest { key: "login:user".into(), max_attempts: 2, window_ms: 60_000 }),
        ).await).await;
        assert!(first.allowed);
        assert_eq!(first.remaining, 1);

        let second: CheckResponse = decode_json(check(
            State(Arc::clone(&store)),
            Json(CheckRequest { key: "login:user".into(), max_attempts: 2, window_ms: 60_000 }),
        ).await).await;
        assert!(second.allowed);
        assert_eq!(second.remaining, 0);

        let third: CheckResponse = decode_json(check(
            State(store),
            Json(CheckRequest { key: "login:user".into(), max_attempts: 2, window_ms: 60_000 }),
        ).await).await;
        assert!(!third.allowed);
        assert_eq!(third.remaining, 0);
        assert!(third.retry_after.is_some());
    }

    #[tokio::test]
    async fn record_failure_blocks_and_reset_clears_entry() {
        let store: Store = Arc::new(DashMap::new());

        let first: RecordFailureResponse = decode_json(record_failure(
            State(Arc::clone(&store)),
            Json(RecordFailureRequest {
                key: "auth:user".into(),
                max_attempts: 2,
                window_ms: 60_000,
                block_ms: 1_000,
            }),
        ).await).await;
        assert!(!first.blocked);
        assert!(first.blocked_until.is_none());

        let second: RecordFailureResponse = decode_json(record_failure(
            State(Arc::clone(&store)),
            Json(RecordFailureRequest {
                key: "auth:user".into(),
                max_attempts: 2,
                window_ms: 60_000,
                block_ms: 1_000,
            }),
        ).await).await;
        assert!(second.blocked);
        assert!(second.blocked_until.is_some());

        let _: OkResponse = decode_json(reset(
            State(Arc::clone(&store)),
            Json(ResetRequest { key: "auth:user".into() }),
        ).await).await;
        assert!(store.get("auth:user").is_none());

        let after_reset: CheckResponse = decode_json(check(
            State(store),
            Json(CheckRequest { key: "auth:user".into(), max_attempts: 2, window_ms: 60_000 }),
        ).await).await;
        assert!(after_reset.allowed);
        assert_eq!(after_reset.remaining, 1);
    }
}
