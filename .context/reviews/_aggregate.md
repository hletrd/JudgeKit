# Cycle 2 Aggregate Review

Date: 2026-06-26
Repository: `/Users/hletrd/flash-shared/judgekit`
Head: `ad543e14` (post cycle-1 Phase A)
Prior: cycle-1 aggregate preserved in git history; per-agent files overwritten with cycle-2 reviews.

## Fan-Out Status

All 11 dispatched review agents completed successfully (no failures, no retries needed). Per-agent files live alongside this one. **`perf-reviewer` was not a registered agent this session** — the performance lane was covered by `architect.md` ("PERFORMANCE" section) and `debugger.md`; all cycle-1 PERF items re-confirmed still-open.

- `code-reviewer.md` — 1 CRITICAL (NEW-C1) + 6 HIGH (NEW-H1..H6) + 9 MEDIUM + 8 LOW
- `security-reviewer.md` — 2 HIGH (AGG-2 escalated, SEC-9) + 2 MEDIUM + 5 LOW
- `architect.md` — REG-1 (A2 helper), PHB-1..4, NEW-1..6, perf lane
- `critic.md` — C-1 (A2 durable), C-3 (X-Real-IP), F-1..6 (VERDICT: REVISE)
- `debugger.md` — own file; R1/R2 restore durability+ordering, worker timeouts
- `designer.md` — own file; **AGG-56 INVALIDATED** (false positive); REG-2 (edit page leak); AGG-58..62 confirmed; UI-1..10
- `document-specialist.md` — REG-1 (validation.rs docstring), REG-2 (AGENTS.md env doc), NEW-1..3
- `test-engineer.md` — own file; 12/12 revert-RED; PB-1..3; GS-1..4; NG-1..5
- `tracer.md` — R1 (audit buffered+timing), R2 (AGG-1 open), R3 (no A2 test), N2 (no wall-clock cap)
- `verifier.md` — 12/12 VERIFIED; 5/5 Phase-B still valid; A12 behavioral test flaky
- `feature-dev-code-reviewer.md` — FDR-1..5 all still valid; AGG-44 confirmed non-issue

No agent failures this cycle.

---

## VALIDATED THIS CYCLE (parent read the cited code; severity is load-bearing)

The CRITICAL and HIGH findings below were each confirmed by direct Read of the cited lines by the orchestrator, not just relayed from one agent.

---

## CRITICAL (must fix this cycle)

### C2-C1 / NEW-C1 — Silent data loss restoring an export that omits a known table
**Source:** code-reviewer NEW-C1 · **Validated:** `src/lib/db/import.ts:125-148`
The truncate loop (L129-139) runs `tx.delete(table)` on EVERY table in `getReversedTableOrder()` unconditionally. The insert loop (L143-148) then does `if (!tableData || tableData.rowCount === 0) continue;`. A table present in the live schema but absent from the incoming export is truncated and never refilled; the transaction commits `success: true`. Restoring an archive from before tables like `examSessions`/`recruitingInvitations`/`contestAccessTokens`/`codeSnapshots` existed silently empties them.
**Fix:** Skip truncation of tables absent from `data.tables` and record them in `result.errors`/warnings so the operator sees them. (Rejecting was the alt; skip-truncate preserves partial-export intent and is non-destructive.)

---

## HIGH (must fix this cycle)

### C2-H1 / NEW-H1 — api-keys DELETE missing the role gate A5 added to PATCH
**Source:** code-reviewer NEW-H1 · **Validated:** `src/app/api/v1/admin/api-keys/[id]/route.ts:110-132`
DELETE fetches `existing` as `{id, name}` only (L114); no `role`, no `canManageRoleAsync`. Any `system.settings` holder deletes a super_admin-owned key. Direct coverage gap from A5 (which hardened PATCH at L86-90).
**Fix:** Select `existing.role`; apply `canManageRoleAsync(user.role, existing.role) || user.role === existing.role` mirroring PATCH.

