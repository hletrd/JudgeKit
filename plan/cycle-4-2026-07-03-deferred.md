# Cycle 4 (2026-07-03) Deferred Findings

The following findings are acknowledged but deferred out of Cycle 4 implementation. They are out of scope because this cycle is focused on the CRITICAL and HIGH security, correctness, and test-coverage findings scheduled in `cycle-4-2026-07-03-review-remediation.md`. Medium findings related to those high-priority items are co-implemented in Phase A (e.g., C4-049 with C4-031, C4-056/C4-057 with C4-011, C4-066/C4-067 with their respective HIGH findings).

## Deferred CRITICAL/HIGH Phase A Items

The following Phase A items were intentionally deferred to Cycle 5. They are either architectural-scale changes that cannot be safely rushed, or their acceptance criteria are only partially met and completing them requires cross-service coordination.

| ID | Title | Current State | Rationale | Exit Criteria |
|---|---|---|---|---|
| C4-US-006 | Internal Service Encryption | Not started | mTLS/TLS between app, worker, sidecar, and compiler requires CA certificate lifecycle and compose/network updates. | Internal HTTP clients require HTTPS; compose mounts service certificates; clients reject untrusted or missing certificates; connectivity tests reject plaintext HTTP. |
| C4-US-008 | Raw SQL Schema Patch Governance | Partially mitigated | `ALLOW_SECRET_TOKEN_BACKFILL=1` guard exists, but the raw SQL block remains in `deploy-docker.sh` instead of the Drizzle migration journal. | Move the backfill/drop into the Drizzle journal or confirm the deprecated column is absent in all environments; add an infra test that asserts no untracked raw SQL migration block runs by default. |
| C4-US-009 | Real-Time Coordination Lock Bottleneck | Not started | `acquireSharedSseConnectionSlot` uses a single global PostgreSQL advisory lock that serializes every SSE acquisition. | Replace the global lock with per-resource advisory locks (keyed by `resourceType:resourceId`) or a Redis-backed coordination layer; preserve slot exclusivity under concurrency; add a load benchmark and concurrent acquisition regression test. |
| C4-US-010 | Docker Socket Proxy Privileges | Not started | `docker-compose.production.yml` and `docker-compose.worker.yml` still grant `POST`, `DELETE`, `ALLOW_START`, and `ALLOW_STOP` to the socket proxy. | Restrict the proxy to read-only endpoints required by the app/worker; document the minimal permission set; add a compose-render test that rejects mutable socket-proxy permissions. |
| C4-US-011 | Deploy Script Modularity, Atomicity, and Safety | Not started | `deploy-docker.sh` remains a monolithic script with no per-phase rollback, deploy mutex, or canary smoke-test gating. | Decompose into phase scripts under `scripts/deploy/`; implement per-phase rollback; add a deploy mutex; gate traffic switch on canary smoke tests; upsert all required worker tokens; `shellcheck` passes. |
| C4-US-012 | Rate-Limiting Single Source of Truth | Not started | The rate-limiter sidecar and the Node app each maintain independent counters, so attempts can be double-counted or lost when the sidecar blocks. | Make PostgreSQL the authoritative counter; sidecar checks and caches only; remove duplicate increments; add consistency tests comparing sidecar verdicts against DB state. |
| C4-US-014 | Admin Restore/Import Security and Streaming | Partially mitigated | `preRestoreSnapshotPath` is removed from API responses and backup uploads stream, but the ZIP restore path buffers the entire archive in memory. | Stream uploaded backup files (including ZIP) to disk in chunks; add a memory-usage regression test or assertion for large restore payloads. |
| C4-US-015 | Language Configuration Contract | Not started | There is no generated language manifest; TypeScript, Rust, and database representations can drift. | Define a single source-of-truth manifest; derive TypeScript constants, Rust enums, and database enum constraints from it; update `scripts/sync-language-configs.ts` to fail on drift; add a CI check. |
| C4-US-016 | Function Judging Literal Validation | Partially mitigated | `serialization.ts` rejects unsafe integers and malformed input, but per-language type-range validation is missing. | Validate function-judging literals against the target language's type ranges and formats before passing them to the runner; add per-language boundary and invalid-literal tests. |
| C4-US-020 | Judge Claim Heartbeat Integrity | Partially mitigated | The claim token embeds a creation timestamp that caps total claim duration, but in-progress reports still refresh `judgeClaimedAt`. | Separate the in-progress report path from the heartbeat path; progress reports update submission status only; only dedicated heartbeat calls extend the claim deadline; add regression tests. |
| C4-US-021 | Cancellable Rust Sidecar Compute | Not started | `code-similarity-rs/src/main.rs` runs the CPU-intensive similarity computation in `tokio::task::spawn_blocking` without a cancellation token. | Make the `spawn_blocking` task abort-aware using a cancellation token or `tokio::select!`; propagate cancellation when the HTTP client disconnects; add tests that verify CPU usage drops after request cancellation. |
| C4-US-022 | Migration and Test Backend Script Security | Partially mitigated | `deploy-docker.sh` post-backfill assertions were hardened, but `deploy-test-backends.sh` still uses unpinned `npm install --no-save drizzle-kit ...` and hard-coded fallback passwords. | Pin migration-container dependencies; remove the `judgekit_test` fallback password; add an explicit production guard preventing the test-backend script from stopping the production compose stack; validate `rm -rf` targets. |
| C4-US-023 | Docker Build Timeout Cleanup | Partially mitigated | `buildDockerImageLocal` kills the `docker build` process on timeout, but does not prune the associated BuildKit build record and has no regression test. | Prune the BuildKit build record on timeout; return a structured timeout error code; add a regression test that simulates a slow build and confirms no orphan process remains. |

