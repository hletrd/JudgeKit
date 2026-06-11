# Cycle 19 Test Engineer Findings

**Date:** 2026-04-19
**Reviewer:** Test coverage gaps, flaky tests, TDD opportunities
**Base commit:** 301afe7f

---

## Findings

### F1: No tests for `withUpdatedAt()` helper — core DB utility used across 15+ call sites

- **File**: `src/lib/db/helpers.ts:11-15`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The `withUpdatedAt()` helper is used across the entire codebase (~15 call sites) to inject `updatedAt: new Date()` into update operations. There are no unit tests for this function. While it's trivial, a regression (e.g., accidentally overwriting a field named `updatedAt` that already exists in the input) would affect all update paths silently.
- **Concrete failure scenario**: A developer modifies `withUpdatedAt()` to spread `data` after `updatedAt` instead of before (i.e., `{ updatedAt: new Date(), ...data }`). If `data` contains an `updatedAt` field, it silently overwrites the injected timestamp. No test catches this.
- **Suggested fix**: Add unit tests for `withUpdatedAt()` covering: (1) basic case where `updatedAt` is added, (2) case where input already has `updatedAt` (should be overwritten), (3) case with empty input object.

### F2: No integration tests for admin data-management routes' `needsRehash` handling

- **File**: `src/app/api/v1/admin/backup/route.ts:71-80`, `src/app/api/v1/admin/migrate/export/route.ts:63-71`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `needsRehash` handling in backup and export routes was added in cycle 18b but has no integration tests. The behavior (bcrypt-to-argon2id migration on admin password re-confirmation) is security-critical and should be tested end-to-end.
- **Concrete failure scenario**: A regression in the `needsRehash` handling goes undetected because there are no tests. Admin bcrypt hashes are never migrated, and the security team assumes the migration is working.
- **Suggested fix**: Add integration tests that: (1) Create a user with a bcrypt hash, (2) Call the backup endpoint with the user's password, (3) Verify the user's hash is now argon2id.

### F3: No tests for `readStreamBytesWithLimit` buffer-based accumulation (OOM fix)

- **File**: `src/lib/db/import-transfer.ts:14-40`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `readStreamBytesWithLimit` function was rewritten in cycle 18b to use buffer-based accumulation instead of string concatenation (fixing an OOM risk). There are no unit tests for this function. Edge cases like: empty stream, exact byte-limit match, multi-byte character boundaries, and chunked reads should be tested.
- **Concrete failure scenario**: A stream with multi-byte UTF-8 characters that splits across chunk boundaries is read incorrectly. The resulting buffer has corrupted bytes at chunk boundaries. No test catches this because the function was refactored without tests.
- **Suggested fix**: Add unit tests for `readStreamBytesWithLimit` and `readJsonBodyWithLimit` covering: (1) normal read, (2) byte-limit exceeded, (3) empty stream, (4) multi-byte character at chunk boundary.

---

## Verified Safe

### VS1: Existing unit test coverage for recruiting token is good
- **File**: `tests/unit/auth/recruiting-token.test.ts`
- The recruiting token module has comprehensive unit tests covering the SQL `NOW()` migration and atomic claim logic.

### VS2: Auth tests cover the main login flow
- The main authentication flow with `needsRehash` handling is tested through the existing auth integration tests.
