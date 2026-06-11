# RPF Cycle 42 (Fresh Pass) — Comprehensive Reviewer

**Date:** 2026-04-25
**Base commit:** d13970ad (current HEAD)
**Reviewer angle:** All angles — code quality, security, performance, architecture, correctness

## Note on Prior Cycle 42 Reviews

The existing `rpf-cycle-42-*.md` files (dated 2026-04-23, base commit 8912b987) identified three main findings:
1. `problemPoints`/`problemIds` length mismatch in quick-create
2. Access-code routes lacking capability-based auth at `createApiHandler` level
3. Redundant `invitation.userId!` non-null assertion

All three have been verified as ALREADY FIXED in the current codebase:
1. `.refine()` added at `quick-create/route.ts:21-24`
2. `auth: { capabilities: ["contests.manage_access_codes"] }` added to all three access-code handlers
3. `invitation.userId!` replaced with pre-closure capture pattern (`const userId = invitation.userId`)

This review is a fresh, thorough pass against the current HEAD.

---

## Findings

### NEW-1: `normalizeSource()` in code-similarity consumes unclosed string literals without bounds — potential CPU denial-of-service on crafted input [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/code-similarity.ts:51-65,68-83`

**Description:** The `normalizeSource()` function processes source code character by character to strip comments, strings, and whitespace. When it encounters an opening quote (`"` or `'`), it enters a while loop that scans forward until it finds the closing quote:

```typescript
if (current === "\"") {
  result += "\"";
  index += 1;
  while (index < source.length && source[index] !== "\"") {
    if (source[index] === "\\" && index + 1 < source.length) {
      index += 2;
      continue;
    }
    index += 1;
  }
  ...
}
```

If the input contains an unclosed string literal (e.g., a file starting with `"` and having no closing quote), the inner while loop will scan the entire remaining file character by character. This is already the expected behavior for a simple parser. However, the function is called on user-submitted source code in the similarity check pipeline (`runSimilarityCheckTS`), which processes up to 500 submissions. A submission with many unclosed strings could cause the normalizer to do significantly more work than expected.

More importantly, there's a subtle correctness issue: when the string is not closed, the function outputs the opening quote character but never outputs the closing quote. This means unclosed strings cause the text AFTER the string literal to be included in the normalized output (since the parser never exits the string mode). For similarity detection, this means an unclosed string in one submission could cause the rest of the file to be treated as a string (and thus skipped by `normalizeIdentifiersForSimilarity`), reducing detection accuracy.

**Concrete failure scenario:** Two students submit nearly identical solutions, but one has an unclosed string literal at the top (e.g., `"` followed by the rest of the code). The normalizer scans past all the actual code inside the unclosed string, so the normalized output is just `"` — the identifiers from the rest of the file are never processed. The similarity score drops dramatically, causing the plagiarism to go undetected.

**Fix:**
1. When the inner while loop exits because `index >= source.length` (unclosed string), do NOT output the quote at all — treat it as if the string never started. Alternatively, add the closing quote to the result to maintain balanced parsing.
2. Consider adding a maximum string literal length cap (e.g., 10,000 chars) as a safety measure.

**Confidence:** Medium (correctness impact is real; the CPU DoS angle is bounded by the 500-submission cap)

---

### NEW-2: `normalizeSource()` does not handle template literals (backticks) for JavaScript/TypeScript submissions [LOW/MEDIUM]

**File:** `src/lib/assignments/code-similarity.ts:14-101`

**Description:** The `normalizeSource()` function strips comments (`//` and `/* */`), single-quoted strings, and double-quoted strings. However, it does not handle template literals (backtick-delimited strings, e.g., `` `hello ${world}` ``). Template literals are common in modern JavaScript/TypeScript submissions. Without handling them, the content inside template literals is treated as code rather than strings, which can cause false positives in similarity detection.

**Concrete failure scenario:** Two students submit JavaScript solutions that differ only in the text of template literal strings (e.g., different error messages). The normalizer includes the template literal content as code, so the normalized versions differ more than they should. The similarity score is artificially lowered, reducing the chance of detecting actual plagiarism.

**Fix:** Add handling for backtick-delimited strings in `normalizeSource()`. Template literals with `${...}` interpolations are complex — a simple approach is to treat the entire template literal as a single string (replacing it with `` ` ` ``), which is consistent with how double/single quoted strings are handled.

**Confidence:** Medium (false negative risk for JS/TS similarity checks)

