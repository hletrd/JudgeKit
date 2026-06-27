# Cycle 7 — Aggregated Review (streamlined single-pass — NO fan-out)

**Repo:** `/Users/hletrd/flash-shared/judgekit` · **Head:** `66112bb6` (cycle-6 close) · **Date:** 2026-06-28
**Method:** Per the orchestrator's streamlined-mode note, this cycle (like cycle 6) SKIPS the 11-agent review fan-out (structural stall in cycles 4/5). The author did a focused single-pass review directly: (a) regression-checked the small cycle-6 changed surface at HEAD, (b) re-read the cited code for each user-selected batch item to confirm it is still real + assess one-cycle landability, (c) recorded the deferred backlog with provenance.

**Carry-forward plans read:** `plan/cycle-{4,5,6}-2026-06-27-review-remediation.md`. The cycle-5 full fan-out (7 per-agent files) remains the authoritative severity source; this file records only the cycle-7 delta.

---

## STAGE 0 — Cycle-6 regression check (single-pass, at HEAD `66112bb6`)

Re-read each cycle-6 code touch; all three are intact and behave:

- **C6-A1 (NEW-M8) ZIP slow-path streaming cap** — `src/lib/files/validation.ts:43,128,148,156`. The slow path now uses `entry.internalStream("uint8array")` with a running-byte counter and early abort (`pause()`) when the counter exceeds `MAX_SINGLE_ENTRY_DECOMPRESSED_BYTES` (50 MB). **No regression.** The fast path (metadata available, line 128) is untouched.
- **C6-A2 (AGG-41) audit-logs instructor scope** — `src/app/api/v1/admin/audit-logs/route.ts:98,103,108,113`. Confirmed intact: the instructor branch now uses `sql\`EXISTS (SELECT 1 FROM ...)\`` raw-SQL subqueries (group / assignment / submission / problem scopes) instead of the 4 preparatory `findMany` round-trips + `inArray` clauses. `buildGroupMemberScopeFilter` (line 31, JSONB groupId scope) is preserved as-is. The non-null assertion fix (`f55eb825`) is present. **No regression.**
- **C6-A3 (Designer P1) oklch** — `leaderboard-table.tsx`, `sidebar.tsx`, `tag-form-fields.tsx`. grep for `hsl(var` across the three files returns ZERO matches — the invalid `hsl(oklch(...))` wrapper was dropped. **No regression.**

**Cycle-6 regression verdict: PASS — 0 regressions.** No net-new severity escalation.

---

## STAGE 1 — Re-validated user-selected batch (re-read at HEAD `66112bb6`)

Each item below was re-read at HEAD to confirm it is still real and to assess one-cycle landability. The user selected the crypto pair (C4-4/AGG-10 + NEW-B), AGG-1, and F-1.

### A1. C4-4 / AGG-10 + NEW-B — crypto hardening (MED, security) · PRIMARY

**Split reality (re-confirmed at HEAD):** the two encryption paths are NOT at the same maturity, and this is load-bearing for the plan.

- **Plugin path** (`src/lib/plugins/secrets.ts`): ALREADY versioned. `ENCRYPTION_VERSION = "enc:v1"` (line 6); format is `enc:v1:iv:tag:ciphertext`; a keyring already exists at line 95 (`for (const key of [deriveEncryptionKey(PLUGIN_DOMAIN), legacyEncryptionKey()])`). The warn-log audit trail shipped in cycle-5 (`da8e6b1f`, lines 80-85). **The ONLY remaining C4-4 work here is the default flip** at line 61: `const allowPlaintext = options?.allowPlaintextFallback ?? true` — still defaults `true`.
- **Main path** (`src/lib/security/encryption.ts`): NOT versioned. Format is `enc:iv:ciphertext:authTag` (line 78, 4 parts). Default is ALREADY `false` (line 99). No keyring (uses single `getKey()`). NEW-B (versioning + keyring for zero-downtime rotation) applies HERE.

**C4-4 default flip — landability: SAFE.** `decryptPluginSecret`'s only call site in production code is `decryptPluginConfigForUse` (secrets.ts:176-181), which wraps the call in `try/catch`, logs the error, and sets the value to `""`. So flipping the default from `true` → `false` produces a CONTAINED failure mode (plugin secret becomes empty + logged error) — NOT a process crash or lockout. Combined with two deploy cycles of the warn-log audit trail shipping in production (cycles 5 and 6 both deployed `da8e6b1f`), the flip is defensible. The fallback CODE stays available via explicit `{ allowPlaintextFallback: true }` opt-in, and the warn-log is preserved — consistent with the repo rule (`encryption.ts:18-22`) which forbids SILENTLY dropping the fallback (the flip is not silent: explicit opt-in + warn remain).

