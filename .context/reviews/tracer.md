# Tracer Report — Cycle 4

Repo: `/Users/hletrd/flash-shared/judgekit` (Next.js 16 + Drizzle/PostgreSQL + Rust worker)
Scope: Evidence-driven causal tracing of 8 named flows + net-new. Cycle 4 of 100.
Method: Inventory -> read full flow path -> cite evidence per hypothesis -> verdict + confidence.

Cycles 1-3 are green (43 commits). Findings converging (112->25). This pass does NOT inflate: several deferred items are confirmed **closed** by cycle-3 work, a few LOW residuals remain, and two net-new items are surfaced with honest confidence.

---

## Summary verdict table

| Flow | Verdict | Confidence | Severity |
|------|---------|------------|----------|
| F-recruit | A3 fix holds for its target; **uncovered sibling writer** still races | likely | LOW |
| F-roles | Escalation vectors closed; **read->write TOCTOU** on level gate | likely | LOW |
| F-sse | Re-auth gate works; **<=30s heartbeat + one terminal result** window | confirmed | LOW |
| F-export | Audit fires on every PII branch; CSV uses **buffered** (non-durable) audit | confirmed | LOW |
| F-settings | Reconfirm gate covers listed keys; **2 restricted-mode flags escape** | confirmed | LOW-MED |
| F-claim (NEW-H5) | Shared token can claim full submission + test cases; **IP allowlist default-open** | confirmed | MED (conditional on token leak) |
| F-restore (AGG-1) | Post-commit FS failure leaves dangling refs; **documented + mitigated** | confirmed | LOW (accepted) |
| F-snapshot (C3-1) | passwordHash/sessionToken stripped at sanitize:false -> **unrestoreable** | confirmed | CLOSED |

---

## F-recruit — recruiting-invitations.ts metadata + brute-force + reset

**Lock topology after A3 (commit ec48f84c, tx + FOR UPDATE):**

| Writer | Connection | Lock held | Path |
|--------|-----------|-----------|------|
| `updateRecruitingInvitation` (metadata) | explicit tx | FOR UPDATE L401 -> UPDATE L432 | merge in JS, full-object write |
| `incrementFailedRedeemAttempt` | auto-commit `db.update` | row lock for 1 stmt | atomic `jsonb_set` counter+1 (L105) |
| `resetFailedRedeemAttempt` | auto-commit `db.update` | row lock for 1 stmt | atomic `jsonb_set` counter=0 (L134) |
| `redeemRecruitingToken` | explicit tx | lock only at claim UPDATE L769 | reads metadata **without** FOR UPDATE (L560) |
| `resetRecruitingInvitationAccountPassword` | explicit tx | **no lock** — plain read L463, write L503 | read-modify-write in JS |

**H1 — "fully serialized."** Evidence FOR: the metadata-merge tx holds FOR UPDATE (L401) across the read-modify-write; Postgres row-locks serialize it against the atomic `jsonb_set` increments/resets, and a blocked UPDATE re-reads the latest committed row under READ COMMITTED, so the counter is preserved through a concurrent metadata edit. Verified by tracing each interleaving (edit-then-increment and increment-then-edit both leave the correct counter). **Verdict: confirmed for this specific writer.**

**H2 — "status branch (L410-424) still races."** Evidence AGAINST: the revoke branch runs *inside* the same FOR UPDATE tx; the conditional `WHERE status='pending'` (L420-423) is an atomic guarded UPDATE, and the no-metadata revoke path (L437-451) is a single atomic conditional UPDATE. No read-modify-write, no TOCTOU. **Verdict: not a race — confirmed closed.**

**H3 — "a third writer."** Two exist:
- `users/[id]/route.ts:491-500` (permanent-delete scrub) overwrites `metadata: {}` inside the user-delete tx. **Benign**: the scrub matches `WHERE userId = id`, which only hits *redeemed* invitations; the user is being erased and the row is detached (FK set-null), so clobbering that invitation's counter has no brute-force consequence.
- `resetRecruitingInvitationAccountPassword` (in-file, L462-511) **is a genuine uncovered writer**. It reads metadata via `getRecruitingInvitation` (plain SELECT, no lock, L463), builds `nextMetadata = {...invitation.metadata, [RESET_KEY]: "true"}` (L474-477), and writes the **full object** in a tx (L503-509) with no FOR UPDATE.

