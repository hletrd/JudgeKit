# RPF Cycle 11 — Verifier ( refreshed 2026-05-11 )

**Date:** 2026-05-11
**HEAD reviewed:** `b5008708`

---

## Findings

**0 HIGH/MEDIUM/LOW NEW.**

## Evidence-based correctness checks

- **CountdownTimer sync cleanup:** Verified. `syncCleanupRef.current?.()` is called in both mount cleanup (line 116) and timer effect cleanup (line 216). Cycle-10 fix intact.
- **Recruiting token DB time:** Verified. `redeemRecruitingToken` fetches `getDbNowUncached()` at line 482 and uses it for `enrolledAt` (674), `redeemedAt` (685), `updatedAt` (694), `tokenInvalidatedAt` (552). Old AGG-1 finding fixed.
- **Export/backup DB time:** Verified. `backup/route.ts` fetches DB time at line 69 and passes it to `streamDatabaseExport` (100) and `streamBackupWithFiles` (90). Old AGG-2 finding fixed.
- **File.type removal:** Verified. Drag-drop upload validation in `file-upload-dialog.tsx` no longer trusts `file.type`. Cycle-9 fix intact.
- **JWT callback same-user check:** Verified. `src/app/api/v1/submissions/[id]/events/route.ts` has same-user verification on periodic re-auth. Cycle-10 fix intact.

## Verdict

All stated behaviors verified against code. No discrepancies.
