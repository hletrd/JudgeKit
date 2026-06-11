# Cycle 26 Performance Review

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## PERF-1: Recruit page makes duplicate DB query for invitation lookup [MEDIUM/MEDIUM]

**Files:** `src/app/(auth)/recruit/[token]/page.tsx:19,56`
**Description:** `generateMetadata()` and the default page component both independently call `getRecruitingInvitationByToken(token)`. In Next.js server rendering, these run in the same request but there is no deduplication for custom Drizzle queries. This results in 2 identical DB queries per recruit page load.
**Concrete failure scenario:** Under load (e.g. a mass recruiting email blast), this doubles the DB query volume for the `recruiting_invitations` table lookup, adding unnecessary latency and DB pressure.
**Fix:** Wrap the call in `React.cache()` or use a module-level memoization pattern to deduplicate within a single server render.

## PERF-2: Rate limiter sidecar fallback adds latency when sidecar is unreachable [LOW/LOW]

**Files:** `src/lib/security/api-rate-limit.ts:27-34`
**Description:** When the sidecar is unreachable, `sidecarConsume()` returns `null` after the HTTP request times out. The code then falls through to the authoritative DB check. The sidecar HTTP timeout is not explicitly configured, so it uses the default fetch timeout which could be several seconds. Under normal operation this is fine (sidecar is either reachable or not), but during partial network failures the latency could compound.
**Concrete failure scenario:** A transient network blip causes the sidecar to be slow but not down — each API request waits for the sidecar timeout before falling back to the DB, adding seconds of latency.
**Fix:** Set an explicit short timeout (e.g. 500ms) on the sidecar HTTP request so it fails fast when unreachable.

---

## Verified performant patterns

- Rate limiting sidecar pre-check saves DB round-trips under normal load.
- `WeakMap` for consumed request keys avoids memory leaks.
- Atomic `SELECT FOR UPDATE` in rate limits is appropriate for the transaction volume.
- Compiler execution uses workspace directories with proper cleanup.
