# Cycle 4 — architect

**Scope:** regression-check the cycle-3 fixes for architectural soundness (A3 recruiting `FOR UPDATE`, A4 worker `catch_unwind`, A7 community scope-helper, A8 settings password-reconfirm); re-confirm/close the PERF lane by direct Read (AGG-36..41, F-1, AGG-37, plus NEW hotspots from cycle-3); re-validate the deferred DESIGN items with sketches; net-new architectural risks. READ-ONLY. Every finding cites file:line. Head: `edd45cca`.

Confidence legend: **CONFIRMED** (direct Read of cited code) · **LIKELY** (strong inference from cited code) · **NEEDS-MANUAL-VALIDATION** (cited but runtime behavior not observed).

---

## 1. REGRESSION — architectural quality of cycle-3 fixes

### REG-A8 — Settings password-reconfirm: gate is correct but landed on the WRONG write path (HEADLINE — see NET-NEW ARCH-1)

**Files:** `src/app/api/v1/admin/settings/route.ts:89-110` (the gated API route); `src/lib/actions/system-settings.ts:63-82` (the UNGATED server action the UI actually calls); UI call sites `src/app/(dashboard)/dashboard/admin/settings/{allowed-hosts-form,config-settings-form,system-settings-form,footer-content-form}.tsx`.

The regression question was *“did the reconfirm introduce a divergent privilege-field set vs the sibling restore/migrate/backup routes (DRY/drift)?”* Answer on that narrow question: **no harmful drift.** The siblings (`restore/route.ts:44-62`, migrate/import, backup) reconfirm *unconditionally*; settings reconfirms *conditionally* on `SENSITIVE_SETTINGS_KEYS` (`settings/route.ts:24-43`). That divergence is intentional and documented (settings mixes cosmetic + sensitive keys), and the shared core `verifyAndRehashPassword` is reused — DRY is honored at the verification layer. **CONFIRMED.**

One minor drift surface (**LIKELY, LOW**): four entries in `SENSITIVE_SETTINGS_KEYS` — `emailVerificationRequired`, `communityUpvoteEnabled`, `communityDownvoteEnabled`, `smtpPass` — are **not writable via this API route** (not destructured at `:71-87`, not in `allowedConfigKeys` at `:118-130`). Their presence triggers reconfirm but the value is silently dropped by the `allowedConfigKeys` filter (`:132-134`). This is over-strict/defense-in-depth (safe direction), but it shows the sensitive-list and the writable-list are maintained independently — a future sensitive key added to `allowedConfigKeys` could be missed by `SENSITIVE_SETTINGS_KEYS`. Cosmetic DRY smell, not a hole.

**But the real regression is in NET-NEW ARCH-1** (the server-action bypass): the gate is correct in isolation yet does not cover the primary UI write path. Promoted out of this section because it is net-new in impact, not a quality-of-the-fix question.

### REG-A7 — Community scope-helper centralization: covers all WRITE surfaces, no contract fragmentation (CLEAN)

**Files:** `src/lib/discussions/permissions.ts:29-37` (helper); `src/app/api/v1/community/threads/route.ts:28-35` (create, post-A7); `community/votes/route.ts:82-89` (vote, post-A7); `community/threads/[id]/posts/route.ts:40-47` (posts, pre-existing); read path `src/app/(public)/community/threads/[id]/page.tsx:26,83`; list path `src/lib/discussions/data.ts:149-183`.

The regression question was *“does centralization cover all four surfaces, or did it create a new helper variant that fragments the contract?”* Answer: **CLEAN, no new variant.** A7 reused the existing `canAccessProblemScopedThread` (no companion/variant was added — good; the plan had floated a `assertProblemScopedThreadAccessByFields` companion that was correctly NOT introduced). All three WRITE surfaces (post, create, vote) now route through the one helper. Verified by grep: the only direct `isProblemLinkedScope` call sites outside `permissions.ts` are (a) the create route’s scope-presence guard at `threads/route.ts:17,47` (correct — that is “is this a problem-linked scope at all,” not the access decision) and (b) the read-side page at `page.tsx:26`. No write path inlines `canAccessProblem` anymore (`community/` grep shows only helper calls). **CONFIRMED.**

