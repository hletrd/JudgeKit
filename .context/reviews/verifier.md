# Cycle-4 Verifier Report — evidence-based correctness check

Repo: `/Users/hletrd/flash-shared/judgekit` · Cycle 4/100 · Method: read every cited line + its covering test; no assumptions.

Legend: VERIFIED (stated behavior matches code, test covers it) · PARTIAL (core holds but a real gap exists) · FAILED (stated behavior does not match code).

---

## A. Cycle-1/2/3 fixes — stated-behavior vs. actual-code

### 1. `admin/roles/[id]/route.ts` — "no admin can edit a role whose current level exceeds their own" → **VERIFIED**
- Gate at `src/app/api/v1/admin/roles/[id]/route.ts:94-96`: `if (role.level > creatorLevel) return apiError("cannotEditHigherRole", 403)`.
- Uses the **current** DB level (`role.level` from the L59-63 SELECT), fires **before any mutation** — the UPDATE is at L121-124, after the super-admin (L72), builtin-level (L78), set-above-own (L84), and cap-grant (L102) gates. Ordering correct.
- Test `tests/unit/api/admin-roles.route.test.ts:294-331` drives exactly the lateral cap-strip (`{capabilities: []}` on a level-4 role by a level-3 admin) and asserts `cannotEditHigherRole` 403. Strong coverage.
- Nuance (not a defect): strict-`>`, so an admin can still edit a role at its **own** level — matches the stated wording ("exceeds their own"). PATCH does not lock the row (no `FOR UPDATE` like DELETE), but the only concurrent action that could raise the target's level is itself gated by `updates.level > creatorLevel`, so the TOCTOU is not privilege-escalating.

### 2. `admin/settings/route.ts` — "stolen session cannot silently weaken security posture" → **PARTIAL**
- Reconfirm gate works for the listed keys: `src/app/api/v1/admin/settings/route.ts:91-110` (password required + verified when any `SENSITIVE_SETTINGS_KEYS` key is present). Tests `tests/unit/api/admin-settings-reconfirm.test.ts:123-149` cover require / reject / bypass.
- **Gap (the fix missed privilege-affecting keys).** The PUT accepts and persists `allowAiAssistantInRestrictedModes` and `allowStandaloneCompilerInRestrictedModes` (destructured L78-79, written to `baseValues` L143-144) but **neither is in `SENSITIVE_SETTINGS_KEYS` (L24-43)**. Both directly weaken restricted/exam-mode integrity (enable AI assistant / standalone compiler during a locked-down exam). A stolen session can flip either without reconfirm — exactly the "silent weaken" the gate exists to stop. See Net-new N1.
- Side defect (N2): `emailVerificationRequired` IS in the sensitive list (L28) but is neither destructured nor in `allowedConfigKeys` (L118-130), so it is silently dropped from every PUT — a dead key that triggers a pointless reconfirm and is not actually settable via this route.

### 3. `contests/[assignmentId]/export/route.ts` — "every contest-export PII read is audited" → **VERIFIED**
- JSON branch audits **unconditionally** via the durable path: `src/app/api/v1/contests/[assignmentId]/export/route.ts:117-127` runs for anonymized and non-anonymized alike, before the L128 return; no early return between L89 and L127. Comment explicitly calls out the prior `isDownload`-gating bug (C3-AGG-1).
- Tests `tests/unit/api/contest-export.route.test.ts` cover all three JSON reads: background (L121-144, asserts durable fires + legacy NOT called), explicit download (L146-160), anonymized (L162-176). CSV audited via the buffered path (L182).
- Minor inconsistency (N5): JSON uses `recordAuditEventDurable` (crash-safe) while CSV uses `recordAuditEvent` (buffered). The claim is about JSON PII reads, which holds; flagged only for durability parity.

### 4. `submissions/[id]/events/route.ts` — "revoked group access closes SSE within one re-auth tick" → **VERIFIED**
- Re-auth IIFE re-runs the **authorization** gate, not just identity: `src/app/api/v1/submissions/[id]/events/route.ts:475-482` re-fetches the reader (`columns: { userId, assignmentId }`) then `canAccessSubmission(refreshedReader, …)`; close on missing row or denial. Identity check (L467) precedes authz (L479).
- `AUTH_RECHECK_INTERVAL_MS = 30_000` (L33); the check rides on `onPollResult` which the shared poll timer (L214) fires every `ssePollIntervalMs` for every subscriber, so closure latency is bounded by the 30s re-auth tick.
- Test `tests/unit/api/submission-events-reauth-authorization-implementation.test.ts` is a source-text contract (rationale: driving the long-lived loop past 30s is disproportionate). It pins the load-bearing strings and the identity-before-authz ordering. Acceptable for this wiring invariant.