**Race (mechanically real):** admin resets account password while an attacker brute-forces re-entry on the same (redeemed, live) invitation:
1. reset reads `{counter: 2}` (L463);
2. wrong-password redeem fires atomic increment -> counter becomes 3 (commits);
3. reset tx writes `{counter: 2 (stale), RESET_KEY: "true"}` -> counter clobbered 3->2.

The A3 FOR UPDATE fix does not cover this path. Impact is **under-counting by ~1** on a rare admin action against an invitation that is concurrently being brute-forced; the candidate is also being forced to set a fresh password, narrowing the window. Self-corrects on next increment.

- **Verdict:** likely (race is mechanically proven; security impact LOW).
- **Confidence:** high (mechanism), medium (exploitability — requires admin+attacker concurrency on one invitation).
- **Recommended fix:** route `resetRecruitingInvitationAccountPassword` through the same `SELECT ... FOR UPDATE` + atomic-preserve pattern, or set the reset flag via `jsonb_set` so the counter field is never rewritten from a stale snapshot.
- **Next probe (if contested):** integration test that spawns N wrong-password redeems concurrently with one reset and asserts the counter never decreases.

**Noted concurrency property (not a hole):** `redeemRecruitingToken` reads the counter from a snapshot (L587) without FOR UPDATE, so under a *burst* of concurrent wrong-password attempts, more than `MAX_FAILED_REDEEM_ATTEMPTS` verifications can run before lockout engages. This is acceptable: the counter still accumulates via atomic increments, the token is 192 random bits (unguessable), and the password is strongly hashed — a burst of ~N extra verifications is not exploitable. IP rate-limiter is the complementary layer (comment L584).

---

## F-roles — `roles/[id]/route.ts` PATCH cap-affecting vectors

Traced against the new gate set (super-admin L72, builtin-level L78, level-above-own L84, **lateral higher-role L94**, added-cap L102).

| Vector | Gate | Escapes? |
|--------|------|----------|
| ADD cap | L102-109 `added.filter(!caps.has)` | No — only grants actor's own caps |
| REMOVE cap | allowed, but L94 blocks editing any role with `level > creatorLevel` | No for higher roles; same/lower-level strip = privilege reduction (intended) |
| Level up | L84 `updates.level > creatorLevel` -> 403 | No |
| Level down (demote) | permitted | No (reduction); and you can't demote a role you can't touch (L94 uses current level) |
| Rename (displayName) | L112, cosmetic | No cap impact; builtin `name` not in update schema |

**H (escalation) — closed.** No vector lets a lower-level admin gain or grant a capability they lack, nor edit a strictly-higher-level role. The `>` (strict) comparator means **same-level peer editing remains permitted** — intended governance, not escalation.

**Residual TOCTOU (LOW):** the level gate reads `role.level` at L59 but the UPDATE at L121-124 carries no `WHERE level <= creatorLevel`. If, between read and write, a second admin raises the target role *above* the actor's level, the actor's edit still lands on the now-higher role (cap-strip). Requires a precise concurrent-admin window.
- **Verdict:** likely; **confidence** medium.
- **Recommended fix:** push the level guard into the UPDATE `WHERE` and check `rowCount`, mirroring the revoke pattern used in F-recruit (L420-425).
- **Next probe:** confirm `getRoleLevel(user.role)` returns a sane floor (not undefined->0) when the actor's role is unmapped — if it did, L84/L94 would mis-compare.

---

## F-sse — `submissions/[id]/events/route.ts` re-auth tick vs emit loop

Question: *can an event be emitted between revoke and re-check?*

The poll callback (L452-534) has two arms:
- **Re-auth arm** (`now - lastAuthCheck >= 30s`, L459): an async IIFE `await`s `getApiUser` + `canAccessSubmission` (L475-482), and only then processes the status / calls `sendTerminalResult`. On revoke -> `close()`, no event emitted. Correctly ordered — the cycle-3 fix (commit 96105df5) holds.
- **Sync arm** (`< 30s`, L517-533): emits heartbeats and, if the status went terminal, calls `sendTerminalResult()` **without a fresh auth check** (L524).

**Answer: YES, within a bounded window.** After a re-auth tick passes, a viewer whose access is revoked in the next <=30s continues to receive:
1. `event: status` heartbeats for the remainder of the interval (no PII — status string only);
2. **at most one `event: result`** carrying the full sanitized submission, IF the submission transitions to a terminal state before the next re-auth tick (sync-arm `sendTerminalResult`, L524, uses the *original* `caps`/`viewerId` captured at L344, no re-check).