Residual (intentional, LOW): the READ paths do not use the helper. `page.tsx:26` uses `isProblemLinkedScope(...) && thread.problem?.visibility !== "public"` (a render-time visibility guard, different semantics — fine). `listAllProblemDiscussionThreads` (`data.ts:177-181`) bulk-calls `canAccessProblem` per distinct problem (intentional batching for perf — calling the per-row helper in a loop would be worse). These are correct non-uses, not drift. The write-side contract — the surface that actually caused C2-H5/SEC-9 — is now uniform.

### REG-A4 — Worker `catch_unwind`: composes safely with report_with_retry / dead-letter / active_tasks (CLEAN)

**Files:** `judge-worker-rs/src/main.rs:557-591` (spawn + catch_unwind + fetch_sub); `judge-worker-rs/src/executor.rs:918-937` (`report_panic`), `:971-1062` (`report_with_retry` + dead-letter), `:939-959` (`report_result`).

Sound on all three sub-questions. **CONFIRMED.**

1. **Double-report risk — none in practice.** `report_panic` fires only when `catch_unwind().await` returns `Err` (`main.rs:570-572`). Inside `executor::execute`, every `report_result(...)` call is a *terminal* statement followed immediately by `return` (`executor.rs:482→492`, `501→511`, and the final `664`→return). There is no code window between a successful report and the function returning in which a panic could occur, so catch_unwind never observes `Err` after a successful report. Even in the residual case (panic somehow following a report, or a panic after `staleClaimTimeoutMs` reaped+reclaimed the row), the server guards the report `UPDATE` with `eq(submissions.judgeClaimToken, claimToken)` (`poll/route.ts:93,164`) → 0 rows → `invalidJudgeClaim` 403. The stale/duplicate report is rejected; at worst `report_with_retry` writes a *spurious dead-letter file* (harmless, fail-safe, never a double-verdict).
2. **Leaked-slot risk — none.** `active_tasks.fetch_add(1)` at `main.rs:557` (before spawn); `active_tasks.fetch_sub(1)` at `:589` is **unconditional and after** the `catch_unwind` block — it runs whether `execute` succeeded, erred, or panicked, and after `report_panic` completes. The `_permit` (`:562`) is dropped at task-body end. No slot leak on the panic path. **LIKELY** residual only if `report_panic`/`report_with_retry` itself panics (then `:589` is unwound past) — but `report_with_retry` is defensive throughout (`match` on `Err`, no `unwrap`/`expect`/indexing; `executor.rs:971-1062`), so panic-free in practice.
3. **`AssertUnwindSafe` soundness — yes.** The future captures `Arc<ApiClient>`, `Arc<Config>`, owned `Submission`, and the shared state is `Arc<AtomicI64>` + an owned semaphore permit (`main.rs:552-562`). No `RefCell`/`Cell` in the captured state, so unwinding cannot leave shared mutable state inconsistent. The DB row is mutated via network (report), not in-process mutable state. Canonical unwind-safe pattern.

### REG-A3 — Recruiting `FOR UPDATE`: no deadlock vs the atomic jsonb_set path (CLEAN)

**Files:** `src/lib/assignments/recruiting-invitations.ts:396-434` (metadata-merge tx, post-A3); `:96-115` (`incrementFailedRedeemAttempt`, atomic `jsonb_set` UPDATE); `:128-144` (`resetFailedRedeemAttempt`, atomic); `:204-229` (`regenerateRecruitingInvitationToken`, atomic).

Sound. **CONFIRMED.** The deadlock question resolves cleanly: **both the A3 transaction and the atomic `jsonb_set` UPDATEs lock exactly one row** — the same `recruiting_invitations` row identified by `id` / `tokenHash`. Single-resource locking cannot form a wait-cycle, so it serializes rather than deadlocks, under both READ COMMITTED (default) and SERIALIZABLE. There is no multi-table lock ordering in either path (the metadata tx touches only `recruiting_invitations`; the increment/reset/regenerate paths touch only `recruiting_invitations`). The brute-force counter increment is launched fire-and-forget (`void`, per its own docstring at `:88-89`) on its own connection, so it does not share the redeem transaction’s locks on `users`/`sessions` — it merely serializes against the metadata tx on the one invitation row. The merge correctly preserves `_sys.*` keys (`:408-412`) and the `FOR UPDATE` now prevents the read-modify-write from clobbering `incrementFailedRedeemAttempt`’s atomic write. Fix is minimal and correct.

---

## 2. PERFORMANCE LANE — re-confirm or close by direct Read