### 5. `recruiting-invitations.ts` — "admin metadata-edit can no longer regress the brute-force counter" → **VERIFIED**
- SELECT is `.for("update")` **inside a transaction**: `src/lib/assignments/recruiting-invitations.ts:396` `db.transaction`, L401 `.for("update")`. Merge preserves `_sys.*` keys (L407-412) and new metadata cannot contain `_sys.*` (`findInternalKeyViolation` L380-385). The status (revoke) branch reuses the same locked merge (L414-429) — consistent.
- Serialization is real because the counter side (`incrementFailedRedeemAttempt` L96-105) is an atomic `jsonb_set` UPDATE (row-locked at statement time); under READ COMMITTED the FOR UPDATE select and the atomic increment cannot clobber each other.
- Tests `tests/unit/assignments/recruiting-invitation-metadata-race.test.ts`: assert `for("update")` invoked (L114) and `_sys.*` keys survive the merge (L132-138). Coverage is on the changed side, which is the side that mattered.

### 6. Community threads/votes — "all four surfaces share one scope gate" → **VERIFIED**
- Four surfaces, all routing through the centralized `PROBLEM_LINKED_SCOPES` set in `src/lib/discussions/permissions.ts:17` via the helpers (none inlines a literal scope list):
  1. create thread — `community/threads/route.ts:29` (`canAccessProblemScopedThread`)
  2. create post — `community/threads/[id]/posts/route.ts:41`
  3. vote — `community/votes/route.ts:83`
  4. page read — `community/threads/[id]/page.tsx:83-91` (`isProblemLinkedScope` + `canReadProblemDiscussion`)
- DELETE/moderation routes (`threads/[id]/route.ts`, `posts/[id]/route.ts`) are intentionally gated by `canModerateDiscussions` (global mod cap), not scope — correct.
- No read-side leak: `grep "export const GET" src/app/api/v1/community/` returns nothing; the only read path is the server-component page, which fail-closes via `canReadProblemDiscussion`.

### 7. `judge-worker-rs/src/main.rs` catch_unwind — "panicking executor reports runtime_error + dead-letter, does not leak the slot" → **VERIFIED** (with one low-sev edge)
- Spawn body `main.rs:559-590`: `catch_unwind` wraps `executor::execute` (L570-572); on `Err(payload)` it logs and calls `executor::report_panic` (L579-587) → `report_with_retry(... "runtime_error" ...)` (`executor.rs:918-937`), whose retry-exhausted fallback writes a `DeadLetterEntry` JSON (`executor.rs:961-969`, L1027+). `active_tasks.fetch_sub(1)` at L589 runs after the `if let`, so it fires on both Ok and Err-panic. The real concurrency slot (semaphore `_permit`, L562) is released by RAII drop on every path.
- Edge (N3, low): `fetch_sub` is statement-after-`report_panic`. If `report_panic` itself panics, the spawn task unwinds — `_permit` still drops (slot released) but `fetch_sub` is skipped, so the heartbeat `active_tasks` counter drifts +1. Requires a double-panic; cosmetic (reporting counter only).

### 8. `judge-worker-rs/src/runner.rs` — "interactive compiler runs no longer leave user source world-r/w" → **VERIFIED**
- Workspace: chown 65534 then `workspace_mode = if chown_ok { 0o700 } else { 0o777 }` (`runner.rs:837-854`). Source file: chown 65534 then `source_mode = if source_chown_ok { 0o600 } else { 0o666 }` (L874-881). Neither is world r/w on the happy path.
- Wording nit only: the claim says "0o700 on workspace **and source**"; source is actually **0o600** (correct for a non-executable file, and stricter than 0o700). Pinned by source-text test `runner.rs:199-213`.

### 9. `judge-worker-rs/src/executor.rs` A10c clamp warn → **VERIFIED**
- Warn fires exactly when the silent clamp bites: `executor.rs:533-540` warns on `submission.time_limit_ms > max_time_limit_ms()`; the actual clamp is L547-548 `MIN_TIMEOUT_MS.max(submission.time_limit_ms.min(max_time_limit_ms()))`. The warn condition == the `min()` reduction condition.

### 10. `problems/[id]/accepted-solutions/route.ts` A10b count filter → **VERIFIED**
- Count now matches the rendered list: `accepted-solutions/route.ts:51-55` `from(submissions).innerJoin(users).where(and(whereClause, eq(users.shareAcceptedSolutions, true)))`; the list applies the same filter post-hoc (L92 `.filter(s => s.shareAcceptedSolutions)`). `total` no longer overcounts opted-out authors. Test updated to mock the `innerJoin` chain (`problem-accepted-solutions.route.test.ts`).

### 11. Assignment routes A10a freezeLeaderboardAt strip → **VERIFIED**
- Detail route: `groups/[id]/assignments/[assignmentId]/route.ts:57-58` strips `accessCode` + `freezeLeaderboardAt` for `!canManage`. List route: `groups/[id]/assignments/route.ts:84-85` strips both inside the `!canManage` loop. Confirmed in current tree.

### 12. PB-1 A10e test rename → **VERIFIED**
- Commit `6ec17d6e` renames the factually-wrong "records audit before deletion" title and adds a post-commit ordering test asserting no audit is written when `db.delete` rejects — protects commit `76e27d31` (post-commit audit ordering). File: `tests/unit/actions/user-management.test.ts`.

