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
];

export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
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