All re-confirmed by Read of cited lines this cycle. None were implemented in cycle 3; all remain real but most are low-impact relative to their frequency. Updated severity reflects that.

### AGG-36 — SSE global advisory lock — CONFIRMED real, LOW impact (was MED)
`src/lib/realtime/realtime-coordination.ts:101` — `withPgAdvisoryLock("realtime:sse:acquire", ...)` uses a single hardcoded lock key, so every SSE connection acquisition across every user serializes through one transaction holding 4 statements (delete-expired `:104`, count-total/user-total `:111-122`, insert). **But** acquisition is one-shot per connection *open*, not per poll tick (long-lived streams), so contention is bounded by connection-open rate, not steady-state tick rate. For a judge platform’s connection counts this is fine. Sharding the key by `userId` hash bucket would still reduce contention. Defer unless SSE concurrency rises materially.

### AGG-37 — Rankings ISR — CLOSE (cycle-3 skip reasoning CONFIRMED)
`src/app/(public)/rankings/page.tsx:123` calls `await auth()`, which reads cookies → opts the page into dynamic rendering. On top of that the page does a viewer-specific recruiting-mode redirect (`:122-135`). `export const revalidate` would be a no-op (or `force-static` an error). Cycle-3’s skip was correct. The page is heavy (2× `first_accepts` CTE over `submissions` at `:141-149,166-198`) but that cost is inherent to the auth-gated design. A future win would split a public static shell from the personalized redirect — that is a redesign, not an ISR flag. **CLOSE.**

### AGG-38 — Announcements GET missing pagination — CONFIRMED real, LOW
`src/app/api/v1/contests/[assignmentId]/announcements/route.ts:49-52` — `findMany` with no `limit` returns all announcements for the assignment. SQL predicate is fine (`eq(assignmentId)`, indexed). Realistically a handful per contest; low impact. Add `limit` + cursor if contests ever accumulate large announcement volumes.

### AGG-39 — Clarifications GET missing pagination + post-fetch JS visibility filter — CONFIRMED real, LOW-MED
`src/app/api/v1/contests/[assignmentId]/clarifications/route.ts:49-56` — `findMany` with no `limit`, then `rows.filter((row) => row.userId === user.id || (row.isPublic && row.answer))` in JS for non-managers. Two issues: (1) no pagination; (2) the visibility predicate is evaluated in JS after fetching every row, so a non-manager pulls the full clarification set then discards most of it. Push the visibility predicate into SQL (`WHERE user_id = $self OR (is_public AND answer IS NOT NULL)`) and add a `limit`. Moderate on large exams.

### AGG-40 — Submissions global-count inside per-user lock — CONFIRMED real, LOW
`src/app/api/v1/submissions/route.ts:385-388` — the global pending count `WHERE status IN ('pending','queued')` (no user filter) runs inside the per-user advisory lock tx acquired at `:349`, extending that tx’s critical section. Moving it before the lock shortens the per-user hold. Note the global queue limit is inherently TOCTOU (a soft DoS ceiling, not a hard invariant) — a true global cap would need a global lock serializing all submitters (bad for throughput), which is not worth it. So this is a pure lock-duration micro-opt, not a correctness fix. Low.

### AGG-41 — Audit-logs IN-array → EXISTS — CONFIRMED real, MED
`src/app/api/v1/admin/audit-logs/route.ts:73-148` — the instructor path pre-fetches `groupIds`, `assignmentIds`, `submissionIds`, `problemIds` (4 queries, `:74-105`) then builds four `inArray(auditEvents.resourceId, …)` clauses (`:112,125,133,141`) OR-ed together. `submissionIds` is the worst: a busy instructor can have thousands of submissions → a multi-thousand-element IN clause materialized in app memory. An `EXISTS` rewrite (correlated subquery against `submissions ⋈ assignments ⋈ groups WHERE instructor_id = $self`) avoids materializing the IDs and shrinks the SQL. Frequency is low (admin/instructor action), but per-call cost for busy instructors is real. Best ROI item in the perf queue.

