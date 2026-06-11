# Critic (multi-perspective) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)

## Critique of the current state

1. **The platform keeps fixing the same class of bug one table at a time.**
   Cycle 0 fixed unbounded growth nowhere, cycle 1 fixed `source_drafts`
   (F2), and TODAY `code_snapshots` — a strictly higher-volume table — is
   still unpruned and its write route still accepts unvalidated language
   strings (`code-snapshots/route.ts:14-19`). The remediation should not just
   patch the table; it should add a class-closing check. Concrete suggestion:
   a unit test that walks `schema.pg.ts` for tables with a
   user-writable-row + timestamp shape and asserts each is either in
   `DATA_RETENTION_DAYS` or on a documented allowlist (mirrors the cycle-1
   CSP-matcher class-closer F5). MEDIUM.

2. **F12 shipped the staff half of time extensions but not the student
   half.** The grant works (verified), but the student-facing countdown is a
   static prop and the page's expired-state gate is render-time
   (`assignments/[assignmentId]/page.tsx:168-201`). The accommodation story
   is incomplete in exactly the high-stress moment it exists for. Shared
   with verifier V2-1. LOW-MEDIUM.

3. **Deploy reliability is now the weakest link in the loop.** Two of three
   targets needed manual operator rescue in cycle 1 (BuildKit history
   corruption). The script has good DB-safety bones but no resilience to
   builder-state corruption, and its all-languages path maximizes the
   trigger (90-target parallel bake on cold cache,
   `deploy-docker.sh:651-656`). The injected DEFERRED-OPS-1 hardening is
   the right next move; do it BEFORE this cycle's deploy. HIGH (ops).

4. **Review-artifact sprawl.** `.context/reviews/` carries ~36 dated
   aggregates plus per-agent files from many series; `plans/done` has 184
   entries. Navigability for the owner is degrading. Not this cycle's
   blocking work, but a `_archive/` sweep of pre-2026-06 review files is
   cheap and reduces confusion about what is current. LOW.

5. **What cycle 1 got right** (credit where due): every fix it shipped
   verified clean (see verifier.md); the deslop pass caught its own two
   regressions; the migration-journal drift catch-up (F6 bonus) closed a
   real DR gap that pre-dated the cycle.

## Priority ordering for cycle 2
1. DEFERRED-OPS-1 deploy hardening (HIGH ops, injected; gates the deploy).
2. code_snapshots retention + language gate (MEDIUM, two-sided fix).
3. Rate-limit insert race (LOW-MEDIUM correctness in a security control).
4. Student-visible extension refresh (LOW-MEDIUM, completes F12).
5. Class-closer retention-coverage test (MEDIUM leverage).
6. Dialog polish + journal newline (LOW, batch).