The leak is bounded to one terminal result for a submission the viewer was authorized to see moments earlier; `sanitizeSubmissionForViewer` still applies (with stale caps). Realistic impact is low (the viewer was legitimate <=30s ago).

- **Verdict:** confirmed residual; **confidence** high.
- **Severity:** LOW.
- **Recommended fix:** gate the sync-arm terminal path on a lightweight `canAccessSubmission` re-check (or shorten the interval for terminal transitions); heartbeats alone are acceptable.
- **Next probe:** confirm `sanitizeSubmissionForViewer` does not itself re-query group membership (if it did, the stale-caps concern would be smaller).

---

## F-export — `contests/[assignmentId]/export/route.ts` PII branches + audit

Every branch returning PII was traced:

| Branch | Returns PII? | Audit | Helper |
|--------|--------------|-------|--------|
| JSON, non-anonymized (L89-136) | yes (name, username, class, IP) | **durable** L117 | C3-AGG-1 fix — audits the recruiter-panel read path too |
| JSON, anonymized (L112) | minimal | durable L117 | yes |
| CSV, non-anonymized (L193) | yes | **buffered** L182 `recordAuditEvent` | warn |
| CSV, anonymized (L181) | minimal | buffered L182 | warn |
| notFound / forbidden / apiError (L47,53) | none | — | yes |

**H — "audit fires on every PII read."** Confirmed: the durable JSON audit (L117) was widened in cycle-3 to fire unconditionally, closing the recruiter-panel gap. No PII branch escapes unaudited.

**Residual inconsistency (LOW):** the CSV path uses the **buffered** `recordAuditEvent` (L182), not `recordAuditEventDurable`. Under a SIGKILL/OOM inside the 5s flush window, a CSV-download audit row can be lost. The JSON path was upgraded to durable for exactly this reason (commit 3ae8d8be comment: "Durable so the row survives a crash"). CSV was not.
- **Verdict:** confirmed; **confidence** high; **severity** LOW (audit-only; both actions still require `canViewAssignmentSubmissions`, so authorization is unaffected).
- **Recommended fix:** swap L182 to `recordAuditEventDurable` for parity with the JSON branch.
- No PII appears in any error response (`apiError` / `validateExport` paths) — confirmed.

---

## F-settings — `settings/route.ts` privilege-affecting keys

`SENSITIVE_SETTINGS_KEYS` (L24-43) triggers password reconfirm (commit 50af8196). Every destructured / allowed key traced:

- Posture keys covered: `platformMode`, `allowedHosts`, `publicSignupEnabled`, `signupHcaptchaEnabled`, hCaptcha keys, `communityUp/Downvote`, rate-limit quartet, `submissionMaxPending`, `sessionMaxAgeSeconds`. yes
- **Escaping the list:** `allowAiAssistantInRestrictedModes` (L78, written L143) and `allowStandaloneCompilerInRestrictedModes` (L79, written L144) — both flip platform-mode **exam-mode restrictions** off (verified in `platform-mode-context.ts:290` + schema `schema.pg.ts:565-566`). A stolen admin cookie can silently enable AI assistant / standalone compiler during restricted (contest/exam) mode **without password reconfirm**. This is an academic-integrity posture change, not classic auth, but it is exactly the "stolen session silently weakens the platform" threat the reconfirm gate exists for.
- **Dead-but-listed (informational):** `emailVerificationRequired` and `smtpPass` are in `SENSITIVE_SETTINGS_KEYS` but are **not** destructured (L71-87) and **not** in `allowedConfigKeys` (L118-130) — so they cannot be persisted via this PUT (fall into `restConfig` -> filtered). They are settable via the validator/schema (`validators/system-settings.ts:87,94`) but this route silently drops them. Harmless (default stays), just confusing. Confirm whether SMTP password is meant to be set here at all.

- **Verdict:** reconfirm gate is sound for its listed set; the two restricted-mode flags genuinely escape. **Confirmed.**
- **Confidence:** high.
- **Severity:** LOW-MED (requires stolen admin session; impact is exam integrity, not data exfiltration).
- **Recommended fix:** add `allowAiAssistantInRestrictedModes`, `allowStandaloneCompilerInRestrictedModes` to `SENSITIVE_SETTINGS_KEYS`. Optionally prune the two dead keys to avoid implying coverage that can't trigger.

---

## F-claim (deferred NEW-H5) — judge `/claim` auth path + IP allowlist