---

### NEW-3: `files/[id]/route.ts` GET and DELETE handlers bypass `createApiHandler` — same pattern as DEFER-29 [LOW/MEDIUM]

**File:** `src/app/api/v1/files/[id]/route.ts:61-203`

**Description:** The GET (file serving) and DELETE (file deletion) handlers for individual files use raw `getApiUser` + manual auth/CSRF/rate-limit checks instead of `createApiHandler`. This is the same pattern flagged as DEFER-29 for admin routes. While the file route has legitimate reasons to avoid `createApiHandler` (the GET handler returns a binary stream, not JSON), the DELETE handler could use `createApiHandler` and currently has a subtle inconsistency: the rate limit is checked BEFORE auth, which means unauthenticated requests still consume rate-limit capacity. In `createApiHandler`, the order is: rate limit first, then auth — but the rate limit is only applied when explicitly configured.

**Concrete failure scenario:** An attacker sends many unauthenticated DELETE requests to `/api/v1/files/[id]`. Each request hits the rate limiter before being rejected as unauthorized. This wastes rate-limit capacity, potentially causing legitimate users to be rate-limited.

**Fix:** Move the auth check before the rate limit check in the DELETE handler, or migrate DELETE to `createApiHandler`. The GET handler can stay as-is since it needs to return binary content.

**Confidence:** Low (rate limiting before auth is intentional in `createApiHandler` too, so this may be by design — but it's inconsistent with the principle of rejecting unauthenticated requests quickly)

---

## Previously Fixed Items (Verified in Current Code)

All prior cycle fixes verified:
- Cycle 41: `auto-review.ts` source code size cap (`AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192`) — present at line 18
- Cycle 40: `getRetentionCutoff` `Date.now()` default removed — `now` is required parameter
- Cycle 39: Docker build stderr sanitized — `error: "Docker build failed"` at line 181
- Cycle 39: `participant-status.ts` `Date.now()` default removed — `now` is required parameter
- Cycle 39: `JUDGE_WORKER_URL` guard added to `callWorkerJson` and `callWorkerNoContent`

**Prior cycle 42 reviews (all findings fixed):**
- `problemPoints`/`problemIds` length mismatch — `.refine()` at line 21-24 of quick-create/route.ts
- Access-code routes capability auth — `auth: { capabilities: ["contests.manage_access_codes"] }` on all three handlers
- `invitation.userId!` non-null assertion — replaced with `const userId = invitation.userId` capture pattern

---

## Sweep: Files Reviewed

- `src/lib/assignments/code-similarity.ts` (full file — normalizeSource, normalizeIdentifiersForSimilarity, runSimilarityCheckTS)
- `src/app/api/v1/contests/quick-create/route.ts` (verified .refine() fix)
- `src/app/api/v1/contests/[assignmentId]/access-code/route.ts` (verified capability fix)
- `src/lib/assignments/recruiting-invitations.ts` (verified userId capture fix)
- `src/app/api/v1/files/[id]/route.ts` (auth pattern review)
- `src/app/api/v1/files/route.ts` (upload flow review)
- `src/lib/judge/auto-review.ts` (source code cap review)
- `src/lib/docker/client.ts` (build error sanitization review)
- `src/lib/auth/config.ts` (auth flow review)
- `src/proxy.ts` (middleware review)
- `src/lib/api/handler.ts` (createApiHandler review)
- `src/app/api/v1/submissions/[id]/events/route.ts` (SSE flow review)
- `src/lib/realtime/realtime-coordination.ts` (coordination review)
- `src/lib/plugins/chat-widget/providers.ts` (provider review)
- `src/lib/plugins/chat-widget/chat-widget.tsx` (widget review)
- `src/app/api/v1/plugins/chat-widget/chat/route.ts` (tool loop review)
- `src/lib/security/sanitize-html.ts` (sanitization review)
- `src/components/problem-description.tsx` (XSS review)
- `src/lib/db/import.ts` (import flow review)
- `src/lib/db/import-transfer.ts` (import size limits review)
- `src/lib/audit/events.ts` (audit buffer review)
- `src/lib/security/in-memory-rate-limit.ts` (rate limit review)
- `src/hooks/use-submission-polling.ts` (polling review)
- `src/app/api/v1/recruiting/validate/route.ts` (token validation review)
- `src/app/api/v1/admin/migrate/import/route.ts` (import route review)
- `src/lib/compiler/execute.ts` (Docker execution review)
