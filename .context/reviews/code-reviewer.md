# Cycle 2 — code-reviewer

Repo: `/Users/hletrd/flash-shared/judgekit` · Head: `ad543e14` · Cycle-1 head: `0b0ac198` · Scope: regression-check 12 Phase A fixes, confirm Phase B backlog, hunt new issues.

Gates run: `npm run lint` PASS (exit 0) · `npx tsc --noEmit` 1 error in test file only (see LOW-2) · `npm run test:unit` 2949/2951 pass, 2 timeouts (see LOW-1 + pre-existing flake) · `npm run build` did not complete in 9 min (process stalled at ~1% CPU, killed; not a regression signal — lint+tsc+unit cover the change surface) · `cargo test` not re-run (validation.rs env-race fix verified by inspection — `grep set_var/remove_var` returns nothing).

---

## REGRESSION CHECK (Phase A, 12/12)

All 12 fixes re-read in full context. All 12 achieve their stated purpose and introduce **no production-code regression**.

**A1** `40250e63` env 0600 + startup guard — VERIFIED. `src/lib/security/env.ts:182-211`. Minor gap: `resolveLoadedEnvFilePath` returns first existing candidate only — see LOW-5.
**A2** `7548c7a6` restore audit post-commit — VERIFIED. `restore/route.ts:151-180`. Comment claim "mirroring user-deletion durable helper" slightly inaccurate (both use fire-and-forget `recordAuditEvent`, not `recordAuditEventDurable`). Residual crash-window loss = AGG-41 (Phase B), not a regression.
**A3** `f9d72920` group DELETE IDOR — VERIFIED. `groups/[id]/route.ts:197-217`. `instructorId` selected inside `for("update")` tx; `canManageGroupResourcesAsync` + `groups.view_all`.
**A4** `b10e5216` student→co_instructor — VERIFIED. `instructors/route.ts:87-89`. `getRoleLevel(targetUser.role) <= 0`.
**A5** `08ac027a` api-key PATCH escalation — VERIFIED, but see NEW-H1 (DELETE sibling not hardened). `api-keys/[id]/route.ts:51,86-90`.
**A6** `35d08f2a` chat-widget sanitize — PARTIAL. `sanitizePromptInput` on both branches; threat-surface comment claims Zod validation that does not exist (LOW-3). Functional security preserved by `context.userId` scoping.
**A7** `ac5289f3` XFF spoofing hops=0 — VERIFIED. `ip.ts:97`. `trustedHops === 0` skips XFF entirely.
**A8** `dcaf9109` compiler import throw — VERIFIED, with test nit (LOW-2). `execute.ts:64-73`.
**A9** `4b93c5ff` function export fields — VERIFIED, with field gap: `defaultLanguage` still omitted (LOW-4). `export/route.ts:21-23`.
**A10** `1f6d15d4` Rust validation env-race — VERIFIED. Pure `_with_config` variants; `grep set_var/remove_var/unsafe` clean across all three crates.
**A11** `d4efef27b` problems/[id] GET strict — VERIFIED. `route.ts:65`. Consistent with PATCH (L106)/DELETE (L227).
**A12** `b860f53a` git clean removal — VERIFIED, with flaky test (LOW-1). `check-migration-drift.sh:77-105`.

---

## PHASE-B CONFIRMATION

`git log 0b0ac198..ad543e14` contains only the 12 Phase A commits + docs commit. None of the Phase B backlog is fixed/obsolete. AGG-44 (rate-limiter overflow) **confirmed non-issue**: `MAX_CONSECUTIVE_BLOCKS_EXP = 4` (`rate-limiter-rs/src/main.rs:40`), so `2u64.pow(exp)` max = 16. Phase C "verify-first" item can be closed.

AGG-20 partial only: `execute.ts:728` chmod 0o700 happy-path, but fallback paths at **L742 and L749 still chmod 0o777**. Still valid.

---

## FINDINGS — NEW

### CRITICAL

