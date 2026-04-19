# Cycle 16 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-16-code-reviewer.md` (multi-angle review covering code quality, security, performance, architecture, correctness, UI/UX, testing)
- Base commit: e3ee69e6

## Deduped findings

### AGG-1 — [MEDIUM] `PublicHeader.handleSignOut` has no error handling — errors leave sign-out button permanently disabled

- **Severity:** MEDIUM (UX — button stuck disabled)
- **Confidence:** HIGH
- **Cross-agent agreement:** F1
- **Files:** `src/components/layout/public-header.tsx:183-186`
- **Evidence:** The `handleSignOut` callback sets `isSigningOut(true)` then awaits `signOut()`. If `signOut()` throws, `isSigningOut` stays `true` permanently. The same issue was fixed in `AppSidebar` (commit 50f84172) but `PublicHeader` was not updated.
- **Failure scenario:** User clicks sign-out on a public page. NextAuth endpoint is temporarily unreachable. Promise rejects, `isSigningOut` stays `true`, sign-out button remains permanently disabled. User cannot sign out without refreshing.
- **Suggested fix:** Add try/catch around `signOut()` call and reset `isSigningOut` on failure, matching the AppSidebar pattern. Consider showing an error toast.

### AGG-2 — [MEDIUM] `AppSidebar` "ADMINISTRATION" label uses unconditional `tracking-wider` — violates CLAUDE.md Korean letter-spacing rule

- **Severity:** MEDIUM (CLAUDE.md compliance)
- **Confidence:** HIGH
- **Cross-agent agreement:** F2
- **Files:** `src/components/layout/app-sidebar.tsx:290`
- **Evidence:** CLAUDE.md states Korean text must use default letter spacing. The `tracking-wider` class on the "ADMINISTRATION" sidebar group label is applied unconditionally. A comment says "for English uppercase text only" but the class is not conditional on locale. The PublicHeader mobile menu label was fixed in commit 1416cbce to be locale-conditional. AppSidebar was not.
- **Failure scenario:** When the UI is displayed in Korean, the "ADMINISTRATION" group label renders with `tracking-wider`, violating the CLAUDE.md Korean letter-spacing rule.
- **Suggested fix:** Apply `tracking-wider` conditionally based on locale, same pattern as the PublicHeader fix. Import `useLocale` from `next-intl` and use `locale !== "ko" ? " tracking-wider" : ""`.

### AGG-3 — [LOW] `localStorage.clear()` / `sessionStorage.clear()` on sign-out destroys all origin storage

- **Severity:** LOW (compatibility / data loss)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** F3 (carried from D8 cycle 12)
- **Files:** `src/components/layout/app-sidebar.tsx:233-234`
- **Evidence:** On sign-out, `localStorage.clear()` and `sessionStorage.clear()` delete ALL storage for the origin, not just judgekit-specific keys. If other apps or browser extensions use the same origin's storage, their data is destroyed.
- **Failure scenario:** A browser extension stores configuration in localStorage for the judgekit origin. Sign-out destroys the extension's configuration.
- **Suggested fix:** Replace with targeted key removal using a namespace prefix.

### AGG-4 — [LOW] `cleanupOrphanedContainers` makes redundant `docker inspect` calls — `CreatedAt` already in `docker ps` output

- **Severity:** LOW (performance)
- **Confidence:** HIGH
- **Cross-agent agreement:** F4 (carried from AGG-8 cycle 15)
- **Files:** `src/lib/compiler/execute.ts:746-758`
- **Evidence:** The `docker ps` format string includes `{{.CreatedAt}}` as the third column but the code destructures only `[container, status]`, discarding `CreatedAt`. For running containers, a redundant `docker inspect` is called to get the same data.
- **Failure scenario:** On a worker with 20 running compiler containers, 20 redundant `docker inspect` calls are made.
- **Suggested fix:** Parse `CreatedAt` from the third column of `docker ps` output.

### AGG-5 — [LOW] `ri_token_idx` unique index on deprecated `token` column still exists

- **Severity:** LOW (wasted index / confusion)
- **Confidence:** HIGH
- **Cross-agent agreement:** F5 (carried from AGG-10 cycle 15)
- **Files:** `src/lib/db/schema.pg.ts:961`
- **Evidence:** The `recruitingInvitations.token` column is deprecated (always null). Its unique index `ri_token_idx` wastes space and confuses developers.
- **Failure scenario:** Developer sees `ri_token_idx` and assumes `token` column is still actively used for lookups.
- **Suggested fix:** Add migration to drop the `token` column and its unique index.

### AGG-6 — [LOW] `PublicHeader.handleSignOut` does not clear localStorage/sessionStorage like AppSidebar does

- **Severity:** LOW (consistency)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** F6
- **Files:** `src/components/layout/public-header.tsx:183-186`
- **Evidence:** AppSidebar clears storage on sign-out, PublicHeader does not. Inconsistent behavior depending on which sign-out button is clicked.
- **Failure scenario:** User signs out from public page dropdown. Stale client-side data (draft code, theme preference) persists in storage.
- **Suggested fix:** Extract sign-out logic into a shared utility used by both components.

### AGG-7 — [LOW] `redeemRecruitingToken` uses `new Date()` for deadline comparison instead of `NOW()` — app/DB clock skew risk

- **Severity:** LOW (correctness — clock skew)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** F7 (carried from A19/D17)
- **Files:** `src/lib/assignments/recruiting-invitations.ts:405,440`
- **Evidence**: The JS deadline checks compare `new Date()` against `assignment.deadline`, but the atomic claim step uses `NOW()` in SQL. If clocks are not synchronized, the JS check can produce misleading error messages.
- **Failure scenario:** App server clock is 5 seconds ahead. Candidate redeems token right at deadline. JS check returns "contestClosed" but SQL check would succeed on retry.
- **Suggested fix:** Remove the redundant JS deadline checks, relying on the SQL atomic check.

### AGG-8 — [LOW] SSE `onPollResult` callback has duplicate terminal-state-fetch code paths

- **Severity:** LOW (maintainability)
- **Confidence:** HIGH
- **Cross-agent agreement:** F8
- **Files:** `src/app/api/v1/submissions/[id]/events/route.ts:316-428`
- **Evidence:** The callback has two nearly identical code paths for handling terminal states (one in the re-auth IIFE, one in the fast path). Any bug fix must be applied in both places.
- **Failure scenario:** Developer fixes a bug in the fast path and forgets the re-auth path. Bug persists in the re-auth scenario.
- **Suggested fix:** Extract terminal-state handling into a shared helper function.

## Previously Deferred Items (Carried Forward)

- D8: `localStorage.clear()` clears all origin storage (LOW) — see AGG-3 above
- D16: `sanitizeSubmissionForViewer` unexpected DB query (LOW)
- D18: Deprecated `recruitingInvitations.token` column (LOW) — see AGG-5 above
- AGG-4(c15): No test coverage for API rate-limiting functions (MEDIUM)

## Agent Failures

None — single-agent multi-angle review completed successfully.