**NEW-B main-path versioning — landability: SAFE WITH BACKWARD-COMPAT.** The instruction's CARE note ("existing secrets are stored as `enc:...` (no version)") is accurate for the main path. The reader MUST treat unversioned `enc:` as v1/current. Design: writer emits `enc:v1:iv:ciphertext:authTag` (5 parts); reader checks `startsWith("enc:v1:")` → 5-part path, else `startsWith("enc:")` → legacy 4-part path; both feed a keyring (`[currentKey, ...previousKeys]` from optional `NODE_ENCRYPTION_KEY_PREVIOUS`). This mirrors the already-proven plugin-path pattern. Round-trip + legacy-read + rotation tests are all unit-testable (no DB). The existing `encryption.test.ts` regex `/^enc:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/` and `parts[3]` indexing WILL need updating (they encode the old 4-part shape) — these are test assertions, not consumers.

**No consumer parses the format outside `encryption.ts`.** grep for `startsWith("enc:")` in `src/` returns only `encryption.ts` itself. Safe.

### A2. AGG-1 — restore DB↔files atomicity (MED, data-loss) · PARTIAL this cycle

`src/app/api/v1/admin/restore/route.ts:163,178-202`; `src/lib/db/export-with-files.ts:351-360`. **Confirmed real.** `importDatabase(data)` commits the DB transaction (line 163) BEFORE `restoreParsedBackupFiles` writes the uploaded files to disk (line 180). If the file-write loop fails partway, the DB references uploads that do not exist on disk.

**Landability of the FULL fix (staging-then-rename): RISKY for one cycle.** The proper atomic ordering is: write files to a staging dir → verify → commit DB → atomic rename staging→final. This reorders the destructive path (currently files-after-DB) and adds staging-dir lifecycle (creation, partial-write cleanup, same-filesystem rename constraint, concurrent-restore isolation, janitor reconciliation). The instruction explicitly warns: *"Do NOT ship an untested atomicity change on the restore path (data-loss surface)."* The restore path is the canonical low-frequency high-stakes event. Shipping a reordered destructive flow without a full integration test (no DB/browser infra locally; `test:e2e` cannot run) does not meet the safety bar.