### F-1 — `canManageProblem` per-request DB hit — CONFIRMED real, MED
`src/lib/auth/permissions.ts:186-217`. For a non-`groups.view_all`, non-author caller it costs 2 DB hits per call (`problems.authorId` `:194-199`, then `getAssignedTeachingGroupIds` `:203` + `problemGroupAccess` `:205-215`). No per-request memoization (AsyncLocalStorage) and **no capability fast-path**: a student (no `problems.edit`/`.delete`) still pays the `authorId` + teaching-groups queries to learn they cannot manage. Two cheap wins: (1) early `return false` when the capability set has neither `problems.edit` nor `problems.delete` (eliminates the student path entirely); (2) per-request memo of `canManageProblem(problemId,userId)` so list rendering that re-checks the same problem stops re-querying. A bulk variant `getAccessibleProblemIds` already exists (`:219`) for the read side — the write-side lacks an equivalent. Moderate impact on problem-list/edit pages.

### NEW (cycle-3 fallout) — SSE re-auth re-fetches an immutable row — CONFIRMED real, LOW
`src/app/api/v1/submissions/[id]/events/route.ts:475-482` — the A6 re-auth IIFE re-fetches the submission (`userId`,`assignmentId`) every `AUTH_RECHECK_INTERVAL_MS` to pass to `canAccessSubmission`. Those two columns are **immutable after creation**, and the access decision depends on the *viewer*’s current group membership (read from `reAuthUser`), not on the submission row. The re-fetch therefore cannot change the outcome — the stream-open reader values would do. Cost: +1 DB hit per stream per re-auth tick. Drop the `findFirst` and reuse the stream-open reader. (Deletion is already handled separately at `:492-495`.) Minor, but it is new weight A6 added to every open stream.

### NEW (cycle-3 fallout) — Recruiting `FOR UPDATE` extends tx by one round-trip — LIKELY real, NEGLIGIBLE
`recruiting-invitations.ts:396-434` — the metadata-edit tx now holds the row lock across SELECT + JS merge + UPDATE vs the prior single plain UPDATE. This is the correct trade for correctness (REG-A3) and the tx body is trivial (no I/O between statements). Not a perf concern; noted for completeness.

---

## 3. DESIGN — deferred items re-validated, with sketches

Each: current state (Read this cycle) · still-real? · sketch · effort · risk.

### AGG-2 / C3-1 — Snapshot false-fidelity (HIGHEST-LEVERAGE deferred item) — CONFIRMED real, HIGH
`src/lib/db/export.ts:104-106`: `activeRedactionMap = options.sanitize ? merged : EXPORT_ALWAYS_REDACT_COLUMNS`. So even at `sanitize:false` the always-redact set (passwordHash, sessionToken, account tokens, apiKey ciphertext, smtpPass/hcaptchaSecret — `src/lib/security/secrets.ts:36-42`) is applied. Yet `src/lib/db/pre-restore-snapshot.ts:34-38` docstring claims the snapshot “contains password hashes, encrypted column ciphertexts, and JWT secrets in their stored form.” **That claim is false** — the snapshot redacts exactly the auth columns an emergency rollback would need. Restoring from a pre-restore snapshot leaves every user without `passwordHash` (cannot log in) and drops all `sessions`. The operator’s rollback artifact does not roll back authentication.
**Sketch (PHB-2):** add `mode:"snapshot"` alongside `"full-fidelity"|"sanitized"` (`export.ts:20`); in snapshot mode, bypass `EXPORT_ALWAYS_REDACT_COLUMNS`. Gate behind a separate capability (`system.snapshot_restore` ⊃ `system.backup`) and differentiate the audit action. **At-rest-encrypt the snapshot file** (AES-256-GCM with a snapshot-specific key or the existing `NODE_ENCRYPTION_KEY`) rather than relying on `0o600` (`pre-restore-snapshot.ts:37-39`) — a file containing live password hashes needs more than filesystem mode. Restore rejects unencrypted snapshots. Couples to DOC-2/DOC-3 (fix the false docstring when this ships, or sooner).
**Effort:** medium. **Risk:** the exfiltration shape is the same as the feature — the capability gate + encryption + audit are load-bearing. Do not ship snapshot mode without all three.