**NEW-C1 — Silent data loss when restoring an export that omits any known table**
- Files: `src/lib/db/import.ts:127-148` (truncate-then-skip); validation gap at `src/lib/db/export.ts:305-364` (`validateExport`)
- Confidence: HIGH
- Problem: `importDatabase` runs `tx.delete(table)` on every entry of `getReversedTableOrder()` unconditionally, then iterates `getTableOrder()` and does `if (!tableData || tableData.rowCount === 0) continue;` (L145). A table present in the live schema but absent from the incoming export has already been truncated and is never refilled. `validateExport` only checks that *present* tables are known — never asserts all known tables are present.
- Failure scenario: Operator restores an archive produced before `discussionThreads`/`examSessions`/`recruitingInvitations`/`contestAccessTokens`/`scoreOverrides`/`codeSnapshots` existed. Export validates clean. Truncate wipes those tables. Insert loop `continue`s. Transaction commits `success: true`. Tables empty.
- Fix: In `validateExport` (or before truncate), compute `knownTables - presentTables`; reject with `missingTables`, or skip truncation of absent tables. Mirror in `admin/migrate/validate/route.ts:83`.

### HIGH

**NEW-H1 — api-keys DELETE skips the `canManageRoleAsync` gate A5 added to PATCH**
- File: `src/app/api/v1/admin/api-keys/[id]/route.ts:110-132`
- Confidence: HIGH
- Problem: DELETE requires only `system.settings`; fetches `existing` as `{id, name}` (L114) — never fetches `role`; no `canManageRoleAsync` check. Any admin with `system.settings` can DELETE a super_admin-owned API key.
- Fix: Fetch `existing.role`; apply the same `canManageRoleAsync(user.role, existing.role) || user.role === existing.role` gate as PATCH (L86-90). Direct gap in A5's coverage.

**NEW-H2 — Contest `accessCode` leaked to enrolled students via unprojected SELECT**
- Files: `src/app/api/v1/groups/[id]/assignments/route.ts:56-68` (list); `groups/[id]/assignments/[assignmentId]/route.ts:25-44` (detail)
- Confidence: HIGH
- Problem: Both GETs call `db.query.assignments.findMany/findFirst` with no top-level `columns` projection. RQB returns every column including `accessCode` (`schema.pg.ts:348`). Otherwise gated behind `contests.manage_access_codes` AND `canManageContest` at `contests/[assignmentId]/access-code/route.ts`.
- Fix: Add `columns: {...}` omitting `accessCode`/`freezeLeaderboardAt` for non-managers; branch on `canManageGroupResourcesAsync`.

**NEW-H3 — Pre-restore snapshot failure does not abort the destructive import**
- Files: `src/app/api/v1/admin/restore/route.ts:149-160`; `src/lib/db/pre-restore-snapshot.ts:54-125` (returns `null` on every failure mode); same shape at `admin/migrate/import/route.ts:109-110, 210-211`
- Confidence: HIGH
- Problem: `takePreRestoreSnapshot` returns `null` on mkdir/chmod/pipeline/stat failures. The restore route captures `preSnapshotPath` and proceeds to `importDatabase` regardless of whether the snapshot succeeded.
- Fix: Treat `null` as a hard precondition failure in both routes; return 500 `preRestoreSnapshotFailed` before calling `importDatabase`.

**NEW-H4 — Language config accepts arbitrary `dockerImage` with no allowlist check**
- Files: `src/app/api/v1/admin/languages/route.ts:16,71,92` (POST); `admin/languages/[language]/route.ts` (PATCH)
- Confidence: HIGH
- Problem: POST/PATCH accepts `dockerImage: z.string().min(1).max(200)` with no call to `isAllowedJudgeDockerImage`/`isLocalJudgeDockerImage` (which exist in `judge/docker-image-validation.ts` and are enforced in `admin/docker/images/build/route.ts:62,78`). The stored value is what the Rust worker pulls and runs.
- Failure scenario: `system.settings` holder sets `dockerImage: "attacker-registry/pwn:latest"` → worker pulls and executes student code inside attacker-controlled image.
- Fix: Reuse `isAllowedJudgeDockerImage` + `isLocalJudgeDockerImage` in POST and PATCH.

**NEW-H5 — Judge `/claim` shared-token fallback when `workerId` absent**
- Files: `src/app/api/v1/judge/claim/route.ts:171-180`; `src/lib/judge/ip-allowlist.ts` default-open; `judge/poll/route.ts` accepts shared token when `submission.judgeWorkerId` is null
- Confidence: MEDIUM (exploitability depends on misconfig: leaked shared token + no IP allowlist)
- Problem: Per-worker `secretTokenHash` hardening only applies when `workerId` is supplied; the `else` falls back to shared `JUDGE_AUTH_TOKEN`. Default-open IP allowlist + leaked shared token → arbitrary source claims submissions and POSTs verdicts.
- Fix: Default-deny judge routes when no IP allowlist configured; remove shared-token fallback on `/judge/claim`.

