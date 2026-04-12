# Review status and archival note — 2026-04-12

This note records which review lines already remain covered by archived plan artifacts so they do not get reopened accidentally.

## Already implemented / archived review lines

### `.context/reviews/comprehensive-code-review-2026-04-09.md`
- **Status:** archived as implemented
- **Evidence:** `plans/archive/2026-04-11-comprehensive-code-review-2026-04-09-plan.md` records the associated backlog as completed at `HEAD`.

### `.context/reviews/comprehensive-code-review-2026-04-10.md`
- **Status:** archived as implemented
- **Evidence:** `plans/archive/2026-04-11-comprehensive-code-review-2026-04-10-plan.md` records the associated backlog as completed at `HEAD`.

### `.context/reviews/comprehensive-review-2026-04-09.md`
- **Status:** archived as implemented
- **Evidence:** `plans/archive/2026-04-11-comprehensive-review-2026-04-09-plan.md` records the associated backlog as completed at `HEAD`.

### `.context/reviews/comprehensive-security-review-2026-04-10.md`
- **Status:** archived as implemented
- **Evidence:** the source review includes a remediation addendum saying all actionable findings were addressed in the working tree.

### `.context/reviews/deep-code-review-2026-04-12.md`
- **Status:** archived as implemented
- **Evidence:** `plans/archive/2026-04-12-deep-code-review-remediation-plan.md` records the review findings as completed at `HEAD`.

### `.context/reviews/deep-code-review-2026-04-12-post-remediation.md`
- **Status:** archived as implemented
- **Evidence:** `plans/archive/2026-04-12-post-remediation-review-plan.md` records the remaining post-remediation backlog as completed at `HEAD`.

## Superseded review lines

### `.context/reviews/comprehensive-code-review-2026-04-07.md`
- **Status:** archived as superseded
- **Reason:** later 2026-04-09 / 2026-04-10 reviews revisit the same surfaces with fresher evidence and were themselves planned/executed.

### `.context/reviews/comprehensive-code-review-2026-04-09-worktree.md`
- **Status:** archived as implemented/superseded
- **Reason:** its concrete findings already map to completed remediation work and no fresh open plan is needed.

### `.context/reviews/comprehensive-security-review-2026-04-09.md`
- **Status:** archived as superseded
- **Reason:** the 2026-04-10 security review is the fresher authoritative security artifact and already includes closure evidence.

### `.context/reviews/_archive/*`
- **Status:** historical review context only
- **Reason:** retained for reference, not for new implementation planning.

## Open review lines after this pass
None.

The 2026-04-12 multi-perspective and adversarial-security review plans were implemented and archived on 2026-04-12, so there are currently no active open review plans under `plans/open/`.

## Post-completion verification note
- 2026-04-12: restored the missing `db:push` package script expected by local Playwright/CI web-server flows and added `scripts/playwright-local-webserver.sh` so local Playwright starts against a fresh ephemeral PostgreSQL instance before seeding, syncing languages, building, and starting the app.

- 2026-04-12 follow-up: added an admin-side resume-code reset path for redeemed recruiting invitations so candidates who lose their resume code can be recovered without reopening invite-link replay.
