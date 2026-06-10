# Security Reviewer — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c (main)
**Change surface:** 76 commits since the cycle-9 baseline (24939e42), with primary
depth on the 30 commits after the 2026-06-03 multi-agent review HEAD (804c8db3)
— i.e. the remediation implementations themselves plus the Jun-4/5 follow-up
fixes, which no prior review pass has examined.

## Method / inventory
- Enumerated the full diff `804c8db3..HEAD` (67 files) and `24939e42..HEAD`
  (144 files); every changed file was inspected; key flows traced into their
  unchanged callees (`claim-query.ts` → `poll/route.ts` → `worker-staleness-sweep.ts`;
  `system-settings.ts` → `platform-mode-context.ts` → compiler/playground routes;
  draft route → `source-draft-store.ts`; CSP matcher → `next.config.ts` fallback).
- Re-verified each of the 16 remediation fixes (C1, H1–H6, M1–M6, L1–L3) against
  the actual implementation, not the plan text.

## NEW findings

### S1 — Draft API accepts arbitrary `language` strings → unbounded `source_drafts` growth (MEDIUM, confidence High)
`src/app/api/v1/problems/[id]/draft/route.ts:17-19` — `putSchema` validates
`language: z.string().min(1).max(64)` but never checks it against the judge
language registry. The store upserts one row per `(user, problem, language)`
(`src/lib/drafts/source-draft-store.ts`), so every distinct 64-char string is a
NEW row of up to 65,536 bytes. `source_drafts` has **no retention pruning**
(`src/lib/data-retention-maintenance.ts` prunes 6 tables; drafts are not one of
them) and no per-user row cap.
**Failure scenario:** a hostile authenticated student/candidate scripts
`PUT /draft` with random `language` values at the rate limit for days →
millions of 64 KiB rows; table bloat degrades the upsert index and backup
size/time on the production DB.
**Fix:** validate `isJudgeLanguage(body.language)` (the client only ever sends
real editor languages, so this is non-breaking) in PUT and DELETE; optionally
cap rows per (user, problem).

### S2 — CSP nonce matcher cannot cover unknown-path 404s (LOW, confidence Medium)
`src/proxy.ts:391-427` — commit 6035ca83 extended the **enumerated** matcher
(`/problems`, `/groups`, `/profile`, `/privacy`), but enumeration structurally
cannot cover (a) the root not-found page rendered for unmatched paths (e.g.
`/asdf`) and (b) any future top-level route an author forgets to add. Those
requests fall to the static fallback CSP in `next.config.ts:170`
(`script-src 'self'`), which blocks Next.js streaming inline scripts — console
CSP violations and a non-hydrated 404 page. Same class as SEC-21-3; this is the
second patch extending the list, i.e. the enumeration is a recurring-regression
generator.
**Fix:** negative-lookahead catch-all matcher (after verifying the middleware
is safe/cheap on arbitrary paths), or document the 404-page exception.
Severity LOW (the fallback is *stricter*, not weaker; 404 content still renders).

### S3 — examMode integrity enforced client-side only (LOW, confidence Medium)
Commit 2388302e normalizes a corrupt `exam_mode` (observed `"0.0"` in prod)
in the form (`assignment-form-dialog.tsx:125-129`) — but server-side readers
branch on raw values: `exam-session/route.ts` (`examMode === "none"` → not an
exam) vs `startExamSession` (`!== "windowed"` throws), proctoring gates, etc.
A corrupt value is neither `"none"` nor `"windowed"`, so readers disagree about
whether the assignment is an exam. The corrupt prod row was fixed out-of-band,
but nothing prevents recurrence (no DB CHECK constraint on
`assignments.exam_mode`).
**Fix:** CHECK constraint migration (`exam_mode IN ('none','scheduled','windowed')`)
or normalize-at-read in the assignment loader.

## Remediation fixes re-verified SOUND (no finding)
- **H1/canManageProblem** (`permissions.ts:186-217`): admin → allow; author →
  allow; else requires `problem_group_access` ∩ taught groups. Public visibility
  does NOT grant write. Orphan problems writable only by author/admin. Correct.
- **M1 ownership transfer** (`groups/[id]/route.ts:140-151`): `instructorId`
  gated on current-owner OR `groups.view_all` — co-instructor takeover closed.
- **L2 exam-session ?userId** (`exam-session/route.ts:104-117`): now
  `canViewAssignmentSubmissions` only; bare `contests.view_analytics` removed.
- **H3/M3 + users/[id] DELETE** (`users/[id]/route.ts:473-489`): recruiting PII
  scrubbed in the same `execTransaction` BEFORE the FK set-null cascade —
  correct ordering (scrub keyed on `userId` while rows are still linked).
- **H2 audit retention** (`data-retention-maintenance.ts:86-90`): auditEvents
  added to the pruning `Promise.allSettled`; cutoff from DB clock.
- **L1 judge /register rate limit** (`register/route.ts:35-41`): IP-keyed and
  placed AFTER token auth, so an unauthenticated flood can't consume the bucket
  to lock out a real worker — good ordering.
- **Durable audit** (`audit/events.ts` recordAuditEventDurable): awaited insert
  with buffer fallback, never throws.
- **NODE_ENCRYPTION_KEY startup gate**, **JUDGE_ALLOWED_IPS startup warning**,
  **gVisor opt-in runtime** (inert until `JUDGE_OCI_RUNTIME` is set): all sound.
- **Recruiting consent/privacy link + PRIVACY_CONTACT_EMAIL**: present, en+ko.

## Final sweep
Checked: no secrets in new diffs; no new raw-SQL injection surface
(`prev_worker_release` uses named params only); draft endpoints owner-scoped
(auth + canAccessProblem + per-user rate limit); no new header-injection paths;
`src/lib/auth/config.ts` untouched (CLAUDE.md rule); no `tracking-*` on Korean
text in new UI. No HIGH finding this cycle.
