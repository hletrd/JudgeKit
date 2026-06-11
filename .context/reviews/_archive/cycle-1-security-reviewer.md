# RPF Loop Cycle 1 — Security Reviewer (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** security-reviewer

## Summary
Security posture has improved significantly in the last month: `JUDGE_AUTH_TOKEN` shared-token escalation closed, `RUNNER_AUTH_TOKEN` separated, IP allowlist now supports IPv6 CIDR, KaTeX hardened, anti-cheat heartbeat freshness enforced on submission, AUTH_CACHE_TTL_MS capped, dead in-memory rate limiter removed, and dockerfile-path validator anchored to `judge-` prefix. No HIGH severity NEW findings. A few MEDIUM/LOW items remain.

## NEW findings

### SEC-1: [MEDIUM] `participant-status.ts` exposes `latestStatus` ("accepted") fall-through that may render premature accepted state

- **File:** `src/lib/assignments/participant-status.ts:107-111`
- **Description:** No security risk — internal status mapping. Cross-listed for visibility with code-reviewer CR-2.
- **Confidence:** LOW (security)
- **Status:** Tracked under code-reviewer CR-2.

### SEC-2: [MEDIUM] `pre-restore-snapshot.ts` writes full-fidelity dump to filesystem without explicit chmod

- **File:** `src/lib/db/pre-restore-snapshot.ts:23-65`
- **Description:** The snapshot is a `sanitize: false` dump — it contains password hashes, encrypted secrets (the encrypted-then-stored variant), JWT secrets, and more. The file is written via `writeFile(fullPath, merged)` which honours the process umask but does not explicitly `mode: 0o600` the file. On a default `umask 0022` host, the file is `0644` — world-readable. If multiple Docker containers share the data volume (or if a non-root user on the host can read `/data`), the snapshot can leak.
- **Confidence:** MEDIUM (depends on operator's umask / volume permissions)
- **Failure scenario:** A multi-tenant docker host with weak volume isolation; a forensic agent on the host that runs as a non-root user; a backup tool that crawls the data volume and uploads to a less-trusted location.
- **Fix:** Pass `{ mode: 0o600 }` to `writeFile` (it accepts an options object). Add an explicit `chmod` after `mkdir` to set the directory to `0o700`.

### SEC-3: [MEDIUM] `recruit/[token]/results/page.tsx` does not guard against archived/inactive recruiters re-enabling `showResultsToCandidate`

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:90-131`
- **Description:** The page reads `assignment.showResultsToCandidate` directly from the assignment row. There's no audit / time-based gate — a recruiter could toggle the flag, disclose results, and toggle it off without any record. The audit log already covers `assignment.update` events; that should be sufficient. This is more an "operator hygiene" gap than a vulnerability.
- **Confidence:** LOW
- **Fix:** None required — already audited at the toggle site.

### SEC-4: [LOW] `proxy.ts` AUTH_CACHE_TTL_MS uses `Date.now()` directly, drift from DB-time hardening pattern

- **File:** `src/proxy.ts:64, 80, 91`
- **Description:** Cycle 5 hardened many call sites to use `getDbNowMs()` to avoid clock skew. The proxy edge runtime cannot await DB time (no DB connection in Edge), so `Date.now()` is acceptable here. But the comment at line 21-22 says "up to AUTH_CACHE_TTL_MS (default: 2 seconds)" — actual default is `2000` ms. This is consistent. No security action needed; nominal drift acceptable.
- **Confidence:** LOW (informational)
- **Status:** Acceptable; documented for completeness.

### SEC-5: [LOW] `assignment-context-requirement-implementation.test.ts` failure indicates source no longer hardcodes built-in student role

- **File:** Drift between source (uses shared helper) and test (looks for the literal hardcoded `"student"` role)
- **Description:** The implementation guard test for capability migration is failing. This is *good* — the source moved off the legacy hardcoded check. The TEST is the stale artefact, not the source. No security issue at HEAD; just test-engineer follow-up TE-11.
- **Confidence:** HIGH
- **Status:** Test fix only.

### SEC-6: [LOW] `recruiting-candidate-isolation-implementation.test.ts` failures cross-reference

- **File:** `tests/unit/api/recruiting-candidate-isolation-implementation.test.ts`
- **Description:** Two source-grep tests fail: "keeps recruiting candidates out of shared standings on the contest detail page" and "prevents recruiting candidates from reaching per-problem rankings even via direct routes". This is a sensitive area — recruiting-candidate isolation directly impacts whether one candidate can see another's information. Need to verify the source actually preserves isolation (the test pattern just drifted), not that the isolation was removed.
- **Confidence:** MEDIUM (manual verification recommended)
- **Fix:** Read `src/app/(public)/contests/[id]/page.tsx` and `src/app/(public)/problems/[id]/rankings/page.tsx` (or wherever the recruiting redirect lives) and confirm the runtime isolation is intact, then update the source-grep test to match the new literal pattern.

## Final-sweep checklist

- [x] Verified the main hardening commits land at HEAD: `909fcbf5` (judge token), `9e88d910` (docker token), `12417fa9` (IPv6 CIDR), `220d9182` (KaTeX), `9ce944a9` (cache cap), `8937be37` (sidecar token enforcement), `7eb128fc` (anti-cheat heartbeat).
- [x] Confirmed `JUDGE_AUTH_TOKEN` fallback removed from `docker/client.ts:13-25` and `judge/auth.ts:54-97`.
- [x] Confirmed `assertProductionConfig` aborts on missing `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`.
- [x] Re-read encryption module — plaintext-fallback is documented as deferred (C7-AGG-7) with a warn-log audit trail.
- [x] No new HIGH-severity finding at HEAD.
