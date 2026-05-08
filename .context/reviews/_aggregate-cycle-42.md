# Aggregate Review — Cycle 42 (Fresh Pass)

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer (fresh pass)
**Total findings:** 3 new (1 MEDIUM, 2 LOW) + 0 false positives + 19 carried deferred re-validated + prior cycle-42 findings confirmed fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `normalizeSource()` unclosed string literals cause incorrect similarity detection

**Sources:** NEW-1 | **Confidence:** MEDIUM

`src/lib/assignments/code-similarity.ts:51-65,68-83` — When `normalizeSource()` encounters an unclosed string literal (e.g., a file starting with `"` with no closing quote), the inner while loop scans the entire remaining file as part of the string. The function outputs the opening quote but never closes it, causing the rest of the file to be consumed as string content. This means identifiers after the unclosed string are never processed by `normalizeIdentifiersForSimilarity()`, causing the similarity score to drop dramatically and allowing plagiarism to go undetected.

**Concrete failure scenario:** Two students submit nearly identical solutions, but one has an unclosed string literal at the top. The normalizer scans past all the actual code inside the unclosed string, so the normalized output is just `"` — identifiers from the rest of the file are never processed. The similarity score drops, causing the plagiarism to go undetected.

**Fix:**
1. When the inner while loop exits because `index >= source.length` (unclosed string), do NOT output the quote — treat it as if the string never started, or add a closing quote to maintain balanced parsing
2. Consider adding a maximum string literal length cap (e.g., 10,000 chars)

---

### AGG-2: [LOW] `normalizeSource()` does not handle template literals (backticks) for JS/TS submissions

**Sources:** NEW-2 | **Confidence:** MEDIUM

`src/lib/assignments/code-similarity.ts:14-101` — The function strips `//` and `/* */` comments, single-quoted strings, and double-quoted strings, but does not handle template literals (backtick-delimited strings). Template literals are common in modern JavaScript/TypeScript submissions. Content inside template literals is treated as code rather than strings, which can cause false positives (text differences in template literals inflate the perceived code difference).

**Concrete failure scenario:** Two students submit JavaScript solutions differing only in template literal string content (e.g., different error messages). The normalizer includes template literal content as code, so normalized versions differ more than they should. The similarity score is artificially lowered, reducing the chance of detecting actual plagiarism.

**Fix:** Add handling for backtick-delimited strings in `normalizeSource()`. Treat the entire template literal as a single string (replacing with `` ` ` ``), consistent with how double/single quoted strings are handled.

---

### AGG-3: [LOW] `files/[id]/route.ts` DELETE handler rate-limits before auth check — wastes capacity on unauthenticated requests

**Sources:** NEW-3 | **Confidence:** LOW

`src/app/api/v1/files/[id]/route.ts:132-201` — The DELETE handler checks rate limits before auth. Unauthenticated requests consume rate-limit capacity before being rejected. While `createApiHandler` also checks rate limits before auth, the file route uses manual auth checks and could be optimized to reject unauthenticated requests first.

**Concrete failure scenario:** An attacker sends many unauthenticated DELETE requests. Each hits the rate limiter before being rejected as unauthorized, wasting capacity and potentially rate-limiting legitimate users.

**Fix:** Move auth check before rate limit in DELETE, or migrate DELETE to `createApiHandler`.

---

## Previously Fixed Items (confirmed in current code)

All prior cycle fixes verified:
- AGG-1 (cycle 41): `auto-review.ts` source code size cap — `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192` at line 18
- AGG-1 (cycle 40): `getRetentionCutoff` `Date.now()` default removed — `now` is now a required parameter
- AGG-1 (cycle 39): Docker build stderr sanitized — `error: "Docker build failed"` at line 181
- AGG-2 (cycle 39): `participant-status.ts` `Date.now()` default removed — `now` is now a required parameter
- AGG-3 (cycle 39): `JUDGE_WORKER_URL` guard added to `callWorkerJson` and `callWorkerNoContent`

**Prior cycle 42 reviews (all findings fixed since their base commit 8912b987):**
- `problemPoints`/`problemIds` length mismatch — `.refine()` at line 21-24 of quick-create/route.ts
- Access-code routes capability auth — `auth: { capabilities: ["contests.manage_access_codes"] }` on all three handlers
- `invitation.userId!` non-null assertion — replaced with `const userId = invitation.userId` capture pattern

---

## Carried Deferred Items (unchanged from cycle 41)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — Zod validation not yet built
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler`
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries — contests segment now fixed
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses (addressed by cycle 39 AGG-1)
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision — partially fixed in cycle 38)
- DEFER-46: `error.message` as control-flow discriminator across 15+ API catch blocks
- DEFER-47: Import route JSON path uses unsafe `as JudgeKitExport` cast
- DEFER-48: CountdownTimer initial render uses uncorrected client time
- DEFER-49: SSE connection tracking uses O(n) scan for oldest-entry eviction
- DEFER-50: [LOW] `in-memory-rate-limit.ts` `maybeEvict` triggers on every rate-limit call
- DEFER-51: [LOW] `contest-scoring.ts` ranking cache mixes `Date.now()` staleness check with `getDbNowMs()` writes
- DEFER-52: [LOW] `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing

Reason for deferral unchanged. See cycle 40 plan for details.

---

## No Agent Failures

The comprehensive review completed successfully.
