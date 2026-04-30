# RPF Cycle 7 — tracer (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305`.
**Cycle-7 change surface vs prior cycle close-out:** **0 commits, 0 files, 0 lines.**

## Summary

Empty change surface. Stale prior cycle-7 tracer findings (Trace 1: exam countdown time-sync; Trace 2: recruiting token lifecycle) re-validated:
- Trace 1's hypothesis ("clock skew causes countdown inaccuracy") is now **RESOLVED at HEAD** — time endpoint switched to DB time.
- Trace 2's hypothesis ("plaintext token column is data-at-rest risk") is now **RESOLVED at HEAD** — plaintext column dropped from schema.

## Trace 1 — Exam Countdown Time Synchronization (RESOLVED at HEAD)

```
Client (CountdownTimer)
  → GET /api/v1/time
  → Response: { timestamp: await getDbNowMs() }   // DB SERVER CLOCK ✓
  → Client computes offset = data.timestamp - (requestStart + roundTrip / 2)
  → Client displays remaining = deadline - (Date.now() + offset)
  → Equivalent to: deadline - DB_SERVER_CLOCK ✓ (after offset correction)

Server-side enforcement:
  → anti-cheat/route.ts: SELECT NOW()  // DB SERVER CLOCK ✓
  → Both sides aligned to DB time.
```

**Hypothesis 1 (clock skew → countdown inaccuracy):** PREVIOUSLY CONFIRMED, NOW RESOLVED at HEAD. The client-side and server-side time sources are both DB time. App server clock skew no longer affects countdown accuracy.

**Hypothesis 2 (NTP correction mid-exam → countdown jump):** STILL APPLICABLE BUT BENIGN. Periodic offset re-computation in `CountdownTimer` smooths over NTP corrections.

## Trace 2 — Recruiting Token Lifecycle (RESOLVED at HEAD)

```
Creation: server action generates token → ONLY tokenHash stored in `tokenHash` column. Plaintext token NOT persisted to DB. ✓
Redemption: authorizeRecruitingToken() looks up by tokenHash (hash of input) → updates status. ✓
Display: Invitation list shows candidateName/candidateEmail; token never returned in API. ✓
```

**Hypothesis (plaintext token column is data-at-rest risk):** PREVIOUSLY CONFIRMED, NOW RESOLVED at HEAD. Plaintext `token` column dropped from schema; only `tokenHash` persisted. DB backup leak no longer exposes redeemable tokens.

Note: there may be historical rows with plaintext tokens in older DB backups taken BEFORE the column drop. That's a backup-rotation concern, not a current code concern. Defer with exit criterion: backup retention audit cycle opens.

## Trace 3 — Deploy SSH-helpers (cycle-6 commit `72868cea` + `2791d9a3`)

```
Operator → ./deploy-docker.sh
  → _CALLER_SUDO_PASSWORD captured from env at line 75
  → trap restores SUDO_PASSWORD on exit
  → _initial_ssh_check uses max_attempts="${DEPLOY_SSH_RETRY_MAX:-4}", validated
  → remote_sudo: sudo_pw="${SUDO_PASSWORD:-${SSH_PASSWORD}}", piped to sudo -S
  → sshpass -p "$SSH_PASSWORD" — SSH side unchanged
```

**Hypothesis (rotation paths exist for split SSH/sudo credentials):** CONFIRMED at HEAD.
**Hypothesis (slow-boot host can extend retry count):** CONFIRMED at HEAD via `DEPLOY_SSH_RETRY_MAX`.
**Hypothesis (existing happy-path unchanged when env vars unset):** CONFIRMED — defaults preserve prior behavior.

No regression traces.

## NEW tracer findings this cycle

**0 NEW.** All stale cycle-7 traces either RESOLVED at HEAD or carry forward as documented.

## Recommendations for cycle-7 PROMPT 2

1. Record Trace 1 + Trace 2 closures (both silently RESOLVED at HEAD).
2. Note the historical-backup-leak concern from Trace 2 as a deferred operational item.

## Confidence

H.