Auth path traced (`claim/route.ts` + `judge/auth.ts` + `judge/ip-allowlist.ts`):

- **With `workerId`** (L171-208): requires per-worker `secretTokenHash` via `isJudgeAuthorizedForWorker`, worker row online, and a body `workerSecret` constant-time-compared against the stored hash. Shared token is **not** honored. Strong. The legacy plaintext fallback was removed (auth.ts L86-96).
- **Without `workerId`** (L176-180): only `isJudgeAuthorized(request)` — the **shared `JUDGE_AUTH_TOKEN`** — then claims via `buildClaimSql(false)` with **no worker-capacity gate and no worker attribution**.

**Blast radius if the shared token leaks** (the no-workerId path is reachable from anywhere, and `isJudgeIpAllowed` returns `true` for everyone when `JUDGE_ALLOWED_IPS` is unset — `ip-allowlist.ts:163-166`, default-open, and the cycle-2 attempt to tighten this was reverted in commit 23851d69 because it broke deployed workers):
1. Claim any pending/stale submission -> response returns **full `sourceCode`** and **all `testCases`** including `input`, `expectedOutput`, and **non-visible** cases, plus problem limits and language config (L410-424). This is full problem-answer + student-source exfiltration.
2. Same capability via `poll/route.ts:74` (shared-token fallback).
3. Can register arbitrary workers (`register/route.ts:31`) and hold the queue (claim-and-never-finalize; stale-reclaim eventually frees rows).
4. Attribution is weak: `recordAuditEvent` fires with `actorRole: "system"` (L284-301) — **after** data is returned, and not tied to the leaked-token holder.

The token is a server-side env secret, not candidate-facing, so this is conditional on a leak (misconfigured backup/env dump/log). But the combination of *shared-token-can-claim-full-test-data* + *default-open network allowlist* + *no per-token attribution* means a leak has no layered backstop until an operator sets `JUDGE_ALLOWED_IPS`.

- **Verdict:** confirmed (mechanism certain); exploitability conditional on token leak.
- **Confidence:** high.
- **Severity:** MED (conditional).
- **Recommended fix (layered, in priority order):**
  1. Make `JUDGE_ALLOWED_IPS` mandatory in production (fail-closed if unset) — or at minimum warn loudly. This is the single highest-leverage control.
  2. Require a registered `workerId` + per-worker secret on `/claim` (deprecate the shared-token claim path), keeping the shared token only for initial registration.
  3. Attribute claim audits to the auth mode (shared-vs-worker) and include a token fingerprint so a leaked-token burst is visible in audit.
- **Next probe:** grep deploy/env configs for whether `JUDGE_ALLOWED_IPS` is actually set on `worker-0`/`algo`; if unset, this is the top operational action item.

---

## F-restore (deferred AGG-1) — DB commit vs file-write ordering

Ordering traced in `restore/route.ts`:
- L163 `importDatabase(data)` — DB transaction **commits** (truncate + re-insert, single tx, atomic per the comment L141-148).
- L178-202 — **ZIP only**: `restoreParsedBackupFiles(pendingUploadedFiles)` writes blobs to the FS **after** the DB commit. Legacy JSON has no files.

**Concrete failure confirmed and acknowledged in-code (L174-177):** if the file-write phase throws, "the DB already references the new backup's uploads." The DB now points at absent (or partially written) blobs -> submissions/uploads 404 until manual repair.

Mitigations present:
- A **durable** failure audit `system_settings.database_restore_files_failed` (L183-196) distinguishes this from a clean restore.
- The response surfaces `preRestoreSnapshotPath` (L198) for manual rollback.
- The pre-restore snapshot (L149) is gated: if it fails AND `ALLOW_UNSNAPSHOTTED_RESTORE` is unset, the import aborts before damage (L156-161). So the only unprotected case is the documented break-glass.

**Residual (LOW):** there is no *automatic* rollback and `restoreParsedBackupFiles` is not atomic (per-file writes), so a mid-phase failure leaves a *partially* populated upload directory plus a DB claiming all of them. The operator's only recovery is the snapshot. This is an accepted design tradeoff (snapshot-as-rollback), not an undiscovered bug.

- **Verdict:** confirmed; **confidence** high; **severity** LOW (accepted, documented, mitigated).
- **Recommended improvement (not urgent):** write uploads to a staging dir before `importDatabase`, then commit DB + atomic-rename blobs into place (or write blobs first, then commit DB) so the DB never references absent files. If keeping DB-first, make `restoreParsedBackupFiles` write a manifest and verify all blobs exist before the success audit.

