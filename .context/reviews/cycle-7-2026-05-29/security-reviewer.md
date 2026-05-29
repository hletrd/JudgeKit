# Cycle 7 — security-reviewer (OWASP, authz, secrets)

## N7-C7 security framing
N7-C7 is a **correctness/integrity** bug, not a vuln. AuthZ on the override path is sound: `authorizeAssignmentAccess` (`overrides/route.ts:32-65`) requires `canManageGroupResourcesAsync` on the owning group, validates the assignment belongs to the group, the problem belongs to the assignment, the target user is enrolled, and caps the override at the problem's max points. All mutations are audit-logged. No privilege escalation, no IDOR (group→assignment→problem→enrollment chain is fully checked). The fix (overlay overrides in ranking) introduces no new trust surface — overrides are already authorized + capped at write time; the ranking just reads them.

## Leaderboard endpoint authz (re-reviewed) — OK
`leaderboard/route.ts:30-54`: 404 for non-contest (`examMode==='none'`); recruiting candidates blocked from non-instructor view; students must be enrolled OR hold a non-expired contest access token; non-instructor responses strip `userId` (PII) and anonymize in exam mode. Sound.

## Judge pipeline trust boundary (re-assessed F3/F4/N3) — UNCHANGED
- Poll route: `claimToken` ownership + per-worker secret hash + IP allowlist gate result writes (`poll/route.ts:29-75`). Trust model = trusted first-party workers only. F3 (`score=passed/results.length`, `testCaseId` not scoped to claimed problem), F4 (≤3 worker SELECTs), N3 (`failedTestCaseIndex` = worker array index) all defend only against a COMPROMISED trusted worker; no untrusted/3rd-party workers exist. Preconditions unchanged → RE-DEFER (severity preserved LOW).
- DOC-C5-2: register advertises hardcoded `staleClaimTimeoutMs`; Rust worker only deserializes, never consumes — dead field, no impact. RE-DEFER.

## Other
- N6-C6 reaper writes only `status/deregistered_at/active_tasks` on stale rows; no auth/secret exposure. OK.
- No new secrets, no `config.ts` change, no env leakage this cycle.

No net-new security findings.
