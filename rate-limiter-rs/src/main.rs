use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::IntoResponse,
    routing::{get, post},
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::signal;
use tracing::{info, warn};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A clock source for rate-limit bookkeeping. Production uses real wall/system
/// and monotonic clocks; tests use a manually advanced clock so we can assert
/// behavior when the system clock jumps backward while the monotonic clock
/// keeps advancing normally.
trait Clock: Send + Sync {
    /// Monotonic instant. Used for all window, block, and eviction decisions.
    fn now(&self) -> Instant;
    /// Wall-clock Unix time in milliseconds. Used only for converting internal
    /// monotonic instants into the absolute `blocked_until` timestamps that the
    /// HTTP API contract exposes.
    fn now_unix_ms(&self) -> u64;
}

struct RealClock;

impl Clock for RealClock {
    fn now(&self) -> Instant {
        Instant::now()
    }

    fn now_unix_ms(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

#[cfg(test)]
struct ManualClock {
    instant: std::sync::Mutex<Instant>,
    unix_ms: std::sync::Mutex<u64>,
}

#[cfg(test)]
impl ManualClock {
    fn new(instant: Instant, unix_ms: u64) -> Self {
        Self {
            instant: std::sync::Mutex::new(instant),
            unix_ms: std::sync::Mutex::new(unix_ms),
        }
    }

    fn set_unix_ms(&self, ms: u64) {
        *self.unix_ms.lock().unwrap() = ms;
    }

    fn advance_instant(&self, duration: Duration) {
        *self.instant.lock().unwrap() += duration;
    }
}

#[cfg(test)]
impl Clock for ManualClock {
    fn now(&self) -> Instant {
        *self.instant.lock().unwrap()
    }

    fn now_unix_ms(&self) -> u64 {
        *self.unix_ms.lock().unwrap()
    }
}

struct RateLimitEntry {
    attempts: u32,
    window_started_at: Instant,
    blocked_until: Option<Instant>,
    consecutive_blocks: u32,
    last_attempt: Instant,
}

type Store = Arc<DashMap<String, RateLimitEntry>>;

#[derive(Clone)]
struct AppState {
    store: Store,
    clock: Arc<dyn Clock>,
}

// Maximum block duration: 24 hours
const MAX_BLOCK_MS: u64 = 24 * 60 * 60 * 1000;
// Eviction threshold: entries older than 24 hours
const EVICTION_AGE_MS: u64 = MAX_BLOCK_MS;
// Eviction interval: every 60 seconds
const EVICTION_INTERVAL_SECS: u64 = 60;
// Cap on consecutive_blocks exponent to prevent overflow
const MAX_CONSECUTIVE_BLOCKS_EXP: u32 = 4;
// Body size cap for the JSON endpoints. Rate limit payloads are tiny;
// 64 KiB is a generous upper bound.
const MAX_BODY_BYTES: usize = 64 * 1024;

/// Bearer token loaded from RATE_LIMITER_AUTH_TOKEN at startup.
/// When unset the service stays open for local dev (with a warning).
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
// Handlers
// ---------------------------------------------------------------------------

async fn health() -> impl IntoResponse {
    Json(OkResponse { ok: true })
}

async fn check(State(state): State<AppState>, Json(req): Json<CheckRequest>) -> impl IntoResponse {
    let now = state.clock.now();

    let mut entry = state.store.entry(req.key).or_insert_with(|| RateLimitEntry {
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
                    retry_after: Some(
                        until.saturating_duration_since(now).as_millis() as u64
                    ),
                }),
            );
        }
        // Block expired — clear it
        e.blocked_until = None;
    }

    // Check if window expired — reset. checked_add: an absurd window_ms can
    // overflow Instant arithmetic and panic (RPF cycle-1 L2); on overflow the
    // window simply never expires (fails stricter, never looser).
    let window_end = e
        .window_started_at
        .checked_add(Duration::from_millis(req.window_ms));
    if window_end.is_some_and(|end| end <= now) {
        e.attempts = 0;
        e.window_started_at = now;
    }

    // Check if at or over limit
    if e.attempts >= req.max_attempts {
        let retry_after = window_end
            .map(|end| end.saturating_duration_since(now).as_millis() as u64)
            .unwrap_or(u64::MAX);
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
    e.attempts = e.attempts.saturating_add(1);
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
    State(state): State<AppState>,
    Json(req): Json<RecordFailureRequest>,
) -> impl IntoResponse {
    let now = state.clock.now();
    let now_unix_ms = state.clock.now_unix_ms();

    let mut entry = state.store.entry(req.key).or_insert_with(|| RateLimitEntry {
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
                    blocked_until: Some(
                        now_unix_ms + until.saturating_duration_since(now).as_millis() as u64,
                    ),
                }),
            );
        }
        // Block expired — clear it
        e.blocked_until = None;
    }

    // Reset window if expired. checked_add: overflow means the window never
    // expires (fails stricter, never looser) instead of panicking
    // (RPF cycle-1 L2).
    let window_expired = e
        .window_started_at
        .checked_add(Duration::from_millis(req.window_ms))
        .is_some_and(|end| end <= now);
    if window_expired {
        e.attempts = 0;
        e.window_started_at = now;
    }

    // Record the failure
    e.attempts = e.attempts.saturating_add(1);
    e.last_attempt = now;

    // Check if threshold reached
    if e.attempts >= req.max_attempts {
        let exp = e.consecutive_blocks.min(MAX_CONSECUTIVE_BLOCKS_EXP);
        let multiplier = 2u64.pow(exp);
        // saturating_mul: an attacker-influenced block_ms times the backoff
        // multiplier must clamp, not overflow-panic (RPF cycle-1 L2).
        let block_duration =
            Duration::from_millis(req.block_ms.saturating_mul(multiplier).min(MAX_BLOCK_MS));
        let blocked_until = now + block_duration;
        e.blocked_until = Some(blocked_until);
        e.consecutive_blocks = e.consecutive_blocks.saturating_add(1);

        return (
            StatusCode::OK,
            Json(RecordFailureResponse {
                blocked: true,
                blocked_until: Some(now_unix_ms + block_duration.as_millis() as u64),
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

async fn reset(State(state): State<AppState>, Json(req): Json<ResetRequest>) -> impl IntoResponse {
    state.store.remove(&req.key);
    Json(OkResponse { ok: true })
}

// ---------------------------------------------------------------------------
// Eviction background task
// ---------------------------------------------------------------------------

fn spawn_eviction_task(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(EVICTION_INTERVAL_SECS));
        loop {
            interval.tick().await;
            let now = state.clock.now();
            let before = state.store.len();
            state.store.retain(|_, entry| {
                // Keep entries that were active within the eviction window
                // or that have an active block
                let active = now.saturating_duration_since(entry.last_attempt)
                    < Duration::from_millis(EVICTION_AGE_MS);
                let blocked = entry
                    .blocked_until
                    .map(|until| until > now)
                    .unwrap_or(false);
                active || blocked
            });
            let evicted = before.saturating_sub(state.store.len());
            if evicted > 0 {
                info!(evicted, remaining = state.store.len(), "eviction sweep complete");
            }
        }
    });
}

fn env_flag(name: &str, default: bool) -> bool {
    match std::env::var(name) {
        Ok(value) => matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        ),
        Err(_) => default,
    }
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
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let host = std::env::var("RATE_LIMITER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("RATE_LIMITER_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let enable_reset = env_flag("RATE_LIMITER_ENABLE_RESET", false);

    let auth_state = AuthState {
        expected: std::env::var("RATE_LIMITER_AUTH_TOKEN")
            .ok()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .map(Arc::new),
    };
    if auth_state.expected.is_none() {
        // SEC H-4 / SEC-21-4: fail-closed by default, regardless of
        // NODE_ENV. /reset is particularly damaging if reachable
        // unauthenticated — anyone on the docker bridge can clear their
        // own login-failure bucket and brute-force without limit. The
        // earlier NODE_ENV gate didn't propagate to the Rust container
        // from a separate compose service, so the gate could be
        // silently bypassed by missing env propagation. Now the only
        // opt-out is the explicit RATE_LIMITER_ALLOW_UNAUTHENTICATED=1
        // flag.
        let allow_unauth = std::env::var("RATE_LIMITER_ALLOW_UNAUTHENTICATED")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if !allow_unauth {
            tracing::error!(
                "RATE_LIMITER_AUTH_TOKEN is not set. Refusing to start. \
                 Set the token, or set RATE_LIMITER_ALLOW_UNAUTHENTICATED=1 if you fully understand the risk."
            );
            std::process::exit(1);
        }
        warn!(
            "RATE_LIMITER_AUTH_TOKEN is not set and RATE_LIMITER_ALLOW_UNAUTHENTICATED=1 — /check, /record-failure, and /reset will accept unauthenticated requests."
        );
    }

    let state = AppState {
        store: Arc::new(DashMap::new()),
        clock: Arc::new(RealClock),
    };

    // Start background eviction
    spawn_eviction_task(state.clone());

    let mut protected = Router::new()
        .route("/check", post(check))
        .route("/record-failure", post(record_failure));

    if enable_reset {
        protected = protected.route("/reset", post(reset));
    }

    let protected = protected
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(middleware::from_fn_with_state(
            auth_state.clone(),
            require_bearer,
        ))
        .with_state(state);

    let app = Router::new().route("/health", get(health)).merge(protected);

    let addr: SocketAddr = format!("{host}:{port}").parse().unwrap_or_else(|_| {
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

    fn test_state(start: Instant, unix_ms: u64) -> AppState {
        test_state_with_clock(start, unix_ms).0
    }

    fn test_state_with_clock(start: Instant, unix_ms: u64) -> (AppState, Arc<ManualClock>) {
        let clock = Arc::new(ManualClock::new(start, unix_ms));
        let state = AppState {
            store: Arc::new(DashMap::new()),
            clock: clock.clone(),
        };
        (state, clock)
    }

    #[tokio::test]
    async fn check_increments_and_blocks_at_limit() {
        let start = Instant::now();
        let state = test_state(start, 1_000_000);

        let first: CheckResponse = decode_json(
            check(
                State(state.clone()),
                Json(CheckRequest {
                    key: "login:user".into(),
                    max_attempts: 2,
                    window_ms: 60_000,
                }),
            )
            .await,
        )
        .await;
        assert!(first.allowed);
        assert_eq!(first.remaining, 1);

        let second: CheckResponse = decode_json(
            check(
                State(state.clone()),
                Json(CheckRequest {
                    key: "login:user".into(),
                    max_attempts: 2,
                    window_ms: 60_000,
                }),
            )
            .await,
        )
        .await;
        assert!(second.allowed);
        assert_eq!(second.remaining, 0);

        let third: CheckResponse = decode_json(
            check(
                State(state),
                Json(CheckRequest {
                    key: "login:user".into(),
                    max_attempts: 2,
                    window_ms: 60_000,
                }),
            )
            .await,
        )
        .await;
        assert!(!third.allowed);
        assert_eq!(third.remaining, 0);
        assert!(third.retry_after.is_some());
    }

    #[tokio::test]
    async fn record_failure_blocks_and_reset_clears_entry() {
        let start = Instant::now();
        let state = test_state(start, 1_000_000);

        let first: RecordFailureResponse = decode_json(
            record_failure(
                State(state.clone()),
                Json(RecordFailureRequest {
                    key: "auth:user".into(),
                    max_attempts: 2,
                    window_ms: 60_000,
                    block_ms: 1_000,
                }),
            )
            .await,
        )
        .await;
        assert!(!first.blocked);
        assert!(first.blocked_until.is_none());

        let second: RecordFailureResponse = decode_json(
            record_failure(
                State(state.clone()),
                Json(RecordFailureRequest {
                    key: "auth:user".into(),
                    max_attempts: 2,
                    window_ms: 60_000,
                    block_ms: 1_000,
                }),
            )
            .await,
        )
        .await;
        assert!(second.blocked);
        assert!(second.blocked_until.is_some());

        let _: OkResponse = decode_json(
            reset(
                State(state.clone()),
                Json(ResetRequest {
                    key: "auth:user".into(),
                }),
            )
            .await,
        )
        .await;
        assert!(state.store.get("auth:user").is_none());

        let after_reset: CheckResponse = decode_json(
            check(
                State(state),
                Json(CheckRequest {
                    key: "auth:user".into(),
                    max_attempts: 2,
                    window_ms: 60_000,
                }),
            )
            .await,
        )
        .await;
        assert!(after_reset.allowed);
        assert_eq!(after_reset.remaining, 1);
    }

    #[tokio::test]
    async fn block_persists_when_system_clock_jumps_backward() {
        // Simulate a backward system-clock jump (e.g., NTP correction) while the
        // monotonic clock keeps advancing normally. The pre-fix implementation
        // used SystemTime for block decisions, so a backward jump would
        // prematurely expire an active block.
        let start = Instant::now();
        let unix_start = 1_000_000_000_000u64;
        let (state, clock) = test_state_with_clock(start, unix_start);

        // Record two failures to trigger a block.
        let _ = record_failure(
            State(state.clone()),
            Json(RecordFailureRequest {
                key: "auth:user".into(),
                max_attempts: 2,
                window_ms: 60_000,
                block_ms: 60_000,
            }),
        )
        .await;
        let second: RecordFailureResponse = decode_json(
            record_failure(
                State(state.clone()),
                Json(RecordFailureRequest {
                    key: "auth:user".into(),
                    max_attempts: 2,
                    window_ms: 60_000,
                    block_ms: 60_000,
                }),
            )
            .await,
        )
        .await;
        assert!(second.blocked);
        assert!(second.blocked_until.is_some(), "block should have expiry");

        // Advance monotonic clock by only 1 second, but jump the system clock
        // backward by 1 hour.
        clock.advance_instant(Duration::from_secs(1));
        clock.set_unix_ms(unix_start - 60 * 60 * 1000);

        let check_after_jump: CheckResponse = decode_json(
            check(
                State(state.clone()),
                Json(CheckRequest {
                    key: "auth:user".into(),
                    max_attempts: 2,
                    window_ms: 60_000,
                }),
            )
            .await,
        )
        .await;
        assert!(
            !check_after_jump.allowed,
            "block must survive a backward system-clock jump"
        );

        // Advance monotonic clock past the block duration.
        clock.advance_instant(Duration::from_secs(70));
        let check_after_expiry: CheckResponse = decode_json(
            check(
                State(state),
                Json(CheckRequest {
                    key: "auth:user".into(),
                    max_attempts: 2,
                    window_ms: 60_000,
                }),
            )
            .await,
        )
        .await;
        assert!(check_after_expiry.allowed, "block should expire by monotonic clock");
    }
}
