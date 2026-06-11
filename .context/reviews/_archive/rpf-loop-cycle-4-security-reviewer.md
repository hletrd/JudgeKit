# Security Reviewer — RPF Loop Cycle 4 (2026-05-03)

**Scope:** Cycle-3 close-out commits between `dafc0b24` and `7a195b11`.

## OWASP Top 10 lens applied to cycle-4 surface

### A01 Broken Access Control
- `recruiting-results.ts` is a pure helper with no auth surface.
- `recruit/[token]/results/page.tsx` reuses the existing `validateRecruitToken`
  flow upstream of the helper. No new access control surface introduced.

### A02 Cryptographic Failures
- `pre-restore-snapshot.ts` retains its 0o600 file mode and 0o700 dir mode.
  The CYC3-AGG-1 stat-failure log split does not change persistence.
- The CYC3-AGG-3 unit test asserts `mode === 0o600`, pinning the contract.

### A03 Injection
- `validateSqlColumnName` JSDoc was reorganised in CYC3-AGG-4 — same regex,
  same blocklist. The "PRIMARY: callers MUST pass only hardcoded literals"
  contract is now front-and-centre and a future user-influenced caller
  cannot reasonably miss the warning.
- The non-exhaustive blocklist (`TRUNCATE`, `GRANT`, `REVOKE`, `MERGE`,
  `CALL`, `LOCK`) is now explicitly documented as defence-in-depth — the
  primary defence is the caller-contract. CYC3-AGG-7 was deferred via this
  documentation. Acceptable for the current callers (all hardcoded literals).

### A04 Insecure Design
- `recruiting-results.ts` extracts the math from a server component into a
  pure helper. This narrows the test target and reduces drift risk between
  the candidate-facing display and the SQL leaderboard. Positive.
- The `Number.isFinite` guard at `scoring.ts:32-34` prevents a NaN from
  appearing in candidate-facing renders. The test pins NaN, +Inf, -Inf
  all returning 0. Defence-in-depth against parsed-string callers.

### A05 Security Misconfiguration
- No deploy/CI changes this cycle. Ops surface unchanged.

### A06 Vulnerable Components
- No `package.json` changes. No new deps.

### A07 Identification & Auth Failures
- No auth-path edits.

### A08 Software & Data Integrity
- The pre-restore snapshot integrity contract is unchanged. Stream-to-disk +
  unlink-on-error + 0o600 mode + RETAIN_LAST_N=5 are all preserved and now
  pinned by tests.

### A09 Security Logging & Monitoring
- The CYC3-AGG-1 split fixes a real audit gap: previously,
  `sizeBytes: 0` could mean "stat failed" or "actually empty file" — an
  operator deleting an "empty" snapshot was a real risk path. The split
  closes that gap.
- The retention isolation test verifies the warn-log line is emitted on
  prune failure, which is the operator's primary signal that one table
  prune did not run.

### A10 SSRF
- No outbound-fetch surface introduced.

## NEW findings this cycle

### SR4-1: [LOW] Snapshot filename actor-id slice — note carry-forward already deferred

- **File:** `src/lib/db/pre-restore-snapshot.ts:76`
- **Description:** `actorId.slice(0, 8)` is embedded in the snapshot
  filename. The new test at `pre-restore-snapshot.test.ts:104` pins this
  contract (`abcdef0123456789` → `abcdef01` substring). On a future
  multi-tenant deploy host where directory listings might be observable to
  other tenants, the actor-id substring leaks the first 8 characters of an
  internal user identifier. **Already deferred under SEC2-2** (carry-forward
  in cycle-3 plan).
- **Confidence:** LOW
- **Fix:** Defer — exit criterion remains "production multi-tenant deploy
  host or operator report of leak". The new test pins the current contract,
  which is fine for single-tenant deploys.

### SR4-2: [LOW] `data-retention-maintenance.test.ts` mock setup leaks `Date.now()` across realtime+faketimer boundary

- **File:** `tests/unit/data-retention-maintenance.test.ts:7`
- **Description:** `getDbNowMs: vi.fn().mockResolvedValue(Date.now())` is
  invoked at module evaluation time (real wall clock). After
  `vi.useFakeTimers()` in `beforeEach`, the mock still returns the original
  real-time value. This is fine for the current assertions (which only
  count `db.execute` invocations), but if a future test were to assert
  retention-cutoff math against the fake clock, the mock would silently
  return the wrong value.
- **Confidence:** LOW (no security or correctness bug today)
- **Failure scenario:** Future test adds an assertion like "the cutoff is
  90 days before the fake clock now" — it fails because the mock returns
  real-time wall clock instead of fake-time `Date.now()`.
- **Fix:** Wrap the mock in a function: `vi.fn().mockImplementation(async () => Date.now())`
  so it captures fake-time. Optional defensive polish; defer until a test
  needs it.

## Carry-forward security items (status unchanged at HEAD)

| ID | File+line | Status | Exit criterion |
|----|-----------|--------|----------------|
| SEC2-2 | `pre-restore-snapshot.ts:76` actor-id slice | DEFERRED | Multi-tenant deploy or leak report |
| SEC2-3 | `judge/auth.ts` workerId logged on auth fail | DEFERRED | Operator log spam OR auth-perf cycle |
| C7-AGG-7 | `encryption.ts:79-81` decrypt plaintext fallback | DEFERRED-with-doc-mitigation | Production tampering OR audit cycle |
| C5-SR-1 | `scripts/deploy-worker.sh:101-107` | DEFERRED | Untrusted-source APP_URL |

## Recommendations summary

| ID | Severity | Confidence | File | Action |
|----|----------|------------|------|--------|
| SR4-1 | LOW | LOW | `pre-restore-snapshot.ts` | Defer (carry-forward SEC2-2) |
| SR4-2 | LOW | LOW | `data-retention-maintenance.test.ts` | Defer (defensive polish) |

No HIGH/MEDIUM security findings. No regression. CYC3-AGG-4 JSDoc rewrite
materially improves the column-name validator's threat-model documentation.
