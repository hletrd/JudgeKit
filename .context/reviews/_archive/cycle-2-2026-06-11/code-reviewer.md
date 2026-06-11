# Code Reviewer — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)
**Scope:** full repo with line-level depth on cycle-1's change surface
(f977ef4c..4cf01035 — 15 commits, 23 source files), the 112-route API
inventory, lib subsystems, and deploy tooling.
**Gates at review start:** tsc 0 · eslint 0/0 · lint:bash clean · unit 332
files / 2571 tests PASS.
**Method note:** no reviewer subagents are registered in this environment;
this lens was executed directly by the cycle agent against the code-quality
checklist (logic, SOLID, edge cases, maintainability).

## Findings

### CR2-1 — `code_snapshots` POST accepts an unvalidated, unbounded `language` string (MEDIUM, High confidence, CONFIRMED)
`src/app/api/v1/code-snapshots/route.ts:14-19`: the schema is
`language: z.string().min(1)` — no max length, no registry gate — while both
sibling write surfaces are gated (`src/app/api/v1/submissions/route.ts:207`
and, since cycle-1 F2, `src/app/api/v1/problems/[id]/draft/route.ts` via
`isJudgeLanguage`). Failure: any authenticated student can insert snapshot
rows whose `language` is megabytes of junk (nginx body cap is 50 MB;
`sourceCode` is capped at 256 KiB but `language` is not), polluting the
anti-cheat timeline. The real client only ever sends judge languages
(`problem-submission-form.tsx:158`), so gating is non-breaking. Fix: mirror
the draft-route gate (`isJudgeLanguage` → 400 `languageNotSupported`) + test.

### CR2-2 — Rate-limit first-insert race can 500 a user request (LOW-MEDIUM, Medium confidence, CONFIRMED by code reading)
`src/lib/security/api-rate-limit.ts:84-92` (atomicConsumeRateLimit), `:244-252`
(consumeUserDailyQuota), `:353-361` (checkServerActionRateLimit), and the
shared insert branch at `src/lib/security/rate-limit-core.ts:96-104`: when no
row exists for a key, `SELECT ... FOR UPDATE` locks nothing, so two concurrent
first hits both reach the bare `INSERT`; the loser throws a unique violation,
aborting the transaction → `createApiHandler` catch → 500. Concrete trigger:
one user's two tabs autosaving a draft simultaneously on a fresh
`api:source-draft:user:<id>` bucket, or a shared-IP burst on a brand-new
endpoint key after deploy. Fix: `.onConflictDoNothing({ target:
rateLimits.key })`; if 0 rows inserted, re-read (row now exists, FOR UPDATE
works) and fall through to the update path. Same shape at all four sites.

### CR2-3 — ExamExtendDialog input polish (LOW, High confidence)
`src/app/(public)/groups/[id]/assignments/[assignmentId]/exam-extend-dialog.tsx`:
(a) the minutes `<Input type="number">` lacks `inputMode="numeric"`; (b) no
Cancel button and no `<form>`, so Enter does not submit. Used mid-incident
under time pressure — cheap to fix.

### CR2-4 — `drizzle/pg/meta/_journal.json` missing trailing newline (INFO)
Cosmetic; bundle with the next journaled migration.

## Verified-good (explicitly re-checked, no action)
- **Cycle-1 F1 accounting is sound:** `candidate` is `LIMIT 1`
  (`src/lib/judge/claim-query.ts:51`), so the worker_bump compensation
  (`:120-124`) is 0/1 and only applies when `claimed` is non-empty. Every
  requeue path nulls `judgeWorkerId` (`submissions/[id]/rejudge/route.ts:49`,
  `admin/submissions/rejudge/route.ts:63`, `admin/workers/[id]/route.ts:91`,
  `judge/deregister/route.ts:92`, poll finalize `judge/poll/route.ts:145`), so
  a `pending` row pointing at a live worker cannot occur.
- **Cycle-1 F3 join removal is safe:** `accessFilter` on `/problems`
  references problems.* only (`buildAccessFilter`/`buildTaughtGroupAccessFilter`,
  `problems/page.tsx:97-138`); the users-referencing search filter is
  correctly NOT passed into `getCatalogNumbersForIds`.
- **Cycle-1 F12 cannot leak past-close submission to unextended users:**
  `startExamSession` clamps `personalDeadline` to the assignment deadline
  (`exam-sessions.ts:83-86`); only an explicit staff extension can move it
  past close, and non-exam assignments never have a session row.
- `namedToPositional` deduplicates repeated `@param` placeholders
  (`src/lib/db/named-params.ts:40-46`) — the ipOverlap CTE's double
  `@assignmentId` is handled.
- `recordAuditEventDurable` never throws (`src/lib/audit/events.ts:275-285`),
  so the exam-extend route cannot 500 after applying an extension.

## Final sweep
TODO/FIXME scan: only the two known Next.js-workaround TODOs in contest
layouts. No new suppressions in the cycle-1 diff. i18n keys added by cycle 1
(numberHint, draftRecovered*, restrictedModeOverridesActive, ipOverlap.*,
examExtend.*) verified present in both en.json and ko.json.