### C2-H2 / NEW-H2 — Contest `accessCode` leaked to enrolled students
**Source:** code-reviewer NEW-H2 · **Validated:** `src/app/api/v1/groups/[id]/assignments/route.ts:54-68` (and detail route)
`db.query.assignments.findMany` has no top-level `columns` projection → returns `accessCode` (and `freezeLeaderboardAt`). A student reads it and hands it to an un-enrolled confederate who redeems it via `/contests/join` (auto-creates enrollment, no audit).
**Fix:** Project columns; omit `accessCode`/`freezeLeaderboardAt` for non-managers (branch on `canManageGroupResourcesAsync`).

### C2-H3 / NEW-H3 — Pre-restore snapshot failure proceeds to destructive import
**Source:** code-reviewer NEW-H3 · **Validated:** `src/app/api/v1/admin/restore/route.ts:149-151`; `src/lib/db/pre-restore-snapshot.ts` (returns null on any failure); same shape at `admin/migrate/import/route.ts:109-110,210-211`
`takePreRestoreSnapshot` returns `null` on mkdir/chmod/pipeline/stat failure; the route captures it and calls `importDatabase` regardless. After the import destroys production data, the response echoes a null `preRestoreSnapshotPath`.
**Fix:** Treat `null` as a hard precondition failure (500 `preRestoreSnapshotFailed`) before `importDatabase` in both routes.

### C2-H4 / NEW-H4 — Language `dockerImage` accepts arbitrary strings (RCE surface)
**Source:** code-reviewer NEW-H4 · **Validated:** `src/app/api/v1/admin/languages/route.ts:16` (POST); `admin/languages/[language]/route.ts` (PATCH)
`dockerImage: z.string().min(1).max(200)` with no call to the existing `isAllowedJudgeDockerImage`/`isLocalJudgeDockerImage` validators (which ARE enforced in `admin/docker/images/build/route.ts:62,78`). A `system.settings` holder sets `attacker-registry/pwn:latest`; the worker pulls and runs student code inside it.
**Fix:** Reuse the validators in POST and PATCH; reject non-`judge-*` tags.

### C2-H5 / NEW-H6 — Editorial thread content readable without problem access
**Source:** code-reviewer NEW-H6 · **Validated:** `src/app/(public)/community/threads/[id]/page.tsx:83` (+ `generateMetadata`)
Gate covers only `"problem" || "solution"`; `editorial`-scoped threads (typically full solutions) skip `canReadProblemDiscussion`. `generateMetadata` leaks title/description/author before body render.
**Fix:** Add `"editorial"` to the scope check in both the page and `generateMetadata`.

### C2-H6 / A2-durability — Restore audit is fire-and-forget, recorded before file-restore (5-agent convergence)
**Source agreement (5 agents):** architect REG-1 · tracer R1 · critic C-1 · security C2-3 · test-engineer NG-1 · **Validated:** `src/app/api/v1/admin/restore/route.ts:168`; `src/lib/audit/events.ts:252-285`
A2 moved the audit post-commit (correct vs the truncate) but used buffered `recordAuditEvent` — the plan/AGG-3 named `recordAuditEventDurable`. `recordAuditEventDurable` exists (events.ts:275, awaited insert, never throws). A DB restore is the canonical low-frequency high-stakes event; a SIGKILL/OOM in the 5s buffer window (or during the file-restore at L183 which runs AFTER the audit) loses the row. Also: audit summary claims "Restoring... N files pending" before `restoreParsedBackupFiles` runs.
**Fix:** `await recordAuditEventDurable(...)` at restore/route.ts:168 and migrate/import/route.ts:199; move the call to AFTER `restoreParsedBackupFiles` succeeds; past-tense summary. (`recordAuditEventDurable` never throws → safe swap.)

### C2-H7 / A7-residual — X-Real-IP trusted unconditionally when `TRUSTED_PROXY_HOPS=0`
**Source:** critic C-3 · **Validated:** `src/lib/security/ip.ts:113-117`
A7 correctly skips XFF when `trustedHops === 0`, but then falls through to `x-real-ip` which is trusted with no proxy-trust check. SEC-8's `=0` means "no trusted proxies" → every header is client-controlled, including X-Real-IP. Drives rate-limit keys, audit IPs, judge IP allowlist. The whole point of A7 was to not trust client headers in this mode.
**Fix:** Gate `x-real-ip` on `trustedHops > 0` (or a documented proxy-trust flag); when `=0`, fall through to socket remote address.

