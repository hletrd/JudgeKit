# Cycle 4 — Architect Review

> Generated: 2026-05-14
> Reviewer: single-pass comprehensive review (no registered subagents available)
> Scope: API patterns, component architecture, proxy config, deployment
> Base commit: bc7e5998

---

## Summary

No new CRITICAL, HIGH, or MEDIUM findings. One architectural inconsistency remains from prior cycles; all others have been resolved.

## Verified Fixes

| ID | Severity | File | Finding | Status |
|----|----------|------|---------|--------|
| F3 | LOW | `src/proxy.ts` | Dead `/workspace/:path*` matcher after Phase 1 migration | FIXED — removed from matcher config |
| F2 | LOW | Multiple routes | Inconsistent API handler patterns | PARTIALLY FIXED — tags route migrated to `createApiHandler`; remaining manual routes (SSE, file upload, admin/migrate) have legitimate reasons |

## Remaining Architectural Item

### F1 — PublicHeader Authenticated Dropdown Menu (Phase 2 Prerequisite)
- **Severity:** LOW (feature gap, not a bug)
- **File:** `src/components/layout/public-header.tsx`
- **Status:** Still present. Authenticated users on public pages see only a single link instead of a role-appropriate dropdown menu. Tracked in `plans/open/2026-04-19-workspace-to-public-migration.md` Phase 2.

## Design Observations

1. **API handler consolidation** (`createApiHandler`) is now used by the vast majority of routes. The wrapper correctly handles auth, CSRF, rate limiting, body validation, and security headers. Remaining manual routes (SSE events, file uploads, admin migrations) have streaming or multipart requirements that justify the manual pattern.

2. **Platform mode enforcement** is consistent across `compiler/run` and `playground/run` — both call `getEffectivePlatformMode` and check `restrictStandaloneCompiler`. No bypass paths identified.

3. **Rust worker architecture** properly separates concerns: API client, executor, Docker runner, and heartbeat tasks are cleanly modularized with graceful shutdown support.

## Conclusion

Architecture is stable and well-layered. The remaining Phase 2 migration item is a planned feature, not a defect.
