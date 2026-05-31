/**
 * Validates production-required configuration at process startup.
 *
 * Called from `src/instrumentation.ts` during Next.js boot. In production
 * (NODE_ENV=production), missing secrets cause the process to exit with a
 * clear error so the operator notices before traffic flows. In development
 * we only warn so devs can run without setting up every sidecar.
 *
 * Add to this list any new env var that production deployments must have set.
 */
const PRODUCTION_REQUIRED_ENV_VARS: ReadonlyArray<{
  name: string;
  reason: string;
}> = [
  {
    name: "CRON_SECRET",
    reason:
      "Required for /api/metrics cron-authenticated scrapes. Without it the metrics endpoint cannot serve Prometheus and the operator cannot detect worker / queue / DB anomalies.",
  },
  {
    name: "CODE_SIMILARITY_AUTH_TOKEN",
    reason:
      "Required for the code-similarity Rust sidecar. Without it the sidecar runs unauthenticated on the Docker network and any container on the bridge can submit similarity queries.",
  },
  {
    name: "RATE_LIMITER_AUTH_TOKEN",
    reason:
      "Required for the rate-limiter Rust sidecar. Without it any container on the Docker network can consume rate-limit quota for arbitrary keys (e.g., locking out a specific account).",
  },
  {
    name: "NODE_ENCRYPTION_KEY",
    reason:
      "Required for AES-256-GCM encryption of stored secrets (SMTP password, hCaptcha secret, API keys). Without it the app boots but throws the moment any secret is read or written — surfacing as a runtime 500 instead of a clear startup failure. Must be a 32-byte (64-char) hex string: openssl rand -hex 32.",
  },
];

/**
 * Recommended-but-not-required production hardening settings. Unlike the list
 * above, a missing entry here only logs a warning at startup — it never exits
 * the process — because each has a safe (if less hardened) default, so forcing
 * it would needlessly break otherwise-valid deployments.
 */
const PRODUCTION_RECOMMENDED_ENV_VARS: ReadonlyArray<{
  name: string;
  reason: string;
}> = [
  {
    name: "JUDGE_ALLOWED_IPS",
    reason:
      "Recommended defense-in-depth for the judge result endpoint: a comma-separated IP/CIDR allowlist of your judge worker hosts. The endpoint is already worker-auth + claim-token bound, so verdicts cannot be forged without it, but an allowlist further limits which hosts may POST results. Unset means any host that obtains the worker token is accepted.",
  },
];

export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const recommendedUnset = PRODUCTION_RECOMMENDED_ENV_VARS.filter((entry) => {
    const value = process.env[entry.name];
    return value === undefined || value === "";
  });

  if (recommendedUnset.length > 0) {
    console.warn(
      "[startup] Recommended production hardening settings are unset (non-fatal):\n" +
        recommendedUnset.map((m) => `  - ${m.name}: ${m.reason}`).join("\n"),
    );
  }

  const missing = PRODUCTION_REQUIRED_ENV_VARS.filter((entry) => {
    const value = process.env[entry.name];
    return value === undefined || value === "";
  });

  if (missing.length === 0) {
    return;
  }

  const message =
    "[startup] Missing required production environment variables:\n" +
    missing.map((m) => `  - ${m.name}: ${m.reason}`).join("\n") +
    "\n\nGenerate each missing secret with `openssl rand -hex 32` and add to `.env.production` before redeploying.";

  console.error(message);
  // Exit non-zero so the supervisor/PM2/systemd unit notices and surfaces an alert.
  // Throwing also works in Next.js's instrumentation hook but exit is more explicit.
  process.exit(1);
}
