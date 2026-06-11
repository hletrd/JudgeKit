# Security Review — Cycle 2 (Fresh)

**Base commit:** 31049465
**Reviewer:** security-reviewer
**Focus:** OWASP Top 10, auth/authz, injection, secrets, unsafe patterns

---

## C2-SEC-1 — Instructor can view submission metadata but not content (authorization gap)
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/(public)/submissions/[id]/page.tsx:125-127,191,201`

An instructor with `canViewAsInstructor = true` can access the page (passes the `notFound()` guard) but receives empty results and no source code. While not a direct security vulnerability, the authorization model is inconsistent: the instructor is authorized to view the submission but the data layer denies them. This could lead to information disclosure bugs if the logic drifts further.

**Fix:** Align authorization and data access: `const canViewDetails = isOwner || canViewAsInstructor;`.

---

## C2-SEC-2 — Advisory lock hash collisions allow cross-user blocking (DoS vector)
**Severity:** LOW | **Confidence:** Medium
**File:** `src/app/api/v1/submissions/route.ts:272`

```typescript
await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${user.id})::bigint)`);
```

`hashtext()` returns int32. With sufficient users, collisions allow User A to block User B's submission. While transient (transaction-scoped), this is a minor DoS vector.

**Fix:** Use `hashtextextended(${user.id}, 0)::bigint` for 64-bit hash space.

---

## C2-SEC-3 — NaN injection via `z.coerce.number()` in judge claim
**Severity:** LOW | **Confidence:** Medium
**File:** `src/app/api/v1/judge/claim/route.ts:34-37`

`z.coerce.number().nullable()` accepts `NaN`. If a malformed DB row or type coercion produces a non-numeric string, the worker receives `NaN` for time limits or scores. The worker's behavior with `NaN` timeouts is undefined and could lead to resource exhaustion (infinite wait) or immediate termination.

**Fix:** Reject `NaN` in the schema with `.refine((n) => n === null || !Number.isNaN(n))`.

---

## C2-SEC-4 — CSRF on submission creation not explicitly verified
**Severity:** LOW | **Confidence:** Low
**File:** `src/app/api/v1/submissions/route.ts:183`

The POST handler uses `createApiHandler` which likely includes CSRF protection, but this is not visible in the file. The AGENTS.md notes that mutation routes require `X-Requested-With: XMLHttpRequest`.

**Verification needed:** Confirm `createApiHandler` enforces CSRF headers for the submissions:create rate limit scope.

---

## C2-SEC-5 — Rate-limit scope fallback uses truncated SHA-256 hash
**Severity:** LOW | **Confidence:** Low
**File:** `src/app/api/v1/judge/claim/route.ts:91-95`

```typescript
const authHash = authHeader.length > 7
  ? crypto.createHash("sha256").update(authHeader).digest("hex"slice(0, 16)
  : "none";
```

Truncating a SHA-256 hash to 16 hex chars (64 bits) for rate-limit bucketing. Collision probability is low but non-zero. Two different auth headers could share a bucket.

**Impact:** Minimal — only affects rate-limiting fairness, not security directly.

---

## C2-SEC-6 — `rawQueryOne` parameter validation is strict but correct
**Severity:** Info | **Confidence:** High
**File:** `src/lib/db/queries.ts:95-101`

The `namedToPositional` function validates parameter names with `/^[a-zA-Z_]\w*$/` and checks `Object.prototype.hasOwnProperty.call(params, name)`. This prevents prototype pollution attacks on the params object.

---

## Commonly Missed Sweep

- No SQL injection in raw queries: all parameters use named-to-positional binding.
- No XSS in timeline components: all user data is rendered as text, not HTML.
- The `deserializeStoredJudgeCommand` regex `^sh\s+-c\s+` could be bypassed with tabs (`sh\t-c`), but the input comes from admin-controlled DB, not user input.
