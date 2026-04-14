# High-stakes validation matrix

_Last updated: 2026-04-14_

This matrix defines the minimum evidence JudgeKit should gather before changing any GO/NO-GO statement for formal exams or public/high-stakes contests.

## Required validation lanes

### 1. Runtime topology validation
- Explicitly declare `APP_INSTANCE_COUNT` or `REALTIME_SINGLE_INSTANCE_ACK`
- If running more than one app instance, require `REALTIME_COORDINATION_BACKEND=postgresql`
- Require `COMPILER_RUNNER_URL`
- Keep `ENABLE_COMPILER_LOCAL_FALLBACK=0`
- Run: `bash scripts/check-high-stakes-runtime.sh`

### 2. Realtime load validation
- Concurrent SSE connection-cap enforcement under realistic user load
- Anti-cheat heartbeat deduplication under multi-instance routing
- Sticky-session / load-balancer behavior verified in the real target topology
- **Evidence**: reproduce via `npm run test:integration` against a multi-instance staging environment; document connection-count observations in a deployment-specific evidence file

### 3. Recovery / failover rehearsal
- Reclaiming and requeue behavior verified for worker failure
- App restart during active judging reviewed
- Operator runbook reviewed for worker incidents
- **Evidence**: trigger a worker kill during active judging and confirm requeue via audit logs; capture screenshots or log excerpts as evidence

### 4. Assessment-integrity review
- Anti-cheat wording reviewed and accepted — telemetry is explicitly presented as review aids, not proof (see anti-cheat dashboard disclaimers)
- Evidence model reviewed against the target institution/employer policy
- Any stronger proctoring or operational controls documented if required
- **Limitation**: JudgeKit's anti-cheat signals are low-confidence telemetry; formal exams requiring proctor-grade integrity must add separate operational controls

### 5. Retention / governance review
- Retention windows explicitly approved for the target deployment (see `DATA_RETENTION_DAYS` in `src/lib/data-retention.ts`)
- Transcript access and handling rules reviewed — access is audit-logged under `chat_log.session_viewed`
- Export/archive requirements reviewed before relying on automated deletion
- Legal hold mechanism available via `DATA_RETENTION_LEGAL_HOLD=true` environment variable
- Sanitized exports (credentials redacted) available via the migrate/export endpoint; full-fidelity backups use the dedicated backup endpoint

### 6. CI verification evidence
- CI runs unit, component, integration, and coverage-threshold enforcement
- E2E Playwright suite passes in full-regression mode locally
- Remote deployments validated with smoke profile (`PLAYWRIGHT_PROFILE=smoke`)

## Output expectation
A deployment should not call itself exam-ready or public-contest-ready unless every lane above has explicit recent evidence, not just code changes. Evidence should be stored in a deployment-specific file (e.g., `.sisyphus/evidence/`) and reviewed before each high-stakes event.