## MEDIUM Findings

| ID | Title | Rationale |
|---|---|---|
| C4-035 | CSRF check performs a database read on every mutation | Performance optimization; can be addressed by caching `allowedHosts` in the existing settings cache. Requires careful invalidation testing and is not a security defect. |
| C4-036 | Shell validators wrap commands in `sh -c` and prefix whitelist is bypassable | Defense-in-depth issue; the Docker sandbox is the primary isolation boundary. A full allow-list of command templates is a larger refactor that should not be rushed. |
| C4-037 | Environment integer parsing accepts malformed strings (`"10abc"` → `10`) | Configuration-hardening issue; affects multiple parsers and should be centralized in a single validation helper rather than fixed piecemeal. |
| C4-038 | `system_settings` cache can return stale values during background reload | Cache-consistency issue; requires atomic swap or await-on-miss design. Risk is limited to brief inconsistency across instances. |
| C4-039 | Configuration resolution scattered across env, DB, and hardcoded defaults | Large architectural refactor to a single generated settings schema and `/admin/effective-config` endpoint. Best handled in a dedicated settings-consistency cycle. |
| C4-040 | Middleware performs DB lookups in the Edge Runtime | Architectural move of active-user lookup out of middleware; touches auth flow and caching and should be validated with edge-runtime tests. |
| C4-041 | No API versioning strategy beyond `/api/v1` path prefix | Product-level decision needed on URL vs. header versioning, deprecation policy, and client communication. |
| C4-042 | Distributed request ID is not propagated to all internal services | Cross-cutting logging change; requires AsyncLocalStorage plumbing and Rust-side header handling. Should be bundled with observability work. |
| C4-043 | `system_settings`-dependent session `maxAge` captured at module load | Requires per-request or per-token TTL resolution in NextAuth; tied to C4-038/C4-039 settings refactor. |
| C4-044 | Compiler workspace-cleanup regression tests never run both root and non-root paths in one CI job | Test-infrastructure gap; the non-root paths are covered by C4-US-001 and C4-US-002, but a CI matrix running both uid modes is follow-on work. |
| C4-045 | Compiler execute runtime paths are not exercised | Requires Docker-in-CI or a mocked fetch harness for Rust runner fallback and OOM inspection paths. |
| C4-046 | IP extraction tests do not cover consumer integration | Integration-level test for rate limiter and judge allowlist; most valuable after C4-US-007 (judge allowlist) is in place. |
| C4-047 | Generated nginx config is not rendered and syntax-checked | Requires `nginx -t` availability in CI or a test container; infra-test enhancement deferred. |
| C4-048 | Race-condition coverage is mostly source-grep | Needs Postgres integration tests (C4-US-028 foundation) and a parallel-request harness. |
| C4-050 | Deployment env-var reference omits operational/security variables | Documentation-only; can be batched with C4-039 settings refactor and C4-US-011 deploy-script decomposition. |
| C4-051 | Docker Compose lacks explicit bridge isolation from host networks | Network-hardening item; depends on production network review and should not be changed without infra validation. |
| C4-052 | No documented operational rollback runbook | Documentation/runbook task; depends on C4-US-011 deploy-script decomposition. |
| C4-053 | Judge worker IP allowlist auto-population is missing | Deployment automation enhancement; closely related to C4-US-007 but lower priority than making the allowlist fail-closed. |
| C4-054 | Global pending-queue cap checked without a global lock | Concurrency correctness; requires advisory-lock or atomic approach in the queue logic and should be validated under load. |
| C4-055 | `releaseSharedSseConnectionSlot` deletes rows without advisory lock | Related to C4-US-009 real-time coordination redesign; fixing the acquisition lock alone is not enough, so it is deferred to the same architectural change. |
| C4-058 | `/api/v1/compiler/run` has no overall request timeout | Add timeout composition around runner fetch; medium risk because individual runner paths already have limits. |
| C4-059 | Rust runner `/run` does not check `docker_capability_ok` | Add capability check at runner entry; straightforward but requires test updates and should be bundled with runner hardening. |
| C4-060 | Per-user failure limiter runs before per-code limiter | Rate-limit ordering fix; related to C4-US-012 and contest-join tests, but lower severity than the single-source-of-truth work. |
| C4-061 | Failure-rate-limit buckets never reset on successful redemption | Logic fix in rate-limit store; requires migration/reset strategy and should be bundled with C4-US-012. |
| C4-062 | Missing/short XFF collapses traffic into `api:*:unknown` bucket | Operational config issue; depends on `TRUSTED_PROXY_HOPS` discipline addressed in C4-US-024. |
| C4-063 | Raw CTE query is not abort-aware | Add `AbortSignal` propagation to the CTE query; requires query refactor and should be validated with a slow-query abort test. |
| C4-064 | Advisory lock covers only delete+insert store, not read+compute | Related to C4-US-009; the read+compute phase needs the same coordination redesign. |
| C4-065 | Capability check precedes group-TA check | Authorization ordering; may be intentional policy. Needs product confirmation before reordering guards. |
| C4-068 | Runner HTTP server aborted during shutdown without draining | Rust worker shutdown behavior; requires graceful drain and shutdown tests. |
| C4-071 | No `stop_grace_period` in compose | One-line change; low risk but should be validated with shutdown tests to avoid truncating long-running judges. |
| C4-075 | `withTimeout` can leak timers | API-design improvement; known call sites are currently safe. Should be hardened when the utility is next refactored. |
| C4-076 | `normalizeSource` leaks truncated string content | Similarity-normalizer correctness; affects scoring but not security. Should be fixed alongside similarity-sidecar improvements. |
| C4-077 | Uploads directory created with overly permissive default mode | One-line `mode: 0o700` change; low risk, can be batched with file-storage hardening. |
| C4-078 | `cleanupOldEvents` batch DELETE may not honor LIMIT | SQL change to use `FOR UPDATE SKIP LOCKED` or `ctid` loop; correctness issue but not user-facing. |