### AGG-1 — Restore DB↔files atomicity — CONFIRMED real (unchanged), MED
`src/app/api/v1/admin/restore/route.ts:163` commits `importDatabase`, then `:178-202` runs `restoreParsedBackupFiles` (`export-with-files.ts` bare `writeFile` loop). A crash mid-loop leaves DB referencing blobs that were never written. Cycle-2 added the durable failure audit + pre-restore snapshot as safety nets (correct), but the system restore is still non-atomic.
**Sketch (PHB-1, unchanged):** stage all files into a sibling `uploads.restore-staging.${pid}.${ts}` dir, then `rename()` each into place (atomic on the same fs). A crash leaves a consistent (old-or-new) state, never a torn one. Ship staging+rename first; the optional orphan-sweep (diff old vs new `files` table) is a follow-up with a dry-run flag. Do NOT try to wrap `importDatabase` + file restore in one DB tx — the FS is not transactional.
**Effort:** medium (one new fn + two call sites). **Risk:** staging doubles peak disk during restore — document the headroom (comparable to the snapshot’s existing headroom).

### AGG-10 — Plaintext-decryption fallback default — PARTIALLY done, MED
Core flipped: `src/lib/security/encryption.ts:99` default is `false`. Periphery NOT: `src/lib/plugins/secrets.ts:61` still defaults `true`; `src/lib/email/providers/smtp.ts:54` and `src/lib/security/hcaptcha.ts:23` pass `{ allowPlaintextFallback: true }` explicitly. So the encryption core is safe-by-default but three production read-paths still silently accept plaintext. **Sketch:** run the warn-log audit `encryption.ts:18-21` describes (confirm every encrypted column contains only `enc:`-prefixed values), then flip `plugins/secrets.ts:61` to `false` and drop the explicit `true` at the two call sites. Pairs with NEW-B (key-versioning) — do AGG-10 + NEW-B together so the migration can re-encrypt any plaintext it finds with a versioned key.
**Effort:** small (code) + an ops audit. **Risk:** low if the audit is real; a missed plaintext cell breaks that secret’s read.

### NEW-B — `enc:` ciphertext has no key-version byte — CONFIRMED real, LATENT (MED once AGG-10/AGG-2 ship)
`encryption.ts:78` format is `enc:<iv>:<ciphertext>:<authTag>`; `decrypt` uses a single process-cached key (`getKey`, `:43-60`). No version byte → rotating `NODE_ENCRYPTION_KEY` makes every existing ciphertext undecryptable with no overlap window (decrypt-all + re-encrypt-all big-bang required). This is latent today (single key) but becomes load-bearing the moment AGG-10 forces a re-encryption migration or AGG-2 ships snapshot encryption.
**Sketch:** version the format: `enc:v1:<iv>:<ct>:<tag>`; keep a keyring `{ v1: <current key> }` (env: `NODE_ENCRYPTION_KEY_V1`, …); `encrypt` always writes the current version; `decrypt` parses the version and selects the key, accepting the legacy unversioned form as v1 during migration. Enables zero-downtime rotation (add v2, dual-read, background re-encrypt, drop v1).
**Effort:** medium. **Risk:** low if shipped before any rotation is needed; the migration parser must treat bare `enc:` as v1.

### NEW-M8 — ZIP-bomb streaming decompression — CONFIRMED real, MED
`src/lib/files/validation.ts:94-107` — the slow path (entries whose `_data.uncompressedSize` metadata is absent) does `await entry.async("uint8array")` (`:98`) which **materializes the full entry into memory before** the per-entry cap check at `:100`. The slow path is reachable on demand: an attacker crafts a ZIP with data-descriptor entries (no size metadata) to force `allMetadataAvailable=false` (`:75-77`), then a high-ratio payload to OOM the process before the accumulator trips. The fast path (`:73-88`) is safe; the slow path is the attack surface.
**Sketch:** switch the slow path to JSZip’s streaming API (`entry.internalStream("nodebuffer”*)` piped through a counting transform) that aborts the moment the running total exceeds `MAX_SINGLE_ENTRY_DECOMPRESSED_BYTES`/`maxDecompressedSizeBytes`, before the full content is buffered. Keep the fast path as-is.
**Effort:** medium. **Risk:** low — pure validation path; add a regression test with a data-descriptor zip-bomb.

