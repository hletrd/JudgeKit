# RPF Cycle 4 (Loop Cycle 4/100) — Tracer

**Date:** 2026-04-23
**Base commit:** d4b7a731
**HEAD commit:** d4b7a731
**Scope:** Causal tracing of suspicious flows, competing hypotheses.

## Production-code delta since last review

Only `src/lib/judge/sync-language-configs.ts` changed.

## Causal traces attempted this cycle

### TRACE-1: `SKIP_INSTRUMENTATION_SYNC` end-to-end flow

1. Operator sets `SKIP_INSTRUMENTATION_SYNC=1` in env.
2. `src/instrumentation.ts register()` is invoked by Next.js on process start.
3. `register()` calls `syncLanguageConfigsOnStartup()`.
4. First line of the function logs a `logger.warn(...)` and returns early.
5. `register()` continues to `initializeSettings()`, `startRateLimitEviction()`, etc.
6. Server boot completes without DB access for language-config sync.
7. Judge worker path: when a submission arrives, the API fetches `languageConfigs` from DB. If the sync was skipped and the table was pre-populated by migration, the judge works normally. If the table is empty (fresh install with skip flag), the judge returns 400 "unknown language" — fail-closed.

**Trace verdict:** correct flow, no hidden side effects.

### TRACE-2: Production safety — is the flag reachable in production?

1. `.env.deploy.algo` is the production env file (checked into repo).
2. Confirmed the flag is **not** defined in `.env.deploy.algo`.
3. `deploy.sh` `set -a && source .env.deploy.algo` would not add the flag.
4. Environment variables are passed through Docker env — only vars explicitly listed in `docker-compose.production.yml` reach the container.
5. Confirmed `SKIP_INSTRUMENTATION_SYNC` is not in the docker-compose production config.

**Trace verdict:** production is not reachable by this flag. Safe.

## Re-sweep findings (this cycle)

**Zero new findings.**

No suspicious flow surfaced in this cycle's trace.

## Recommendation

No action this cycle.