---

## MEDIUM (grouped — schedule; several small enough for this cycle)

**Restore/backup pipeline:**
- C2-M1 / AGG-1 Restore DB-before-files atomicity — `restore/route.ts:151,183` + `files/storage.ts:27-30`. Open; needs staging-then-rename design (architect PHB-1). **Defer w/ design note.**
- C2-M2 / AGG-2 Snapshot redacts auth fields (unrestoreable) — security escalated HIGH; `export.ts:104-106`. Needs snapshot-mode design + at-rest encryption gate (architect PHB-2). **Defer w/ design note** (separate from the small doc fixes).
- C2-M3 / AGG-20 TS compiler workspace 0o777 → 0o700 — `src/lib/compiler/execute.ts:742,749` (fallback paths). Small. **Do this cycle.**
- C2-M4 / AGG-16 Worker cleanup (inspect/kill/rm) no timeout — `judge-worker-rs/src/docker.rs:164,216,223` (3 agents: debugger, feature-dev FDR-4, architect NEW-2). Small Rust. **Do this cycle.**
- C2-M5 / AGG-18 code-similarity sidecar no submission cap — `code-similarity-rs/src/main.rs` (3 agents: code-reviewer CR-30, perf PERF-2, feature-dev FDR-3, architect PHB-3). Small Rust. **Do this cycle.**

**Authz (community):**
- C2-M6 / SEC-9 + NEW-M1 Community write/scope IDOR inconsistency — `community/threads/[id]/posts/route.ts:38`, `community/votes/route.ts:62-68`, page route. Centralize `{problem, solution, editorial}` scope check. **Do this cycle** (pairs with C2-H5).

**Worker/infra medium (defer):**
- AGG-15 catch_unwind (FDR-1), AGG-17 MAX_TIME_LIMIT clamp (FDR-2), NEW-M7 recruiting brute-force race, NEW-M8 zip-bomb streaming, AGG-45 function-judging C++ family breadth, N2 no wall-clock judging cap.

**Authz medium queue (defer):**
- NEW-M2 SSE re-auth (AGG-28), NEW-M3 contest export JSON no audit, NEW-M5 admin/settings no reconfirm, NEW-M6 roles PATCH target-level (AGG-25), NEW-M9 anti-cheat Origin (AGG-29), AGG-26 ownership transfer, AGG-30 anti-cheat IP rate.

**Perf medium queue (defer — covered by architect perf lane):**
- AGG-36..40 (PERF-3 SSE lock, PERF-4 rankings ISR, PERF-5/6 announcements/clarifications, PERF-7 submissions count, PERF-9 audit IN-array), PERF-1 backup streaming, F-1 canManageProblem DB hit per GET (critic).

**Audit reliability (defer):**
- AGG-41 117 fire-and-forget recordAuditEvent sites (critic F-2, test-engineer NG-2) — the A2 durable swap (C2-H6) is the flagship; the bulk conversion is a sub-cycle.

---

## Phase-A side-effect LOWs (cheap — do this cycle alongside their fix)
- C2-L1 / LOW-1: A12 migration-drift test times out at 30s (`tests/unit/infra/migration-drift-cleanup.test.ts:16`) — bump `testTimeout`. **Gate-relevant.**
- C2-L2 / LOW-2: A8 test writes `process.env.NODE_ENV` directly → `tsc --noEmit` TS2540 (`tests/unit/compiler/execute-implementation.test.ts:68`) — use the cast pattern.
- C2-L3 / LOW-4: A9 export omits `defaultLanguage` (`problems/[id]/export/route.ts`) — add to SELECT.
- C2-L4 / LOW-3: A6 threat-surface comment promises Zod that doesn't exist (`chat-widget/tools.ts:68-74`) — fix comment or add schemas.

---