---

## F-snapshot (deferred C3-1) — `export.ts:104-106` redaction at sanitize:false

```ts
const activeRedactionMap = options.sanitize
  ? mergeRedactionMaps(EXPORT_SANITIZED_COLUMNS, EXPORT_ALWAYS_REDACT_COLUMNS)
  : EXPORT_ALWAYS_REDACT_COLUMNS;
```

`EXPORT_ALWAYS_REDACT_COLUMNS` (`secrets.ts:36-42`) includes `users.passwordHash`, `sessions.sessionToken`, accounts tokens, `apiKeys.encryptedKey`, and `systemSettings.{hcaptchaSecret,smtpPass}`. These are nullified (export.ts L139-143) **regardless of `sanitize`**.

- **passwordHash stripped at sanitize:false -> CONFIRMED.**
- **sessionToken stripped at sanitize:false -> CONFIRMED.**
- Therefore a full-fidelity restore yields an instance where **no user can authenticate with prior credentials** (password hashes gone) and all sessions are invalid — i.e., the export is effectively unrestoreable without a password reset. The restore route independently rejects sanitized exports (`isSanitizedExport`, restore L131-138), so the only restorable artifact is a full-fidelity one that is password-blank by construction.
- **Verdict: CLOSED.** C3-1 concern fully resolved.
- **Note (intentional, not a hole):** `judgeWorkers.{secretTokenHash,judgeClaimToken}` and `recruitingInvitations.tokenHash` are in `EXPORT_SANITIZED_COLUMNS` only — retained in full-fidelity backups by design (`secrets.ts:16-19`) so operators can re-provision workers after restore. Acceptable given full-fidelity export requires the `system.backup` capability.

---

## Net-new findings (outside the named list)

### N1 — `recordAuditEvent` (buffered) used on high-stakes low-frequency paths
F-export CSV (L182) and other paths implicitly rely on buffered audit. Cycle-3 deliberately moved contest-export-JSON and restore to `recordAuditEventDurable` ("survives SIGKILL/OOM in the 5s flush window"). The CSV export should be reviewed for the same standard. **Severity LOW.** (See F-export fix above.)

### N2 — `releaseClaimedSubmission` runs after the claim already returned data
In `claim/route.ts`, on a *later* failure (e.g. `problemNotFound` L354-361, or the outer catch L425-440), the route calls `releaseClaimedSubmission` to reset the row to `pending`. This is correct cleanup, but the claim audit (L284) already fired and the worker may already have received source+test cases on a prior successful claim before a *re-claim* of a stale row. Not a bug — the `claimToken` optimistic-lock fence (claim-query.ts L20-26) prevents double-finalize — but claim-side data disclosure is point-in-time and cannot be undone by release. Consistent with F-claim blast radius. **No action; documented.**

### N3 — `getRoleLevel` unmapped-role behavior (carry-over from F-roles)
The TOCTOU in F-roles is only dangerous if `getRoleLevel` returns a *correct* floor for the actor. If the actor's role name is ever absent from the level map, the comparators at `roles/[id]/route.ts:84,94` could mis-evaluate. **Next probe:** read `capabilities/cache.ts getRoleLevel` to confirm it throws or floors safely for unmapped roles rather than returning `undefined`.

---

## Recommended next probes (priority order)

1. **F-claim operational check:** is `JUDGE_ALLOWED_IPS` actually set on `worker-0.algo.xylolabs.com` / `algo.xylolabs.com`? If unset, the shared-token blast radius has no network backstop. (Deploy/env grep.)
2. **F-recruit H3 confirmation:** integration test — concurrent wrong-password redeems + one `resetRecruitingInvitationAccountPassword` — assert counter never regresses.
3. **F-roles N3:** confirm `getRoleLevel` behavior for unmapped actor roles.
4. **F-sse:** confirm whether `sanitizeSubmissionForViewer` re-checks group membership (would shrink the stale-caps window in the sync-arm terminal path).

## What is *not* a finding (explicitly ruled out)

- F-recruit H2 (status branch race) — closed; conditional atomic UPDATE.
- F-recruit third writer `users/[id]` permanent-delete scrub — benign (detached rows).
- F-roles escalation vectors — closed; no ADD/level/rename vector escapes.
- F-export missing-audit — closed by C3-AGG-1; only durable-vs-buffered parity remains.
- F-snapshot — closed (C3-1); passwordHash/sessionToken always redacted.
