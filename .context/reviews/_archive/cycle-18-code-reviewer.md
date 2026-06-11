# Cycle 18 Code Reviewer Findings (Updated)

**Date:** 2026-05-09
**Reviewer:** Code quality, logic, SOLID, maintainability
**Base commit:** 75d82a17
**Previous review:** cycle-18-code-reviewer.md (2026-04-19, commit 7c1b65cc)

---

## Previous Finding Status

| ID | Previous Finding | Status |
|----|-----------------|--------|
| F1 | `getRecruitingAccessContext` N+1 queries | **PARTIALLY ADDRESSED** — `withRecruitingContextCache` added in `api/handler.ts:109` but not all callers use it |
| F2 | `readStreamTextWithLimit` accumulates full body in memory | **STILL OPEN** — unchanged |
| F3 | Admin import route duplicated logic | **STILL OPEN** — unchanged |
| F4 | Contest analytics raw scores without late penalties | **STILL OPEN** — unchanged |

---

## New Findings

### N1: `_apiKeyAuth` Symbol Check is Fragile

- **File**: `src/lib/api/handler.ts:141`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The API key auth detection uses `"_apiKeyAuth" in user` — a string property check on a plain object. This is fragile because any object with that property would pass. A branded type or `Symbol.for('apiKeyAuth')` would be more robust.
- **Fix**: Use a Symbol or branded type for API-key-authenticated user detection.

### N2: `as unknown as NextResponse` Type Cast in Chat Route

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:126, 419, 523`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Multiple `as unknown as NextResponse` casts mask type mismatches between the native `Response` returned by streaming and the expected `NextResponse`. This suggests the handler signature is incorrectly typed.
- **Fix**: Change the handler return type to `Promise<Response>` or refactor to return `NextResponse` consistently.

### N3: `execTransaction` Non-Atomic During Build Phase

- **File**: `src/lib/db/index.ts:67-75`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: During `NEXT_PHASE === "phase-production-build"`, `execTransaction` resolves the callback against a dummy drizzle instance WITHOUT a transaction. Code expecting atomicity (advisory locks, SELECT FOR UPDATE) silently loses guarantees during build.
- **Fix**: Add a runtime warning when `execTransaction` is called during build, or throw for operations requiring transactions.

### N4: Compiler Source Code Written World-Readable

- **File**: `src/lib/compiler/execute.ts:697-701`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: Source code files in the compiler workspace are written with `chmod 0o644` (world-readable). While the workspace is ephemeral and inside a container, defense-in-depth suggests restricting to owner-only (`0o600`).
- **Fix**: Use `0o600` for source files in the compiler workspace.

### N5: `buildIoiLatePenaltyCaseExpr` Raw SQL Injection Risk (Theoretical)

- **File**: `src/lib/assignments/submissions.ts:606-640`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `getAssignmentStatusRows` function embeds `buildIoiLatePenaltyCaseExpr(...)` directly into a raw SQL template string. While the function itself is controlled code, any future bug in that function could inject malformed SQL into an aggregation query that processes all submissions for an assignment.
- **Fix**: Add SQL validation or use parameterized expressions. Document that `buildIoiLatePenaltyCaseExpr` must never contain user input.

---

## Verified Safe (Re-confirmed)

- **VS1**: `recruiting-token.ts` correctly uses `AUTH_USER_COLUMNS`.
- **VS2**: `sign-out.ts` clears all localStorage prefixes.
- **VS3**: `recruiting/validate/route.ts` uses SQL NOW() for deadline checks.
- **VS4**: `redeemRecruitingToken` defaults to "alreadyRedeemed" on atomic claim failure.
- **VS5**: `validateShellCommand` correctly omits `\bexec\b` from denylist.
- **VS6**: SSE re-auth IIFE has proper `.catch()` for unhandled rejections.
- **VS7**: `userConnectionCounts` Map added for O(1) SSE connection counting (fixed since April).
