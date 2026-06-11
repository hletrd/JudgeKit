# Document Specialist Review — RPF Cycle 4 (Loop 4/100)

**Date:** 2026-04-24
**Reviewer:** document-specialist
**Base commit:** a717b371

## Inventory of Reviewed Documentation

- `README.md` (root)
- `CLAUDE.md` (root)
- `AGENTS.md` (root)
- `docs/` directory
- `src/lib/db-time.ts` (inline documentation)
- `src/lib/security/api-rate-limit.ts` (inline documentation)
- `src/lib/realtime/realtime-coordination.ts` (inline documentation)
- `src/proxy.ts` (inline comments)
- `src/app/api/v1/judge/claim/route.ts` (inline comments)
- `src/app/api/v1/submissions/[id]/events/route.ts` (inline comments)
- `.context/development/` (if exists)
- `plans/open/` (existing plans)
- `plans/README.md`

## Doc-Code Mismatch Analysis

### DOC-1: SSE route ADR [LOW/LOW — carry-over]

**Description:** Known carry-over. An Architecture Decision Record for the SSE streaming route would be useful but not urgent.

**Status:** Carry-over.

---

### DOC-2: Docker client dual-path docs [LOW/LOW — carry-over]

**Description:** Known carry-over. Docker client documentation covers two paths but could be clearer.

**Status:** Carry-over.

---

### Documentation Quality Assessment

1. **`src/lib/db-time.ts`**: Excellent documentation explaining why `getDbNow()` uses React.cache(), why `getDbNowUncached()` exists for non-React contexts, and why it throws instead of falling back to app-server time.

2. **`src/lib/security/api-rate-limit.ts`**: Clear documentation of the two-tier strategy (sidecar + DB), the `WeakMap` per-request dedup pattern, and the `checkServerActionRateLimit` DB-time rationale.

3. **`src/app/api/v1/judge/claim/route.ts`**: The comment at line 123-125 clearly explains the clock-skew rationale for using `getDbNowUncached()`: "Use DB server time for claimCreatedAt to avoid clock skew between app and DB servers. The stale claim detection compares judge_claimed_at against NOW() in SQL, so the timestamp must be DB-consistent."

4. **`src/proxy.ts`**: The comment at lines 145-156 explaining the `x-forwarded-host` deletion for Next.js 16 RSC bug is thorough and includes the safety constraint about not adding `/api/auth/` to the proxy matcher.

5. **Inline code documentation** across the codebase is consistently high quality with clear "why" explanations, not just "what" comments.

## New Findings

**No new documentation-code mismatches this cycle.** All inline documentation accurately reflects the current code behavior. The `getDbNowUncached()` comment in the judge claim route correctly documents the fix. All prior doc findings remain valid as carry-overs.
