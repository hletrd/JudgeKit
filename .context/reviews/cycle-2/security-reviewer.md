# Cycle 2/3 — Security Reviewer

**HEAD:** main / 2198a39b
**Scope:** check that cycle-1 IA changes did not introduce auth/capability bypass.

## S2-01 — `getDropdownItems` cap filter — PASS / HIGH
- `src/lib/navigation/public-nav.ts:95-102`
- Items with no `capability` are always visible; capability-gated items checked against passed-in caps. No bypass.

## S2-02 — Admin landing redirect when no caps — PASS / HIGH
- `src/app/(dashboard)/dashboard/admin/page.tsx:82-84` redirects unauthorised users to `/dashboard`. Each card item also gates by `caps.has(item.capability)` before render. Server-side enforcement for actual admin pages happens at each route — not weakened.

## S2-03 — Cap-unaware top nav (functional risk only) — INFO
- Adding `/groups`/`/problem-sets` to top nav for capable users is purely UI; the route handlers still enforce caps. No new attack surface.

## S2-04 — Dead `ConditionalHeader` does not strip auth chrome — INFO
- Component never reached; deleting it has zero auth implication.

## S2-05 — Re-introducing platform-mode badge — RECOMMENDED (low-risk)
- Surface `effectivePlatformMode` (already passed by `(dashboard)/layout.tsx:32`) in `PublicHeader.trailingSlot` as a `<Badge>`. This is metadata the user already has; no new privilege exposure.

## Quality gates impact
- No security gate (vitest security suite) failures introduced or resolved by recommended cycle-2 changes (other than the pre-existing `rate-limit.test.ts` that remains deferred per cycle-1).

## Verdict
No new security issues. Cleanup-only cycle.
