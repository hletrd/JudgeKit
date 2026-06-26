# Cycle 3 Aggregate Review

Date: 2026-06-27
Repository: `/Users/hletrd/flash-shared/judgekit`
Head: `207623f9` (post cycle-2 Phase A + C2-H7 revert)
Prior: cycle-1 and cycle-2 aggregates preserved in git history; per-agent files overwritten with cycle-3 reviews.

## Fan-Out Status

All 11 dispatched review agents completed successfully (no failures, no retries). Per-agent files live alongside this one. **`perf-reviewer` was not a registered agent this session** — the performance lane was covered by `architect.md` ("PERFORMANCE lane" section), which re-confirmed all 7 PERF items (AGG-36..40, F-1) by direct Read.

- `code-reviewer.md` — 0 CRITICAL + 1 HIGH (C3-N1) + 4 MEDIUM + 4 LOW
- `security-reviewer.md` — 1 HIGH (C3-1/AGG-2) + 3 MEDIUM + 6 LOW
- `architect.md` — REG-1 (clean), REG-2 (drift), REG-3 (proxy-trust); design sketches for AGG-1/2/10/14, NEW-M2/M7/M8, C2-H7; perf lane
- `critic.md` — VERDICT: REVISE; C2-H7 verification now satisfied; NEW-M3 promotion
- `debugger.md` — R1..R4 residuals; F1/F3/R5/N3 still open; A1/A7/A11 confirmed-fixed
- `designer.md` — REG-2 FIXED; AGG-56 INVALIDATED; AGG-58..62 + UI-1..13 (P1/P2 polish)
- `document-specialist.md` — DOC-2/DOC-3 (HIGH) snapshot false-fidelity; AGG-51/52 (MED); C3-D1/D2 (LOW)
- `test-engineer.md` — NEW-1 migrate-import 0 tests; NEW-4 worker timeout 0 coverage; PB-1 STILL OPEN
- `tracer.md` — F1-1 CLOSED; F2 (SSE) open; F3/F4 defense-in-depth; F5 (recruiting) NOT REAL; F6 (claim) config-gated
- `verifier.md` — 13/13 VERIFIED; APPROVE; C2-H7 verified-safe (8 nginx overwrite locations)
- `feature-dev-code-reviewer.md` — 5/5 fixes correct; NEW-1 runner.rs 0o777 (MEDIUM); AGG-15 still highest-impact

No agent failures this cycle.

---

## VALIDATED THIS CYCLE (multi-agent convergence is load-bearing)

The CRITICAL/HIGH findings below were each confirmed by direct Read of the cited lines by ≥1 agent, and the cross-agent convergences are flagged.

---

## CRITICAL (must fix this cycle)

*None identified this cycle.* No agent produced a CRITICAL-at-HIGH-confidence finding.

---

## HIGH (schedule this cycle — pre-validated, contained fixes)

### C3-AGG-1 / NEW-M3 / C3-N2 / C3-2 — Contest export JSON path serves PII with NO audit (3-agent convergence + production UI exploit)
**Source:** code-reviewer C3-N2 · security-reviewer C3-2 · critic finding #2 · **Validated:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:58,113-125`; call site `src/components/contest/recruiter-candidates-panel.tsx:51`
`isDownload = download==="1" || format==="csv"` (L58). The JSON branch audit is wrapped in `if (isDownload)` (L113). The recruiter-candidates-panel UI fetches `?format=json` with NO `&download=1`, so EVERY recruiter-candidate-panel view returns full PII (names, usernames, classNames, IP addresses at L109) with **zero audit trail**. CSV path always audits (L180) because `format==="csv"` forces `isDownload=true`. The audit-by-`isDownload` heuristic catches the wrong thing — programmatic `fetch()` callers never set `download=1`. Exit criterion from prior plan ("every PII export audited") is not met.
**Fix:** Move `recordAuditEvent` (prefer `recordAuditEventDurable`) out of the `if (isDownload)` block in the JSON branch — audit whenever PII is serialized. Negative test: `GET ?format=json` (no `download=1`) → audit row present.

