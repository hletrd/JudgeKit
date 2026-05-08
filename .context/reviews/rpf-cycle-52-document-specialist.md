# Cycle 52 — Document Specialist

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** document-specialist

## Inventory of Reviewed Files

- `src/lib/seo.ts` (full)
- `src/lib/security/sanitize-html.ts` (full — JSDoc vs behavior)
- `src/lib/assignments/recruiting-invitations.ts` (full — comments vs code)
- `src/lib/realtime/realtime-coordination.ts` (full — comments vs code)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full — comments vs code)
- `src/lib/security/api-rate-limit.ts` (full — JSDoc vs behavior)
- `src/lib/auth/config.ts` (full — comments vs code)
- `AGENTS.md` (reference)
- `CLAUDE.md` (reference)

## Findings

No new documentation-code mismatch findings this cycle.

### Carry-Over Confirmations

- **DOC-1:** SSE route ADR (LOW/LOW) — deferred. Useful but not urgent.
- **DOC-2:** Docker client dual-path docs (LOW/LOW) — deferred. Useful but not urgent.

### Documentation-Code Consistency Check

1. **sanitizeHtml() JSDoc**: The `ALLOWED_TAGS` and `ALLOWED_ATTR` arrays match the documented behavior. The comment about "Legacy HTML descriptions" correctly describes the narrow formatting-focused subset.

2. **sanitizeMarkdown() JSDoc**: The comment about "does NOT escape `<`/`>` because descriptions are rendered by react-markdown with `skipHtml`" correctly describes the behavior. The null byte stripping is documented.

3. **api-rate-limit.ts JSDoc**: The `sidecarConsume` function's return type documentation (true/false/null) matches the actual implementation. The `atomicConsumeRateLimit` JSDoc correctly states it returns `{ limited, nowMs }`.

4. **recruiting-invitations.ts comments**: The TOCTOU safety comment at line 429-431 correctly describes why the expiry check is not done on the JS side. The "rolls back entire tx" comment at line 492 matches the transaction behavior.

5. **proxy.ts comments**: The "IMPORTANT SAFETY CONSTRAINT" comment at lines 145-155 correctly documents why `/api/auth/` is NOT in the proxy matcher.

6. **events/route.ts comments**: The "Not migrated to createApiHandler" comment at line 1 correctly documents the architectural decision.

7. **AGENTS.md**: The supported languages table matches `src/lib/judge/languages.ts` as the authoritative source. The key directories table is accurate.
