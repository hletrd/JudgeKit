# Tracer Review — RPF Cycle 3 (2026-05-04)

**Reviewer:** tracer
**HEAD reviewed:** `4cd03c2b`
**Scope:** Causal trace of suspicious flows in changes since `988435b5`.

---

## Prior cycle status

- **C1-TR-1 (password validation policy mismatch):** RESOLVED — `password.ts` now only checks minimum length. The `PasswordValidationError` type only includes `"passwordTooShort"`.

---

## Causal trace of recent changes

### Recruiting validate CSRF addition trace

Tracing the CSRF validation addition:
1. `src/app/api/v1/recruiting/validate/route.ts:20-21` — calls `validateCsrf(req)`
2. `src/lib/security/csrf.ts:30-72` — validates `X-Requested-With`, `Sec-Fetch-Site`, `Origin`
3. The endpoint is public (no auth required) but CSRF protection prevents cross-origin form submissions

**Trace result:** Clean. The CSRF check is consistent with all other POST endpoints. The `X-Requested-With: XMLHttpRequest` header is required, which HTML forms cannot set.

### Moderation filter SQL trace

Tracing the moderation filter changes:
1. `src/lib/discussions/data.ts:260-299` — `listModerationDiscussionThreads` builds WHERE conditions
2. Scope filter: `eq(discussionThreads.scopeType, scope)` when scope !== "all"
3. State "open": `isNull(discussionThreads.lockedAt)` — correctly excludes locked threads
4. State "locked": `isNotNull(discussionThreads.lockedAt)`
5. State "pinned": `isNotNull(discussionThreads.pinnedAt)`

**Trace result:** Clean. The "open" state correctly means "not locked" regardless of pin status. A thread that is both pinned and locked is correctly classified as "locked", not "open".

---

## Findings

### C3-TR-1: [INFO] No suspicious flows found

All recent changes have clean causal traces with no unexpected side effects or competing hypotheses.