### AGG-43 / AGG-45 — Function-judging C++ registry breadth — CONFIRMED real, MED
`src/lib/judge/function-judging/registry.ts:10-18` registers `cppAdapter.language` only, and `adapters/cpp.ts:181` sets `language: "cpp23"`. But the language catalog configures `cpp20`, `cpp23`, `cpp26`, and `clang_cpp23` (`src/lib/judge/languages.ts:220-241,646-652`; dashboard group `cpp` → `["cpp23","cpp20","clang_cpp23"]` at `dashboard-catalog.ts:50`). So a function-judging problem authored for `cpp20`/`cpp26`/`clang_cpp23` throws `no function-judging adapter for <lang>` (`registry.ts:28`). Only `cpp23` works.
**Sketch:** register the C++ adapter under all configured C++ aliases — either expand `ADAPTERS` to map each of `cpp20/cpp23/cpp26/clang_cpp23` to `cppAdapter`, or derive the alias set from the language catalog so new C++ variants are picked up automatically. (Same pattern likely needed for C: `c23/c17/c99/c89/clang_c23` once a C function-judging adapter exists.)
**Effort:** small. **Risk:** low; guard with a test per alias.

### AGG-54 / AGG-55 — Migration journal / orphaned `min_password_length` — CONFIRMED real, LOW
- **AGG-55:** `src/lib/db/schema.pg.ts:591` still defines `minPasswordLength: integer("min_password_length")`, but cycle-3 commit `475b931d` removed it from configurable settings and a repo-wide grep finds **no writer** (only the schema declaration). The column is fully orphaned — dead schema. Drop it in a dedicated migration (additive-then-drop; verify no row-level dependency first). **Effort:** small. **Risk:** low.
- **AGG-54:** Drizzle journal regeneration can emit duplicate-prefix codenames across `drizzle/pg/*.sql` (the codename journal). Ops-tooling hygiene only; no runtime impact. Defer; revisit if regeneration is automated.

### N2 — Wall-clock total-judging cap — CONFIRMED NOT STARTED, MED
No `judgeClaimStartedAt`/`claim_started_at` column exists in the schema (grep: none). `staleClaimTimeoutMs` (claim-route `:218`) bounds a *single claim* from the claim side, but there is no wall-clock cap on total judging time across re-claims/retries — a submission that repeatedly re-claims (worker crash + reclaim loop) can run unbounded. The plan’s `judgeClaimStartedAt` (immutable first-claim timestamp) is not present.
**Sketch:** add an immutable `judgeFirstClaimedAt timestampt` set once on first successful claim (`claim/route.ts`), and reject re-claims (or force-terminalize as `runtime_error`) when `NOW() - judgeFirstClaimedAt > totalJudgingCapMs`. The cap is a new system setting.
**Effort:** medium (schema migration + claim-route + reaper). **Risk:** low; choose a generous default cap to avoid false kills.

---

## 4. NET-NEW architectural risks

### ARCH-1 (HEADLINE) — A8 reconfirm gate is on the wrong write path; the UI server action bypasses it (HIGH, CONFIRMED)
**Files:** gated path `src/app/api/v1/admin/settings/route.ts:89-110`; **ungated primary path** `src/lib/actions/system-settings.ts:63-82` (`updateSystemSettings`); UI callers `src/app/(dashboard)/dashboard/admin/settings/allowed-hosts-form.tsx:53`, `config-settings-form.tsx:70`, `system-settings-form.tsx:166`, `footer-content-form.tsx:105`.

The A8 commit message names the threat explicitly: *“A stolen session cookie could silently disable hCaptcha, raise rate limits, or widen allowedHosts.”* The fix puts `verifyAndRehashPassword` on the **API route** PUT. But **no UI client PUTs to that route** — a grep for `/api/v1/admin/settings` finds only nav-link strings (`admin-nav.ts:67`, `admin-dashboard.tsx:32`), not a fetch. The actual UI calls the **server action** `updateSystemSettings`, whose gate is only `isTrustedServerActionOrigin()` + `auth()` session + `system.settings` capability + rate limit (`actions/system-settings.ts:65-82`) — **no password reconfirm at all**. The action writes every sensitive key A8 meant to protect: `platformMode`, `publicSignupEnabled`, `emailVerificationRequired`, `communityUpvote/DownvoteEnabled`, `signupHcaptchaEnabled`, `hcaptchaSecret`, `smtpPass`, `allowedHosts`, and the rate-limit/queue `CONFIG_KEYS` (`:156-189` + configValues).

