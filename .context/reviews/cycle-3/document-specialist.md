# Cycle 3/3 — Document Specialist

**HEAD:** c6f92a37

## Doc-drift items

| File | Line | Drift |
|---|---|---|
| `src/lib/navigation/public-nav.ts` | 105 | references deleted `AppSidebar.filterItems()` |
| `src/components/layout/public-header.tsx` | 37 | references deleted `AppSidebar`'s capability checks |
| `src/lib/auth/sign-out.ts` | 68 | references deleted `AppSidebar` as a co-consumer |
| `src/lib/assignments/active-timed-assignments.ts` | 18 | references deleted `getActiveTimedAssignmentsForSidebar` use site (also the function itself) |

All four drifts are comment-only; product behaviour is unaffected. Recommended fix this cycle: rewrite to the post-migration architecture (admin landing + dropdown surfaces, no sidebar).

## Per-CLAUDE.md rule audit
- Korean letter-spacing rule: 1 violation found (recruit results page; see security-reviewer/code-reviewer/debugger).
- GPG-sign rule: enforced by repo policy; cycle-1+2 commits are signed (verified by `%G?` in git log).
- Conventional commit + gitmoji format: cycle-1+2 commits comply.
- No README / docs files created in cycles 1+2.
- No `src/lib/auth/config.ts` modifications in cycles 1+2.

## Verdict
Doc-only fixes; trivially landable in cycle 3.
