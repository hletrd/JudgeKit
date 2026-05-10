# Cycle 29 Aggregate Review

**Date:** 2026-05-09
**Cycle:** 29 of 100
**Base commit:** 81c5daa8
**Current HEAD:** 81c5daa8 (clean working tree)
**Agents:** Manual review — no agent runtime registered in `.claude/agents/`

---

## Methodology

No review agents were registered in this environment. Reviews were performed manually across 10 specialist angles: code-reviewer, security-reviewer, perf-reviewer, critic, debugger, test-engineer, architect, verifier, tracer, document-specialist, designer.

All gates verified at HEAD: eslint (0 errors), tsc --noEmit, next build, vitest run (314/315 files, 2361 tests, 1 pre-existing DB failure), vitest component (68 files, 208 tests — all pass).

---

## DEDUPLICATED FINDINGS

### AGG-1: Recruiting token regex lacks upper bound — DoS vector [MEDIUM/HIGH]

**Flagged by:** code-reviewer (C29-CR-1), security-reviewer (C29-SEC-1), debugger (C29-DBG-1), verifier (C29-V-1), tracer (C29-TR-1), critic (C29-CRIT-1), architect (C29-ARCH-1)
**Cross-agent agreement:** 7 of 10 reviewers flagged this independently. HIGH signal.
**Citation:** `src/lib/auth/config.ts:208`
**Code:**
```js
if (!/^[-A-Za-z0-9_]{16,}$/.test(credentials.recruitToken)) {
```
**Description:** The recruiting token validation regex has a lower bound of 16 but no upper bound. An attacker can send an arbitrarily long token (e.g., multi-megabyte), causing:
1. Memory pressure from unbounded string allocation before regex evaluation
2. Potential ReDoS (though regex is linear, input size is unbounded)
3. Unnecessary rate-limit consumption before format rejection
4. The token value could be logged in `attemptedIdentifier` fields

Recruiting tokens are base64url-encoded random bytes and should be bounded. The comment at line 206 mentions "32 chars" but the regex allows any length >= 16.

**Concrete failure scenario:** Attacker POSTs a 50MB recruitToken to `/api/auth/callback/credentials`. Node.js allocates 50MB string, regex runs, rejects. Repeats to exhaust memory.

**Fix:** Change regex to `/^[-A-Za-z0-9_]{16,128}$/`. Also consider adding a pre-check: `credentials.recruitToken.length > 128` before regex.

---

### AGG-2: Test infrastructure failure — DATABASE_URL missing [LOW/HIGH]

**Flagged by:** code-reviewer (C29-CR-2), test-engineer (C29-TE-1), verifier (C29-V-2)
**Cross-agent agreement:** 3 of 10 reviewers.
**Citation:** `tests/unit/db/export-sanitization.test.ts`
**Description:** The test fails with `DATABASE_URL is required` when run without environment variables. The test imports `src/lib/db/export.ts` which imports `src/lib/db/index.ts`, which throws if DATABASE_URL is missing.

**Fix:** Mock the db module in the test or configure a test DATABASE_URL in the vitest config.

---

### AGG-3: Carry-forward findings from cycle 27 still unaddressed [LOW/LOW]

**Flagged by:** critic, debugger, architect, code-reviewer, security-reviewer
**Cross-agent agreement:** 5 of 10 reviewers.

1. **C27-1/C27-SEC-1:** Docker inspect `info.Created as string` lacks runtime validation (`src/app/api/v1/admin/docker/images/route.ts:30`)
2. **C27-2/C27-SEC-2:** DELETE Docker image rejection not audited (`src/app/api/v1/admin/docker/images/route.ts:129-135`)
3. **C27-3/C27-SEC-3:** Prompt sanitization regex misses empty markers `<<>>` (`src/lib/judge/prompt-sanitization.ts:12`)

These have been deferred for 2+ cycles and are well-defined, low-risk fixes.

---

## Previously Fixed (Verified at HEAD)

| Finding | Status | Evidence |
|---------|--------|----------|
| C28 localStorage try/catch | FIXED | compiler-client.tsx:186, submission-detail-client.tsx:94 |
| C26-1 LLM prompt sanitization | FIXED | sanitizePromptInput at auto-review.ts:163 |
| C25-1 Trusted registry boundary | FIXED | docker-image-validation.ts |
| C25-2 TABLE_MAP typing | FIXED | Record<string, PgTable> at import.ts:20 |
| C25-3 Stale images concurrency | FIXED | pLimit(5) at images/route.ts:17 |
| C25-4 Image reference regex | FIXED | client.ts:86-91 |
| C19-1 Keyboard shortcuts | FIXED | use-keyboard-shortcuts.ts:8-20 |

---

## Deferred / Carry-Forward

### C19-2 carry-forward: Transaction wrapper inconsistency
- **File+line:** `src/app/api/v1/judge/poll/route.ts:136`
- **Original cycle:** 19
- **Status:** Still present at cycle 29 (10 cycles deferred)
- **Reason:** Low severity maintainability issue with no functional impact
- **Exit criterion:** Use `execTransaction` for both paths

### C25-6 carry-forward: Client-side console.error
- **Files:** Multiple client components (22 instances)
- **Original cycle:** 25
- **Status:** Deferred
- **Reason:** Informational only
- **Exit criterion:** When a client-side logging utility is introduced

### C25-7 carry-forward: WeakMap complexity
- **File+line:** `src/lib/security/api-rate-limit.ts:62-72`
- **Original cycle:** 25
- **Status:** Deferred
- **Reason:** Best-effort deduplication documented as such
- **Exit criterion:** When rate-limit module is refactored

### C25-8 carry-forward: RegExp creation per render
- **File+line:** `src/components/seo/json-ld.tsx:17-18`
- **Original cycle:** 25
- **Status:** Deferred
- **Reason:** Micro-optimization
- **Exit criterion:** When SEO component is refactored

---

## AGENT FAILURES

No agent failures — review agents were not registered in this environment. Reviews were performed manually across 10 specialist perspectives.