---

## B. Deferred items — are the deferral reasons still accurate?

| Item | Cited lines | Deferral reason | Still accurate? |
|---|---|---|---|
| **NEW-H5** ip-allowlist default-open | `src/lib/judge/ip-allowlist.ts:160-166` | default-open is intentional for worker access | **Yes.** L164 `if (!allowlist) return true`; comment L163 "allow all (temporary for worker access)". Judge routes are token-gated, so default-open is documented + bounded. |
| **C3-1** export redaction at sanitize:false | `src/lib/db/export.ts:104-106` | always-redact set still applies when sanitize=false | **Yes.** L104-106 `sanitize ? merge(...) : EXPORT_ALWAYS_REDACT_COLUMNS` — the always-redact columns are stripped regardless of sanitize. |
| **AGG-10** plugin-secrets plaintext fallback default | `src/lib/plugins/secrets.ts:61` | default-true during migration | **Yes (reason accurate).** L61 `options?.allowPlaintextFallback ?? true`; comment L52-56 documents the migration. **Caveat:** no mechanism forces migration to completion, so plaintext plugin secrets can persist indefinitely — the deferral is open-ended. |
| **NEW-M8** files zip slow-path full materialization | `src/lib/files/validation.ts:96-107` | slow path fully decompresses | **Yes (reason accurate, risk persists).** L98 `entry.async("uint8array")` fully materializes each entry **before** the L100 per-entry cap check. A data-descriptor zip bomb (no size metadata → skips the fast path) can OOM the process before the cap fires. Deferral characterizes the code correctly; the underlying OOM risk is unresolved. |

---

## C. Net-new findings (tight; evidence-cited)

- **N1 — `likely` · `medium` — Settings reconfirm misses restricted-mode bypass toggles.**
  `src/app/api/v1/admin/settings/route.ts`: `allowAiAssistantInRestrictedModes` (L78, L143) and `allowStandaloneCompilerInRestrictedModes` (L79, L144) are writable and persisted but absent from `SENSITIVE_SETTINGS_KEYS` (L24-43). A stolen session can enable the compiler or AI assistant inside a restricted/exam-mode contest with no password reconfirm — a direct security-posture weakening that the C3-AGG-7 gate was written to prevent. `aiAssistantEnabled` is the borderline sibling (platform-wide feature toggle). Suggested fix: add the two restricted-mode keys (and consider `aiAssistantEnabled`) to the sensitive set. Test gap: `admin-settings-reconfirm.test.ts` only asserts keys already in the list, so it would not catch this.

- **N2 — `confirmed` · `low` — Dead sensitive key.**
  `settings/route.ts:28` lists `emailVerificationRequired` in `SENSITIVE_SETTINGS_KEYS`, but it is neither destructured (L72-87) nor in `allowedConfigKeys` (L118-130), so every PUT silently drops it. Net effect: the key triggers a needless reconfirm yet can never be changed via this route. Either wire it into the writable set or drop it from the sensitive list.

- **N3 — `likely` · `low` — catch_unwind double-panic leaks the `active_tasks` counter.**
  `judge-worker-rs/src/main.rs:589` `active_tasks.fetch_sub(1)` sits after `executor::report_panic(...)`. If `report_panic` itself panics, the spawn task unwinds past `fetch_sub`, so the heartbeat counter drifts +1 per occurrence. The semaphore slot (`_permit`, L562) is still released by drop, so real concurrency is unaffected — reporting-counter drift only. A `catch_unwind` around `report_panic` (or moving `fetch_sub` into a guard/`Drop`) closes it.

- **N4 — `confirmed` · `low-medium` — ZIP-bomb OOM before per-entry cap (pre-existing, deferred).**
  `src/lib/files/validation.ts:98` fully decompresses each entry before the L100 size check on the data-descriptor slow path. A crafted archive with data descriptors bypasses the fast-path header check and can force a multi-GB allocation before rejection. Matches the NEW-M8 deferral; re-flagged because it remains exploitable. Streaming-decompress with a running byte cap would close it.

- **N5 — `confirmed` · `low` — Contest-export CSV audit is non-durable.**
  `contests/[assignmentId]/export/route.ts:182` uses buffered `recordAuditEvent` while the JSON branch (L117) uses `recordAuditEventDurable`. A crash between CSV generation and flush loses the PII-read audit row. Not a regression (JSON is the path C3-AGG-1 targeted); durability parity only.

---

## D. Verdict

No FAILED fixes. All 12 cited fixes do what their commits claim. The single PARTIAL is the settings reconfirm gate (N1): it works for the keys it lists but omits the restricted-mode bypass toggles, leaving a real exam-integrity weakening path without reconfirm. Deferred items are characterized accurately; two (AGG-10, NEW-M8) carry risks that persist open-endedly. Net-new findings are otherwise low severity.