**Safe partial mitigation this cycle:** `restoreParsedBackupFiles` currently writes files in a loop and returns the count, but does NOT verify the final on-disk state. A silent partial write (e.g. `writeFile` succeeds for 8/10 files, an intermittent I/O error leaves 2 short without throwing) would let the route return `success: true` while the DB references 2 missing blobs. Add a **post-write consistency verification**: after the write loop, `access()` each expected `storedName` and collect any missing; if any are missing, throw a structured error naming them (caught by the route's existing catch → durable audit + clear `restoreFailed` surface). This tightens the failure surface from "undetected partial write" to "immediately detected + named" and is fully unit-testable against the existing mock scaffold (`tests/unit/db/export-with-files.test.ts` already mocks `writeUploadedFile` / `ensureUploadsDir` / `access`). **The full staging-then-rename is DEFERRED with provenance** (see STAGE 2).

### A3. F-1 — `canManageProblem` fast-path + ALS memoize (MED, perf) · LAND

`src/lib/auth/permissions.ts:186-217`. **Confirmed real.** `canManageProblem` always makes 2 DB round-trips (select problem authorId at :194; `getAssignedTeachingGroupIds` + problemGroupAccess at :203-215) even when the caller's role self-evidently cannot manage any problem (lacks both `problems.edit` and `problems.delete`).

**Fast-path landability: SAFE.** Add an early `if (!caps.has("problems.edit") && !caps.has("problems.delete")) return false;` after the `groups.view_all` short-circuit. This is defense-in-depth (the route caller already gates on the capability, but this guarantees the scope check cannot be reached by a role with zero manage capability) AND a perf win. `resolveCapabilities` is already in-memory cached (`capabilities/cache.ts`, 60s TTL), so the fast-path adds no DB cost. No caller invokes `canManageProblem` for a role that legitimately lacks both capabilities but should return true (verified: all 6 call sites are edit/delete/export/compute-expected gates).

**ALS memoize landability: SAFE (pattern already proven).** The repo already runs per-request ALS memoization — `src/lib/recruiting/request-cache.ts` (ALS store + `withRecruitingContextCache`) wired into `src/lib/api/handler.ts:109`. The cycle-5/6 deferral reason ("cross-cutting; subtle ALS-propagation bugs") is mooted by **graceful degradation**: if no ALS store is active, the memo is skipped and the function computes every time — the result is always CORRECT, only performance varies. Design: new `src/lib/auth/permission-cache.ts` (ALS `Map<string, boolean>` keyed by `${userId}:${problemId}`), `withPermissionCache(fn)` wrapper nested inside the existing `withRecruitingContextCache` in `handler.ts`. `canManageProblem` consults the memo before the 2 DB hits. RSC page callers (`problems/[id]/edit/page.tsx`) are outside the API handler wrapper; they simply skip the memo (correct, just uncached) — or can opt in later. Contained, testable.

---

## STAGE 2 — Deferred this cycle (provenance preserved, ORIGINAL severity held)

Each records: file+line · original severity · reason · exit criterion. Security/correctness/data-loss items carry a quoted repo rule or a quoted safety rationale permitting the partial.

- **AGG-1 full staging-then-rename** — MED (data-loss design). `restore/route.ts:163,178-202`. **Partial landed this cycle** (post-write consistency verification in `restoreParsedBackupFiles`). **Safety rationale for partial:** *"the full fix reorders the destructive restore flow (files-before-DB) and adds staging-dir lifecycle (creation, partial-write cleanup, same-filesystem rename constraint, concurrent-restore isolation, janitor reconciliation); without an integration test on the real restore path (test:e2e cannot run locally), shipping the reorder does not meet the 'not untested on the data-loss surface' bar. The partial (post-write verification) converts the worst case from an UNDETECTED silent partial write to a DETECTED, named failure on the existing durable-audit + clear-error surface, and is fully unit-tested."* **Exit criterion:** ship the staging-then-rename in a cycle that can run the restore integration test (or has a staged test environment): write files to `uploads/.restore-staging-<id>/` → verify all staged → commit DB → atomic `fs.rename` each staged file to final → janitor reconciles orphaned staging dirs on startup. Mitigations in place today: cycle-2 durable failure audit (`recordAuditEventDurable` at :183), cycle-4 faithful pre-restore snapshot, cycle-7 post-write verification.
- **NEW-B companion: re-encrypt migration for the main path** — LATENT. After `enc:v1:` ships, old `enc:` values remain readable (legacy reader) but are never auto-rewritten. **Exit:** a background migration that re-encrypts main-path columns to `enc:v1:` on next write (lazy) or a one-shot sweep. Low urgency — legacy reader keeps them usable indefinitely.
- **debugger-N5** startup reap-all worker-identity guard — LOW/MED (future topology). `judge-worker-rs/src/docker.rs`. Single-worker-per-host is the documented topology. **Exit:** `JUDGE_WORKER_CONTAINER_PREFIX` env; only fires on a shared-host topology that does not exist today.
- **Test-gap batch (A8):** C4-A6 main.rs `active_tasks` exactly-once accounting (needs task-body refactor); A11a migrate/import mirror tests (restore twin has 4); C4-N1-test auth-token lifecycle; C5-A3 snapshot output-byte behavioural test. All test-only, HIGH-ROI, zero prod risk — deferred only because they exceed this cycle's coherent subset. Severity preserved.
- **Designer P1 (h2→h1 page titles, 27 pages + 5 error.tsx)** — LOW a11y, churn-heavy across 32 files. **Exit:** dedicated a11y pass.
- **LOW Phase C backlog (unchanged):** C4-6 roles PATCH TOCTOU; C4-7 recruiting metadata clobber; C4-N2 lateral cap-strip; C4-8 executor.rs source 0o666; R3 inspect-timeout OOM-mask; R1 chown-fallback (accepted-by-design); AGG-12/SEC-12 postcss (next `next` bump); ARCH-2/3/4; tracer-N1/N2/N3; UI-16; SEC-16/17/20/21; ARCH-6/8; NEW-M9; C3-N9; feature-dev NEW-2. `AGENTS.md:438` permits deferral of LOW-severity defense-in-depth/observability polish.

---

## RECOMMENDED CYCLE-7 SCOPE (priority order, implemented this cycle)

1. **A1 crypto** — (a) flip `decryptPluginSecret` default `true`→`false` (C4-4 / AGG-10 completion); (b) add `enc:v1:` versioning + keyring to `encryption.ts` with backward-compat legacy `enc:` reader (NEW-B). Round-trip + legacy-read + rotation tests.
2. **A3 F-1** — `canManageProblem` capability fast-path + per-request ALS memoize (`permission-cache.ts`, wired into `handler.ts`). Tests.
3. **A2 AGG-1 partial** — post-write file-consistency verification in `restoreParsedBackupFiles` (detect + name silent partial writes). Defer full staging-then-rename with provenance.
4. **Defer with provenance:** AGG-1 full staging-then-rename (safety rationale above); NEW-B re-encrypt migration (lazy, low urgency); test-gap batch; h2→h1 batch; LOW Phase C.
