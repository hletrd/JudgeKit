# Aggregate Review — Cycle 41

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer
**Total findings:** 1 new (1 MEDIUM) + 0 false positives + 19 carried deferred re-validated + previous cycle fixes confirmed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `auto-review.ts` sends unlimited-size `sourceCode` to AI provider — potential context window overflow and billing waste

**Sources:** NEW-3 | **Confidence:** MEDIUM

`src/lib/judge/auto-review.ts:131` passes the full `sourceCode` (up to 256KB per `maxSourceCodeSizeBytes`) directly into the AI prompt without any size limit. The `problemDescription` is truncated to 2000 chars (line 129), but `sourceCode` is not truncated. Additionally, the `config` object is cast with `as` at line 57 without runtime validation.

**Concrete failure scenario:** A student submits a 256KB source file (valid per the system limit). The auto-review feature sends the entire file to the AI provider (OpenAI/Claude/Gemini) in the prompt. This (a) could exceed the model's context window, causing a wasted API call and billing charge with no review output, or (b) produces a truncated/unhelpful review because the model can only attend to part of the code. The AI provider charges per token, so a 256KB file could cost 5-10x more than a typical submission.

**Fix:**
1. Add a source code size cap for auto-review (e.g., `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192` — 8KB, roughly 200 lines)
2. Skip auto-review silently for files exceeding the cap (log at debug level)
3. Optionally validate the `config` shape with a runtime check instead of `as` cast

---

## Previously Fixed Items (confirmed in current code)

All cycle 40 fixes verified:
- AGG-1 (cycle 40): `getRetentionCutoff` `Date.now()` default removed — `now` is now a required parameter

All cycle 39 fixes verified:
- AGG-1 (cycle 39): Docker build stderr sanitized — `error: "Docker build failed"` at line 181
- AGG-2 (cycle 39): `participant-status.ts` `Date.now()` default removed — `now` is now a required parameter
- AGG-3 (cycle 39): `JUDGE_WORKER_URL` guard added to `callWorkerJson` and `callWorkerNoContent`

All cycle 38 fixes verified:
- AGG-3 (cycle 38): `db/import.ts` error messages sanitized before API response
- AGG-4 (cycle 38): Anti-cheat monitor text content capture removed

---

## Carried Deferred Items (unchanged from cycle 40)

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