## Docs (small — do this cycle)
- C2-D1 / doc-REG-1 + AGG-53: `validation.rs:84-86` false docstring (production entry point) — one-line rewrite.
- C2-D2 / doc-REG-2: AGENTS.md:427 still describes old `.env.production`-only 0600 policy — extend to all `.env*` + startup guard (A1).
- C2-D3 / AGG-51: `docs/api.md:78-83` CSRF doc lists only `X-Requested-With`; impl enforces `Sec-Fetch-Site`+`Origin`/`Host`.
- C2-D4 / AGG-52: AGENTS.md push-scan wording ("downgrades to warn") vs `die()`.
- DOC-2/DOC-3 (full-fidelity + snapshot comment) tracked under C2-M2 design.

---

## UI/UX (designer lane)
- **AGG-56 INVALIDATED** — `oklch(0.48 0 0)` recomputes to 6.54:1; passes AA. **Drop from backlog (false positive).**
- **designer REG-2 (P1):** `problems/[id]/edit/page.tsx:34` still uses loose `problems.edit` check while API uses strict `canManageProblem` — referenceSolution/hidden cases leak via the edit page. **Do this cycle** (pairs with A11).
- AGG-58/59/60/61 confirmed (h1, leaderboard hsl(var(--border)) invalid, recruit form, loading/error states). UI-1..UI-10 new. **Defer to a dedicated UX cycle** (P1 batch) with provenance.
- Korean letter-spacing: **CLEAN** (globals.css `html:lang(ko)` override + per-component guards).

---

## Cross-Agent Agreement (high-signal — flagged by ≥2 agents)

| Topic | Agents | Unified ID |
|---|---|---|
| A2 restore audit not durable / buffered | architect, tracer, critic, security, test-engineer | C2-H6 |
| Restore DB-before-files atomicity | code-reviewer NEW-C1/H3, tracer R2, architect PHB-1, security | C2-M1 + C2-C1 |
| code-similarity sidecar no cap | code-reviewer, perf, feature-dev, architect | C2-M5 |
| Worker cleanup timeouts | debugger, feature-dev FDR-4, architect | C2-M4 |
| Community scope inconsistency | security SEC-9, code-reviewer NEW-M1/H6 | C2-M6 + C2-H5 |
| api-keys DELETE gap (sibling of A5) | code-reviewer NEW-H1 | C2-H1 |
| AGG-44 rate-limiter overflow = non-issue | code-reviewer, feature-dev | **CLOSE** |

## Items verified FIXED / NON-ISSUES this cycle
- **AGG-44 / CR-29** rate-limiter overflow — **confirmed non-issue** (`MAX_CONSECUTIVE_BLOCKS_EXP = 4`, `2u64.pow ≤ 16`). Close Phase C item.
- **AGG-42** CSV injection — FIXED (`csv/escape-field.ts:13`).
- **AGG-34 / SEC-14** AUTH_URL enforcement — FIXED (`env.ts:127-132` throws in production).
- **AGG-56** contrast — **INVALIDATED** (false positive, 6.54:1).
- Phase A: 12/12 VERIFIED by verifier + code-reviewer + test-engineer (12/12 revert-RED).

## Carry-forward Phase B (still valid, deferred with provenance — see plan)
AGG-1 (design), AGG-2 (design), AGG-10 (plaintext migration), AGG-14 (deploy defaults — small, candidate), AGG-15, AGG-17, AGG-21..24, AGG-25..30 (medium), AGG-31..35, AGG-36..40, AGG-41 (bulk), AGG-43, AGG-45, AGG-54/55, NEW-M2..M9, N2, designer P1 batch (AGG-58..62, UI-1..10), test gaps (PB-1 AGG-63, PB-2 AGG-67, PB-3 AGG-68).

## Note on Deferrals
Detailed deferral records (file+line, original severity/confidence preserved, reason, exit criterion) are authored in PROMPT 2 under `plan/`. Per repo rules (CLAUDE.md, AGENTS.md, .context/**), security/correctness/data-loss findings are NOT silently dropped. The CRITICAL + HIGH items above are scheduled for THIS cycle; the MEDIUM/LOW deferrals each record a concrete exit criterion and quote the permitting repo rule where applicable.
