# Code Review — Cycle 2 (2026-05-03)

**Reviewer:** code-reviewer
**HEAD:** `689cf61d`

---

## C2-CR-1 (MEDIUM, HIGH confidence) — Recruiting invitation PII returned in plaintext in API responses

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts` (GET handler)
**Cross-ref:** C1-CR-3 (F3, deferred), schema.pg.ts `candidateName`/`candidateEmail` columns

The GET handler returns `candidateName` and `candidateEmail` directly from the DB. While F3 (encryption at rest) was deferred due to schema migration scope, the API response also leaks these fields to any instructor/admin with recruiting access. If a frontend compromise or XSS occurs, PII is immediately accessible.

**Fix:** Redact `candidateEmail` to show only the domain (e.g., `u***@example.com`) unless the caller has an explicit `recruiting.view_pii` capability. Keep `candidateName` as-is for usability but add a PII access audit event.

---

## C2-CR-2 (MEDIUM, HIGH confidence) — `getRecruitingInvitationByToken` uses hash lookup without timing-safe comparison

**File:** `src/lib/assignments/recruiting-invitations.ts:193`

```ts
.where(eq(recruitingInvitations.tokenHash, hashToken(token)))
```

The token hash is looked up via Drizzle's `eq()` which compiles to SQL `=`. PostgreSQL's `=` operator for text is not timing-safe. An attacker measuring response times could theoretically perform a timing side-channel attack to recover hash prefixes, then forge tokens. While the SHA-256 pre-image resistance makes this extremely hard to exploit in practice, the recruiting token is a single-factor auth mechanism — any weakness is amplified.

**Fix:** Use a constant-time comparison in application code: fetch candidates by prefix match, then use `crypto.timingSafeEqual()` to compare hashes. Alternatively, accept the risk given the 256-bit hash space and document the decision.

---

## C2-CR-3 (LOW, MEDIUM confidence) — Audit event buffer re-prepend on flush failure can grow unbounded

**File:** `src/lib/audit/events.ts:174`

```ts
if (_auditBuffer.length + batch.length < FLUSH_SIZE_THRESHOLD * 2) {
  _auditBuffer = [...batch, ..._auditBuffer];
}
```

When flush fails, the batch is re-prepended. But if the DB is down for an extended period, the guard at `FLUSH_SIZE_THRESHOLD * 2` (100) silently drops events. The `consecutiveAuditFailures >= MAX_SILENT_FAILURES` (3) check logs a CRITICAL error, but events are still accepted via `recordAuditEvent` and silently dropped when the buffer exceeds 100. This violates the audit integrity guarantee.

**Fix:** After `MAX_SILENT_FAILURES`, either stop accepting new events (return early from `recordAuditEvent`) or implement a disk-based overflow. At minimum, add a counter for dropped events and expose it in the health endpoint.

---

## C2-CR-4 (LOW, HIGH confidence) — `resetRecruitingInvitationAccountPassword` does not invalidate existing sessions

**File:** `src/lib/assignments/recruiting-invitations.ts:234-273`

The function sets `tokenInvalidatedAt` on the user row, which causes the `jwt()` callback to clear the token on next refresh. However, there is a window between the password reset and the next JWT refresh where an existing session remains valid. For a recruiting candidate who had their password compromised, this window could be exploited.

**Fix:** Add an explicit session revocation step (delete from `sessions` table where `userId` matches) within the transaction.

---

## C2-CR-5 (LOW, HIGH confidence) — Inconsistent `updatedAt` handling across DB mutations

**Files:** Multiple mutation handlers across API routes and server actions

The schema comments note `$defaultFn only fires on INSERT`, and `withUpdatedAt()` from helpers should be used for UPDATEs. However, several update paths set `updatedAt: await getDbNowUncached()` directly (e.g., `recruiting-invitations.ts:206`), while others use `withUpdatedAt()` helper (e.g., `src/lib/db/helpers.ts`), and some update paths forget to set `updatedAt` at all. This inconsistency means some rows have stale `updatedAt` values.

**Fix:** Create a wrapper `db.update(...).set(withUpdatedAt(data))` pattern and audit all update calls to use it consistently.

---

## C2-CR-6 (LOW, MEDIUM confidence) — File serve route bypasses `createApiHandler` wrapper

**File:** `src/app/api/v1/files/[id]/route.ts`

The GET and DELETE handlers are manually implemented rather than using `createApiHandler`. This means:
1. The GET handler doesn't get automatic `Cache-Control: no-store` (it sets its own `Cache-Control: private, no-store, max-age=0` — which is actually more permissive than the wrapper's `no-store`).
2. Error handling is manual with try/catch instead of the wrapper's automatic error handling.
3. Rate limiting is manually applied on DELETE but not on GET.

**Fix:** Refactor to use `createApiHandler` for consistency, or document why the manual approach is necessary (e.g., streaming response for large files).

---

## Final Sweep

Reviewed all 572 source files via pattern search. No additional high-severity findings beyond those listed above and the carry-forward items from cycle 1. The codebase demonstrates strong security posture: CSRF protection, timing-safe token comparisons (in judge auth), proper SQL injection prevention via Drizzle ORM, safe redirect validation, and magic-byte file verification.
