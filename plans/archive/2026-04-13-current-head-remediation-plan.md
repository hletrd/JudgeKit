# Implementation plan — current-head remediation (reopened 2026-04-13)

## Source review set
- `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md`
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`

## Reopen reason
The earlier 2026-04-13 acceptance note is now superseded by a newer user directive to fix the issues rather than merely accept the current posture.

## Workstream A — Role-model and custom-role correctness
**Targets**
- user create/update API routes
- user-management server actions
- admin user dialogs/pages
- contest/group page entrypoints and helpers that still assume built-in roles only

**Acceptance criteria**
- custom roles can be created, assigned, updated, and persisted through supported user-management surfaces
- page-level contest/group views no longer crash on custom-role sessions
- capability-aware paths are used where custom roles are expected

**Progress**
- ✅ completed 2026-04-13
- user create/update API routes now validate custom roles at runtime instead of hard-coding the built-in enum only
- user-management server actions now persist validated custom roles instead of forcing built-in-only assertions
- affected contest/group dashboard pages no longer crash on custom-role sessions because the built-in-only `assertUserRole(...)` path was removed
- contest discovery now uses capability-aware branching for custom roles and includes co-instructor-backed ownership lookup
- coverage: targeted user/core, user route, user-management action, contest helper, and implementation-guard tests

## Workstream B — Chat transcript integrity and admin chat-log correctness
**Targets**
- chat widget route/client logging contract
- admin chat-log session listing query and transcript retrieval semantics
- tool-layer assignment metadata access checks

**Acceptance criteria**
- client cannot suppress or forge authoritative transcript history
- admin session index works on PostgreSQL and previews earliest message correctly
- tool outputs do not leak assignment metadata outside authorized scope

**Progress**
- ✅ completed 2026-04-13
- removed the client-controlled `skipLog` escape hatch from the effective server contract
- server now persists authoritative assistant output from the generated stream instead of trusting replayed client history
- admin chat-log session listing now uses a PostgreSQL-safe session-bounds / first-message query instead of invalid grouped non-aggregates and lexicographic `min(content)`
- `get_assignment_info` now checks assignment/group/recruiting scope before returning metadata
- coverage: targeted admin chat-log, chat route, and chat-tool tests

## Workstream C — Realtime/runtime/deploy correctness
**Targets**
- SSE shared-slot lifecycle
- production upload persistence path
- docker-proxy permissions vs documented/admin-supported image management
- truth-sync across env examples and runtime docs

**Acceptance criteria**
- shared coordination does not leak slots on terminal-response path
- production deployment preserves uploaded files across container replacement
- admin image-management chain is either supported end-to-end or truthfully constrained
- docs/env examples match actual runtime contract

**Progress**
- ✅ completed 2026-04-13
- fixed the shared-coordination leak on the terminal submission SSE path
- production compose now mounts a dedicated app-data volume so uploaded files survive container replacement
- production and dedicated-worker docker-proxy configs now enable image/build endpoints expected by the admin image-management surfaces
- env examples now describe the real process-local vs PostgreSQL-backed coordination modes
- coverage: targeted realtime implementation-guard and deploy-security tests

## Workstream D — Similarity engine parity
**Targets**
- TS and Rust normalizers
- inline `#` comment handling
- parity/regression tests

**Acceptance criteria**
- TS fallback and Rust sidecar produce the same normalization semantics on shared fixtures
- inline `#` comment churn no longer trivially evades normalization for supported language families

**Progress**
- ✅ completed 2026-04-13
- Rust and TypeScript now preserve identifier casing consistently instead of lowercasing only in the sidecar
- both implementations now treat inline `#` comments as comments unless they are line-start preprocessor directives
- coverage: targeted Vitest similarity suites plus `cargo test --manifest-path code-similarity-rs/Cargo.toml`

## Workstream E — Current-head hardening follow-through
**Targets**
- implement any concrete, code-level improvements still feasible from the current-head multi-perspective/adversarial plans while the above workstreams are touched
- keep docs/ops surfaces honest if any accepted posture remains after code changes

**Acceptance criteria**
- remaining current-head criticism is either fixed or explicitly reduced to a genuinely external prerequisite

**Progress**
- ✅ completed 2026-04-13
- revalidated the already-landed recruiting identity, recruiting isolation, retention, anti-cheat evidence-model, and worker-boundary operator docs against the current code/tests
- confirmed the remaining higher-assurance asks are now explicit external prerequisites (for example stronger out-of-band identity factors and live failover/load rehearsal) rather than missing repository-local fixes
- coverage: targeted recruiting-token, recruiting component, rankings, retention-maintenance, and high-stakes documentation/runtime tests
- post-remediation follow-up: added a UI i18n literal-key audit test and filled the missing database-backup / recruit resume-session locale entries in both `en` and `ko`
- post-remediation UI sweep: removed the remaining reviewed hardcoded English strings from dashboard error/not-found views, lecture-mode surfaces, anti-cheat warnings, copy-code aria labels, and language-selector fallbacks

## Verification matrix
- per-slice: targeted `pnpm -s tsc --noEmit`, targeted Vitest, targeted eslint
- final: broader unit/component suites plus any relevant Rust tests and a final plan-status pass
