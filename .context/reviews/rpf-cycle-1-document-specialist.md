# RPF Cycle 1 (orchestrator-driven, 2026-04-29) — Document Specialist

**Date:** 2026-04-29
**HEAD:** 32621804

## Doc/code mismatch scan

- `CLAUDE.md` deployment rule (preserve `src/lib/auth/config.ts`): verified file unchanged this cycle.
- `CLAUDE.md` Korean letter-spacing rule: verified by designer pass — all `tracking-*` usages gated.
- `CLAUDE.md` algo.xylolabs.com server architecture rule (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false`): aligned with `DEPLOY_CMD` provided by orchestrator.
- `plans/open/2026-04-19-workspace-to-public-migration.md` status reflects HEAD truthfully:
  - Phases 1-7 marked COMPLETE.
  - Phase 4 audit lists "remaining dashboard routes" — verified against the actual directory listing.
  - Phase 5 marked COMPLETE (cycle 26).
  - The migration plan is ready to be archived (per TODO #1 done criterion).

## Findings

### C1-DOC-1: [INFO] Migration plan ready for archival

The plan at `plans/open/2026-04-19-workspace-to-public-migration.md` describes phases 1-7 as complete. Verification against the source tree:

- `find src/app/'(workspace)'` → no files. ✓
- `find src/app/'(control)'` → no files. ✓
- `next.config.ts:20-52` declares 7 permanent (308) redirects covering `/workspace`, `/workspace/discussions`, `/dashboard/rankings`, `/dashboard/languages`, `/dashboard/compiler`, `/control`, `/control/discussions`. ✓
- Remaining `(dashboard)` routes match the documented "must stay in authenticated area" list (admin, contests, groups, problem-sets, problems, profile).

The plan's done criterion ("(workspace) removed or empty, every non-admin dashboard page either migrated or explicitly listed as 'stays' with a quoted reason, build+typecheck+lint+unit/playwright green, migration plan archived") is satisfiable this cycle once gates pass.

### C1-DOC-2: [INFO] User-injected TODO #1 satisfied

The TODO file (`plans/user-injected/pending-next-cycle.md`) requires migrating "every non-admin page out of `(workspace)` and `(dashboard)` into `(public)`". The migration plan now correctly distinguishes "moved" vs. "stays-with-reason". No silent drops.

## Net new findings: 0