## LOW Findings

| ID | Title | Rationale |
|---|---|---|
| C4-079 | E2E test suite contains many environment-dependent skips | Test observability; add skip-threshold summary in CI. Not a product defect. |
| C4-080 | Component tests do not reset global mocks/stubs after each test | Add `vi.clearAllMocks()` / `vi.unstubAllGlobals()` to `tests/component/setup.ts`. Test hygiene only. |
| C4-081 | Inconsistent route-test naming | Naming convention; can be enforced incrementally with lint rules. |
| C4-082 | `callWorkerJson` JSON parse failure throws generic error | Structured error code for worker JSON failures; minor diagnostic improvement. |
| C4-083 | `normalizeSource` strips `#` lines that are not C preprocessor directives | Similarity-normalizer language scope; affects languages where `#` begins comments. |
| C4-084 | Returned `blocked_until` can drift if system clock steps backward | Rate-limiter timestamp consistency; sidecar already uses monotonic `Instant` for internal logic. |
| C4-085 | Docker build context includes entire repo root | Restrict context path to `docker/`; build-performance and security hygiene. |
| C4-086 | Test and production Docker networks differ in topology | Provide local production-topology compose; dev-experience improvement. |
| C4-087 | Static-site nginx decoupled from app security headers | Unify headers in shared include; consistency improvement. |
| C4-088 | Worker prewarming fires uncontrolled `docker run` commands | Add concurrency cap and status logging; operational improvement. |
| C4-089 | Schema enum columns lack database CHECK constraints | Add Drizzle `check` constraints; data-integrity improvement. |
| C4-090 | Build-phase DB connection uses dummy connection string | Build a stub drizzle instance without parsing connection string; build-time robustness. |

## Next-Cycle Candidates

The highest-value deferred items to pull into Cycle 5 are:

1. **C4-035** + **C4-038** + **C4-039** + **C4-043** — settings/cache consistency and centralized configuration.
2. **C4-008** + **C4-055** + **C4-064** — replace PostgreSQL advisory-lock coordination for real-time and similarity paths.
3. **C4-010** + **C4-069** + **C4-074** — decompose monolithic deploy script and add rollback/mutex (architectural completion of C4-US-011).
4. **C4-011** + **C4-056** + **C4-057** — single source of truth for rate limiting (if not fully resolved by C4-US-012).
5. **C4-002** — encrypt internal service traffic with mTLS/TLS (if not fully resolved by C4-US-006).
6. **C4-009** — restrict Docker socket proxy privileges (if not fully resolved by C4-US-010).
7. **C4-015** — generated language-config contract (if not fully resolved by C4-US-015).
8. **C4-040** — move DB lookups out of Edge middleware.
9. **C4-042** — propagate request ID across all internal services.
10. **C4-077** + **C4-089** — filesystem/DB permission hardening.