### C3-AGG-2 / NEW-M6 / C3-N4 — `roles` PATCH lateral cap-stripping of higher-privilege custom roles
**Source:** code-reviewer C3-N4 · **Validated:** `src/app/api/v1/admin/roles/[id]/route.ts:69-114`
Four guards exist (super_admin immutable L72-74; builtin level immutable L78-80; `updates.level ≤ creatorLevel` L83-86; actor cannot ADD caps they lack L92-99). MISSING: an actor may REMOVE any capability from a role whose CURRENT level exceeds their own — the `added` filter (L94) gates adds but not removals. A level-5 admin PATCHes a level-7 custom role with `{level:5, capabilities:[]}`, passing all 4 checks (level 5≤5; empty array adds nothing), silently demoting + stripping the higher-priv role.
**Fix:** Add `if (role.level > creatorLevel) return apiError("cannotEditHigherRole", 403);` before any mutation (analogue of api-keys' `canManageRoleAsync` gate). Test: level-5 admin PATCHing a level-7 role → 403.

### C3-AGG-3 / C3-N1 — `updateRecruitingInvitation` metadata merge clobbers atomic brute-force counter
**Source:** code-reviewer C3-N1 · **Validated:** `src/lib/assignments/recruiting-invitations.ts:393-429`
`updateRecruitingInvitation` does a plain `db.select` (L393-397) with NO tx and NO `FOR UPDATE`, builds a merged object that preserves `_sys.*` keys (L402-408), then writes the whole metadata object back (L426-429). Concurrent `incrementFailedRedeemAttempt` (L96-115, correctly atomic `jsonb_set`) running between SELECT and UPDATE is clobbered by the stale snapshot. Repeated admin-edit/brute-force overlaps reset the counter indefinitely, defeating the `MAX_FAILED_REDEEM_ATTEMPTS=5` lockout. (Note: NEW-M7 itself — the brute-force race — is RESOLVED; this is a *different* race in the sibling metadata-edit path.)
**Fix:** Wrap SELECT+merge+UPDATE in `db.transaction` with `.for("update")` so the row lock serializes against the atomic `jsonb_set` increments. Test: concurrent metadata-edit + increment → counter not regressed.

---

## MEDIUM (do this cycle — small, pre-validated)

### C3-AGG-4 / REG-2 — Community scope centralization half-done (2-agent)
**Source:** architect REG-2 · critic finding #2 (minor) · **Validated:** `src/lib/discussions/permissions.ts:11-37` (helper); `src/app/api/v1/community/threads/route.ts:18-31`, `community/votes/route.ts:62-76` (inline)
Only `community/threads/[id]/posts/route.ts:40-47` calls `canAccessProblemScopedThread`. The create-thread and vote routes inline `isProblemLinkedScope + canAccessProblem` directly — the same drift surface that caused C2-H5 (editorial scope missing from inline enumerations). Functionally equivalent today, but the next change to the helper will silently diverge across surfaces.
**Fix:** Route `threads/route.ts` and `votes/route.ts` through `canAccessProblemScopedThread`. Mechanical.

### C3-AGG-5 / feature-dev NEW-1 — `runner.rs` workspace hardcoded 0o777 (missed sibling of cycle-1 hardening)
**Source:** feature-dev-code-reviewer NEW-1 · **Validated:** `judge-worker-rs/src/runner.rs:805-816, 829-839`
The runner sidecar (in-browser compiler/test `/run` endpoint) still sets `0o777` workspace + `0o666` source with no `chown`. Cycle 1 hardened `executor.rs` and `execute.ts` to chown-then-0o700; runner.rs was missed. On `RUNNER_ENABLED=true` (default), every interactive compiler run leaves user source world-r/w for the docker-run window — co-tenant TOCTOU.
**Fix:** Replicate the `executor.rs` pattern: `chown` to `65534:65534` first, then `0o700` on success / `0o777` on Err; source file `0o600`/`0o666`. ~15 lines.

### C3-AGG-6 / NEW-M2 / C3-N5 — SSE re-auth checks identity, not authorization (5-agent convergence)
**Source:** code-reviewer C3-N5 · critic #5 · debugger F3 · tracer F2 · security C3-6 · **Validated:** `src/app/api/v1/submissions/[id]/events/route.ts:459-475`
The periodic 30s re-auth IIFE calls `getApiUser` and compares `reAuthUser.id !== viewerId` only. It does NOT re-run `canAccessSubmission` (the stream-open gate at L334). A user removed from a group or downgraded mid-stream keeps receiving status/result events until session deactivation (~5 min). (Architect's "CLOSE" recommendation is overridden by 5-agent agreement that the re-auth checks the wrong thing.)
**Fix:** In the re-auth IIFE, after the identity check, re-run `canAccessSubmission(submission, reAuthUser.id, reAuthUser.role)`; `close()` on failure.

### C3-AGG-7 / NEW-M5 / C3-N3 — `admin/settings` PUT no password re-confirmation
**Source:** code-reviewer C3-N3 · security C3-3 · **Validated:** `src/app/api/v1/admin/settings/route.ts:37-148`
Settings PUT mutates `platformMode`, `allowedHosts`, rate-limit ceilings, `publicSignupEnabled`, `hcaptchaSecret` with no password re-confirmation. Sibling destructive routes (restore L50-62, migrate/import L58-71, backup L54-66) all require `verifyAndRehashPassword` first. Stolen session cookie silently weakens posture.
**Fix:** Extend the `verifyAndRehashPassword` wrapper to settings PUT (at minimum for `allowedHosts`, `signupHcaptchaEnabled`, `publicSignupEnabled`, rate-limit fields).

### C3-AGG-8 / AGG-14 — deploy-docker.sh topology defaults invert CLAUDE.md (architect candidate)
**Source:** architect §2.4 · code-reviewer Phase B · **Validated:** `deploy-docker.sh:119-123,184-187`
Bare `./deploy-docker.sh` sources only `.env.deploy` and defaults `INCLUDE_WORKER=true`, `BUILD_WORKER_IMAGE=auto`, contradicting CLAUDE.md (algo.xylolabs.com app server must use `INCLUDE_WORKER=false, BUILD_WORKER_IMAGE=false, SKIP_LANGUAGES=true`). Per-target files `.env.deploy.algo`/`.worv`/`.auraedu` exist with correct values but are never sourced.
**Fix:** 3-line `--target=` sourcing: after `. .env.deploy`, source `.env.deploy.${DEPLOY_TARGET}` when provided.

### C3-AGG-9 / AGG-15 — Panicked executor leaves submission stuck (highest-impact worker item)
**Source:** feature-dev AGG-15 · **Validated:** `judge-worker-rs/src/main.rs:489,545-552`
No `catch_unwind` in the spawned executor body. A panic bypasses `active_tasks.fetch_sub` (capacity drift) AND `report_with_retry` (no verdict, no dead-letter). Submission stuck in `judging` until `staleClaimTimeoutMs` (5 min).
**Fix:** Wrap body in `AssertUnwindSafe(...).catch_unwind()`; on Err, dead-letter + decrement `active_tasks`. ~5 lines + dead-letter fallback.

---

## LOW (cheap — ride along this cycle)

- **C3-N6** `freezeLeaderboardAt` not stripped from assignment GETs for non-managers (code-reviewer). Cycle-2 plan A5 said omit it; impl only stripped `accessCode`. Strip or document as intentional. `src/app/api/v1/groups/[id]/assignments/route.ts:80-84`.
- **C3-N7** accepted-solutions `total` overcounts (code-reviewer). Add `eq(users.shareAcceptedSolutions, true)` to count WHERE. `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:48-52`.
- **AGG-17 (worker side)** log a `warn!` when `MAX_TIME_LIMIT_MS` clamps (feature-dev). UI validator mitigates the common path (authoring capped at 10s); the worker-side warn is the cheap debuggability fix. `judge-worker-rs/src/executor.rs:534-535`.
- **PB-1** user-deletion audit test name is factually wrong post-fix (test-engineer). `tests/unit/actions/user-management.test.ts:481` still says "records audit before deletion". Rename + add order/not-called assertions. Highest-ROI test task.
- **AGG-37** rankings page missing ISR (architect perf lane). `export const revalidate = 60;` at top of `src/app/(public)/rankings/page.tsx`. Trivial.
- **C3-D1** `.env.example` omits 6 security-relevant vars (document-specialist): `TRUSTED_PROXY_HOPS`, `JUDGE_ALLOWED_IPS`, `SANDBOX_ALLOW_UNVERIFIED_EMAIL`, `ALLOW_UNSNAPSHOTTED_RESTORE`, `TRUSTED_DOCKER_REGISTRIES`, `JUDGE_PRODUCTION_MODE`.

## TEST GAPS (do this cycle — high-ROI, test-only)

- **TE NEW-1 (High)** `src/app/api/v1/admin/migrate/import/route.ts` — snapshot gate + durable audit + skippedTables UNTESTED (restore twin has 4 tests; migrate-import has 0). Mirror the 4 restore tests.
- **TE NEW-4 (High)** `judge-worker-rs/src/docker.rs:170-285` — cleanup-timeout wrapping has ZERO coverage. Add a source-grep + structural test.
- **TE NEW-2/NEW-3 (Med)** accessCode-strip is source-grep only (no behavioral GET test); community fixture scopeType is all "general" (editorial/solution untested at route layer).

---

## Docs (small — do this cycle)

- **AGG-51 / C2-D3** `docs/api.md:78-83` CSRF section lists only `X-Requested-With`; impl enforces `Sec-Fetch-Site` + `Origin`/`Host` (document-specialist confirmed still open).
- **AGG-52 / C2-D4** `AGENTS.md:379` push-scan wording says "downgrades to warn"; `deploy-docker.sh:1078-1079` calls `die()` (aborts).
- **C3-D2** `AGENTS.md:407` cites deploy-docker.sh lines `544-596`; the Step 5b block is at `941`.

---

## DEFERRED — design-heavy (with provenance, NOT dropped)

Each is security/correctness/data-loss or larger-design, recorded with exit criterion. Scheduled for later cycles.

- **C3-1 / AGG-2 / DOC-2 / DOC-3** Snapshot/full-fidelity redaction bypass (HIGH). `src/lib/db/export.ts:104-106` applies `EXPORT_ALWAYS_REDACT_COLUMNS` even at `sanitize:false`; `pre-restore-snapshot.ts:34-39` comment falsely claims full-fidelity. Snapshot is unrestoreable (no passwordHash/sessionToken). Needs snapshot-mode design + at-rest encryption gate (architect PHB-2). Couples to DOC-2/DOC-3 doc fixes. Exit: snapshots faithfully restoreable without secret-exfiltration path.
- **AGG-1** Restore DB↔files atomicity (MED, design). `restore/route.ts:163` commits DB before `restoreParsedBackupFiles` (bare-write loop at `export-with-files.ts:351-360`). Architect PHB-1 staging-then-rename design. Mitigated by A7 durable failure audit + pre-restore snapshot. Exit: post-commit FS failure cannot leave DB referencing absent blobs.
- **AGG-10** Plaintext-decryption fallback default flip + one-shot re-encryption migration. `encryption.ts:99` default already `false`, but `plugins/secrets.ts:61` still defaults `true`; `smtp.ts:54`/`hcaptcha.ts:23` pass explicitly. Exit: `allowPlaintext` defaults false everywhere; explicit opt-in.
- **NEW-M8 / C3-N8** ZIP-bomb streaming decompression (MED). `files/validation.ts:96-107` slow-path materializes full entry before cap check. Needs JSZip `internalStream` streaming. Exit: OOM-before-cap impossible.
- **NEW-M9** Anti-cheat Origin fail-closed when AUTH_URL unset (LOW, bounded). `contests/[assignmentId]/anti-cheat/route.ts:70` `if (expectedHost)` skips. Bounded — `validateAuthUrl()` throws in prod. Exit: no Origin bypass.
- **AGG-36..40** Perf medium queue (architect perf lane, all re-confirmed): SSE sharded lock (`realtime-coordination.ts:101`), submissions global-count inside per-user lock (`submissions/route.ts:385-388`), audit IN-array→EXISTS (`audit-logs/route.ts:73-105`), announcements/clarifications pagination. F-1 canManageProblem per-request DB hit (memoize + student fast-path).
- **AGG-41** Convert ~103 fire-and-forget `recordAuditEvent` security-critical sites to durable (sub-cycle; flagship A7 landed cycle 2; architect REG-1 confirms the 8/9 durable sites are the right ones — bulk conversion is lower priority than originally scoped).
- **AGG-43/45** Function-judging C++ family registry breadth (cpp17/20/26/clang_*). Register `cppAdapter` under aliases.
- **AGG-54** Migration journal duplicate-prefix regeneration; **AGG-55** orphaned `min_password_length` column drop.
- **N2** Wall-clock total-judging cap (immutable `judgeClaimStartedAt`).
- **NEW-H5** Judge `/claim` shared-token fallback + default-open IP allowlist. Tracer F6: `ip-allowlist.ts:160-166` returns true when unset; config-gated but blast-radius if token leaks. Exit: claim requires registered `workerId` + per-worker hash; default-deny when no allowlist. **Critical unknown: needs operator confirmation of `JUDGE_ALLOWED_IPS` on each production target.**
- **Debugger R1..R4** worker cleanup residuals: R2 orphan sweep filters `status=exited` only (doesn't reap running `oj-*` after timeout — HIGH/MED); R1 compiler chown-failure catch still 0o777 (intentional mirror, DBG-4 half-closed); R3 inspect-timeout default OOM=false; R4 no `kill_on_drop`.
- **Designer P1 batch** AGG-58 (h1 hierarchy, scope expanded to ~27 pages), AGG-59 (leaderboard hsl(var(--border)) invalid), AGG-60 (recruit form aria-live), AGG-61 (loading/error states), UI-1..UI-13.

---

## Cross-Agent Agreement (high-signal — flagged by ≥2 agents)

| Topic | Agents | Unified ID | Verdict |
|---|---|---|---|
| Contest export JSON audit gap | code-reviewer, critic, security | C3-AGG-1 | PROMOTE to Phase A |
| SSE re-auth identity-only (5-agent) | code-reviewer, critic, debugger, tracer, security | C3-AGG-6 | DO this cycle |
| C2-H7 X-Real-IP revert safe (5-agent) | code-reviewer, security, verifier, tracer, critic | — | **CLOSE** — nginx overwrites X-Real-IP at 9 verified locations; verification satisfied |
| Recruiting brute-force race resolved | code-reviewer, security, tracer, architect | — | **CLOSE** NEW-M7 (atomic UPDATE); residual C3-AGG-3 metadata clobber remains |
| Community scope centralization drift | architect, critic | C3-AGG-4 | DO this cycle |
| Worker catch_unwind highest-impact | feature-dev, debugger | C3-AGG-9 | DO this cycle |
| Snapshot unrestoreable | security, document-specialist | C3-1/AGG-2/DOC-2/DOC-3 | DEFER (design) |

## Items verified FIXED / CLOSED / NON-ISSUES this cycle

- **C2-H7** X-Real-IP spoof — **VERIFICATION SATISFIED**: every nginx config generated by `deploy-docker.sh` (lines 1281,1296,1308,1320,1353,1368,1380,1392) and `deploy.sh:256` contains `proxy_set_header X-Real-IP $remote_addr;`, which unconditionally overwrites any client-supplied value. Deployed topology safe. Tracer F4 verified deployed `TRUSTED_PROXY_HOPS=1`. Revert was correct. Optional CI-grep hardening remains (LOW). **CLOSE.**
- **NEW-M7** recruiting-token brute-force race — **RESOLVED** (atomic WHERE-guarded UPDATE + rowCount check at `recruiting-invitations.ts:742-758`). Residual metadata-clobber tracked as C3-AGG-3.
- **AGG-17** MAX_TIME_LIMIT_MS clamp — **MITIGATED** on the common path (`validators/problem-management.ts:119` caps authoring at 10s). Worker-side `warn!` on clamp remains as C3-AGG small task.
- **AGG-56** contrast — **INVALIDATED** (re-confirmed false positive, 6.54:1).
- **AGG-44** rate-limiter overflow — **non-issue** (re-confirmed `MAX_CONSECUTIVE_BLOCKS_EXP=4`, max `2^4=16`).
- **SEC-9** community write-side IDOR — **FIXED** since cycle 2 (both routes centralized via `canAccessProblemScopedThread` / `isProblemLinkedScope`).
- **NEW-M6 (roles)** target-level — partly confirmed (C3-AGG-2 is the exploitable subset).
- **Phase A (cycles 1+2)**: 13/13 VERIFIED by verifier + code-reviewer + feature-dev (read of cited code + test at HEAD `207623f9`). No regression found. Gates: `test:unit` 2968/2968, `cargo test` 122/122, lint clean, `db:check` in sync.

## Note on Deferrals

Detailed deferral records (file+line, original severity/confidence preserved, reason, exit criterion) are authored in PROMPT 2 under `plan/cycle-3-2026-06-27-review-remediation.md`. Per repo rules (CLAUDE.md, AGENTS.md, .context/**), security/correctness/data-loss findings are NOT silently dropped. The HIGH/MEDIUM items above are scheduled for THIS cycle; the design-heavy deferrals each record a concrete exit criterion and quote the permitting repo rule where applicable (AGENTS.md:438 permits LOW-severity defense-in-depth/observability polish deferral).