Concretely, `allowed-hosts-form.tsx:53` calls `updateSystemSettings({ allowedHosts: hosts })` with no password — so the exact “silently widen allowedHosts” scenario A8 documented is still live on the real UI path. The reconfirm gate is correct code on a route the UI does not use; the threat it was written for is unbypassed on the path the UI does use. This is the canonical “two write paths to the same privileged state, only one gated” drift.
**Fix:** extract the reconfirm into a shared helper (`requireReconfirmIfSensitive(body, SENSITIVE_SETTINGS_KEYS, user)` returning a `NextResponse | null`) and call it at the top of `updateSystemSettings` too (server actions can read `currentPassword` from the form input the same way). Gate the same key set in both. Alternatively consolidate to one writer, but the helper is the smaller change.
**Severity:** HIGH on the cycle-3 control’s intent (stolen-session posture), tempered by the residual `system.settings` capability + trusted-origin + rate-limit gates (not unauthenticated). Still the item most worth scheduling next cycle. **CONFIRMED.**

### ARCH-2 — Worker↔app report contract: panic-recovery may emit spurious dead-letters (LOW, LIKELY)
Consequence of REG-A4. If `executor::execute` panics after the submission was already stale-reaped and reclaimed (new `judgeClaimToken`), or after it already reported a terminal verdict, `report_panic` → `report_with_retry` hits `invalidJudgeClaim` 403 (`poll/route.ts:93/164` guards on `judgeClaimToken`) on all 3 attempts and writes a dead-letter file (`executor.rs:1009-1062`) for a submission that is either already judged or being judged elsewhere. No data corruption (the claim-token guard makes the second report idempotent-safe), but operators reviewing `dead_letter_dir` will see “executor panicked” entries that do not correspond to any actually-lost verdict. Worth a one-line note in the dead-letter handling runbook, or having `report_panic` suppress the dead-letter write on `invalidJudgeClaim`. **LIKELY.**

### ARCH-3 — `_sys.*` metadata namespace is a soft contract shared across two write mechanisms (LOW, CONFIRMED)
`recruiting-invitations.ts` now writes the `metadata` JSONB two ways: atomic `jsonb_set(_sys.failedRedeemAttempts)` (`:105,134,215`) and the FOR UPDATE read-modify-write merge (`:407-412`). Both honor the `INTERNAL_KEY_PREFIX` (`_sys`) convention; `findInternalKeyViolation` (`:166-169,381-385`) blocks admin-supplied `_sys.*` keys at the API boundary. The contract is enforced, but it lives in three places (two write paths + one validator). A fourth writer added without the validator would clobber `_sys.*`. Defensive note: centralize the `_sys.*` merge into one helper used by every `metadata` writer (the A3 merge already encapsulates it for the tx path). **CONFIRMED.**

### ARCH-4 — Two settings writers diverge beyond reconfirm (LOW, CONFIRMED)
Related to ARCH-1 but broader: `admin/settings/route.ts` (API) and `actions/system-settings.ts` (server action) are two independent implementations of “persist global settings,” with different key allow-lists (`allowedConfigKeys` vs `CONFIG_KEYS`), different sensitive sets, different audit shapes, and now different reconfirm posture. They will drift further (e.g., a key added to one allow-list but not the other). The architectural fix after ARCH-1 is to collapse to a single `applySystemSettings(input, { actor, requireReconfirm })` core used by both transports. **CONFIRMED.**

---

## Summary verdict

- **Cycle-3 fixes, architectural soundness:** A3, A4, A7 are CLEAN (no coupling/layering/deadlock regression). A8’s gate is correct in isolation but **does not cover the UI write path** (ARCH-1) — the one cycle-3 fix whose protection is materially incomplete on the primary user-facing flow.
- **PERF lane:** all items re-confirmed real by direct Read; AGG-37 CLOSED (skip reasoning correct); most others are LOW impact given their frequency. Best ROI: AGG-41 (audit IN→EXISTS) and F-1 (`canManageProblem` capability fast-path + memo). One new LOW item (SSE immutable-row re-fetch from A6).
- **DESIGN lane:** all deferred items still real and correctly deferred. **AGG-2 (snapshot false-fidelity) is the highest-leverage** — the docstring’s full-fidelity claim is provably false and the rollback artifact cannot restore auth. NEW-B should ship with AGG-10.
- **NET-NEW:** **ARCH-1 (settings reconfirm on wrong path) is the cycle-4 headline** — HIGH, schedule next cycle. ARCH-2/3/4 are LOW structural notes.

Nothing else inflated. Findings 112→25 trajectory holds; this cycle adds one HIGH (ARCH-1) and otherwise re-closes.
