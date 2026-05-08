# Performance Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`

---

## C3-PERF-1 (MEDIUM, HIGH) — JWT callback DB query on every authenticated request (carry-forward C1-F5 / C2-F5)

**File:** `src/lib/auth/config.ts:399-412`

The `jwt()` callback queries `db.query.users.findFirst()` on every API request. Under load, this is the primary bottleneck. 3 lanes confirmed this in cycle 2. No change since.

**Fix:** Add `lastCheckedAt` to the JWT. Skip DB query if within TTL (e.g., 60s). `tokenInvalidatedAt` still provides revocation guarantees. (Deferred — auth-perf cycle.)

---

## C3-PERF-2 (LOW, MEDIUM) — `incrementFailedRedeemAttempt` performs two separate DB queries (read + write)

**File:** `src/lib/assignments/recruiting-invitations.ts:34-55`

The function first SELECTs the invitation to read metadata, then UPDATEs it. This should be a single atomic UPDATE with `jsonb_set` as noted in C3-SEC-1, which would also be faster (1 round-trip instead of 2).

**Fix:** Replace with single atomic SQL UPDATE using `jsonb_set`.

---

## C3-PERF-3 (LOW, MEDIUM) — `getRecruitingInvitations` computes `isExpired` with SQL CASE expression on every row

**File:** `src/lib/assignments/recruiting-invitations.ts:63`

The `isExpiredExpr` is a `CASE WHEN ... < NOW() THEN true ELSE false END` computed per row. For large invitation lists, this adds per-row computation. Low priority since invitations are typically <500 rows per assignment.

**Fix:** Consider adding a partial index on `(status, expiresAt)` where status='pending' to accelerate the common "show pending non-expired" query.

---

## C3-PERF-4 (INFO, LOW) — 5+ polling components across dashboard (carry-forward C2-AGG-5)

No change since cycle 2. Polling components: submission-list-auto-refresh, dashboard-judge-system-tabs, contest-quick-stats, countdown-timer, candidate-dashboard. Deferred per telemetry signal.