**NEW-H6 — Editorial thread content readable without problem access**
- Files: `src/app/(public)/community/threads/[id]/page.tsx:83-91` (and `generateMetadata` at L26)
- Confidence: HIGH
- Problem: Access gate only covers `scopeType === "problem" || "solution"`. `editorial`-scoped threads skip the `canReadProblemDiscussion` check. `generateMetadata` leaks title/description/author before body renders.
- Fix: Add `"editorial"` to the scope check in both `CommunityThreadDetailPage` and `generateMetadata`.

### MEDIUM

**NEW-M1** — Three community routes use three different scope-coverage sets. Centralize `assertProblemScopedThreadAccess` covering `{problem, solution, editorial}`. (Overlaps SEC-9.)
**NEW-M2** — SSE submission-events re-checks identity, not submission access. `submissions/[id]/events/route.ts:462-477`. (AGG-28.)
**NEW-M3** — Contest export JSON path serves full PII with no audit when `?download=1` omitted. `contests/[assignmentId]/export/route.ts:58,113-125`.
**NEW-M4** — Backup ZIP without `backup-manifest.json` bypasses all integrity verification. `export-with-files.ts:282-295,310-344`.
**NEW-M5** — `admin/settings` PUT mutates privilege-affecting fields with no password re-confirmation. `admin/settings/route.ts:37-148`.
**NEW-M6** — `roles` PATCH does not check actor level vs target role's CURRENT level. `admin/roles/[id]/route.ts:52-138`. (AGG-25.)
**NEW-M7** — Recruiting-token brute-force lockout bypassable with concurrent requests. `recruiting-invitations.ts:533-622,96-115`.
**NEW-M8** — ZIP-bomb slow-path decompresses each entry fully before applying the per-entry cap. `files/validation.ts:96-107`.
**NEW-M9** — Anti-cheat Origin enforcement silently disabled when `AUTH_URL` unset. `contests/[assignmentId]/anti-cheat/route.ts:63-79`. (AGG-29.)

### LOW (capped at 8)

**LOW-1** A12 flaky migration-drift test times out at 30s. `tests/unit/infra/migration-drift-cleanup.test.ts:16`. Bump timeout to 120s.
**LOW-2** A8 test writes `process.env.NODE_ENV` directly, tripping `tsc --noEmit` TS2540. `tests/unit/compiler/execute-implementation.test.ts:68`. Use the cast pattern.
**LOW-3** A6 threat-surface comment claims Zod validation that does not exist. `tools.ts:68-74`.
**LOW-4** A9 export omits `defaultLanguage`. `export/route.ts:15-33`.
**LOW-5** A1 startup guard only checks the first existing env file. `env.ts:150-169`.
**LOW-6** CSV "truncated" `#`-prefixed row breaks RFC-4180 parsers. `contests/[assignmentId]/export/route.ts:176`.
**LOW-7** `/api/v1/health` leaks `APP_VERSION`/uptime to anonymous. `health/route.ts:8-42`.
**LOW-8** `isTrustedServerActionOrigin` returns true for missing Origin when `NODE_ENV !== "production"`. `server-actions.ts:20-44`.

---

## Open Questions (surfaced, not blocking)

- Custom-role privilege escalation via capability-preservation + level adjustment + self-reassignment (= NEW-M6).
- Possible unbounded memory growth during ZIP restore (~700 MB heap peak). Overlaps AGG-21.
- JSON-body import path bypasses file-extension safety net. `admin/migrate/import/route.ts:46-128`.
- `extractLinkedFileIds` regex unanchored. `problem-links.ts:1-4`.

---

## Recommendation

**REQUEST CHANGES** — 1 CRITICAL + 6 HIGH block ship: NEW-C1, NEW-H1, NEW-H2, NEW-H3, NEW-H4, NEW-H5, NEW-H6. 9 MEDIUM worth scheduling (NEW-M1, NEW-M6 confirmed exploitable). 4 LOWs (LOW-1..4) are direct side-effects of Phase A commits. Phase B entirely still-valid; Phase C AGG-44 resolved-as-non-issue.
