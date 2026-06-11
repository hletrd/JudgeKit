# Critic — RPF Loop Cycle 4 (2026-05-03)

**Stance:** skeptical sweep across the cycle-3 close-out surface.

## Sharp questions and answers

### Q1: Is the CYC3-AGG-1 stat-failure log split actually solving the operator-confusion problem?
**A:** Yes — the warn line says "size unavailable (stat failed)" explicitly and
omits `sizeBytes` from the payload, while the info line includes
`sizeBytes` only when stat() succeeded. An operator scanning structured logs
can grep for the warn message OR for `sizeBytes:0` and reach the right
conclusion in either case. The fix is correct.

### Q2: Does CYC3-AGG-2's recruit-results extract actually narrow the test target, or did it just move the bug?
**A:** Narrow. The page server-component is no longer testable in isolation
(needs DB, Next.js context, i18n setup). The helper is pure. The 8-case
test pins the cycle-1 C1-AGG-2 regression scenario explicitly. A future
refactor that reverts to inline math would have to delete the helper, the
import, AND the test file — much harder to do silently.

### Q3: Is the CYC3-AGG-3 retention test brittle?
**A:** Mildly. The 5ms inter-snapshot sleep assumes sub-second mtime resolution.
On modern macOS APFS / Linux ext4 / btrfs / zfs this is fine. On NFS or older
FAT, mtime can be 1s resolution. The test's use of a temp dir under `os.tmpdir()`
keeps it on local disk, so the practical risk is low. Acceptable.

### Q4: Is the CYC3-AGG-4 JSDoc rewrite an adequate substitute for tightening the blocklist (CYC3-AGG-7)?
**A:** For the current call sites — yes. All four current callers
(`buildIoiLatePenaltyCaseExpr` arguments) pass hardcoded string literals.
The defence-in-depth is non-zero: the regex still catches the most common
keyword payloads (DELETE/DROP/INSERT/UPDATE/ALTER/CREATE/EXEC/EXECUTE),
which are sufficient for the "obvious mistake" threat model. The JSDoc is
now explicit that the blocklist is non-exhaustive, so a future maintainer
adding a non-literal caller is on notice.

### Q5: Does the CYC3-AGG-5 retention test actually prove failure isolation, or just check 5 calls happened?
**A:** Both. The test (1) asserts at least 5 db.execute calls (the 5 prune
helpers), (2) asserts the warn-log line is emitted with the rejection reason,
and (3) verifies the rejection message contains
`"simulated lock contention on chatMessages"`. A regression to `Promise.all`
would short-circuit on the first throw, leaving < 5 db.execute calls and
no warn-log call. The test would fail. Solid coverage.

### Q6: Is the CYC3-AGG-6 NaN guard load-bearing or theatre?
**A:** Theatre with future-proofing. Today, no caller passes a NaN: the DB
returns numbers or null, and the page checks for null before calling. But
the guard prevents a future regression like `parseFloat(req.body.score)`
from rendering "NaN / 75" in the candidate UI. Cheap insurance. The unit
test pins three non-finite cases.

## NEW findings this cycle

### CRIT4-1: [LOW] The cycle-3 plan archive is correct, but the cycle-11 stale plan in `plans/open/` is a documentation hygiene gap

- **Source:** plan housekeeping inspection
- **File:** `plans/open/2026-04-29-rpf-cycle-11-review-remediation.md`
- **Description:** This file is from a prior RPF loop (loop cycle 11/100,
  HEAD `7073809b` which is no longer reachable from `main`). The current
  loop only goes up to cycle 4. Leaving the file in `plans/open/` confuses
  any reader who scans the directory expecting current work. The cycle-10
  housekeeping commit ostensibly cleaned this up, but the file lingers.
- **Confidence:** MEDIUM
- **Fix:** Archive to `plans/closed/` with a header noting "superseded by
  current RPF loop cycles 1-N". Or move to `plans/_archive/`. Either way,
  it should not be in `plans/open/` if the loop has moved on.

### CRIT4-2: [LOW] The recruiting-results helper accepts `ReadonlyMap<string, RecruitBestSubmission>` but the page passes a wider Map

- **Source:** type-narrowing inspection
- **File:** `src/lib/assignments/recruiting-results.ts:55`
- **Description:** TypeScript structural typing accepts the wider Map
  because `RecruitBestSubmission { score: number | null }` is a structural
  subset. This is correct now, but the helper's contract is implicit —
  the page is responsible for narrowing if a future field is added to
  `RecruitBestSubmission`.
- **Confidence:** LOW
- **Fix:** Add a JSDoc note: "Callers may pass any Map whose values include
  a `score: number | null` field; other fields are ignored." Optional
  polish; covered partially by the TypeScript signature.

### CRIT4-3: [LOW] The cycle-3 plan body says all gates green, but `npm run test:e2e` was env-blocked and recorded as DEFER-ENV-GATES

- **Source:** plan-body inspection
- **File:** `plans/done/2026-05-04-rpf-cycle-3-review-remediation.md:314`
- **Description:** The plan reports "All gates green" then notes
  `npm run test:e2e — env-blocked, deferred under DEFER-ENV-GATES`. A
  reader scanning the bullet list could miss the e2e caveat. Minor wording
  drift; not a real correctness gap.
- **Confidence:** LOW
- **Fix:** No action needed; the deferral is recorded honestly.

## Cross-cutting observation

The cycle-3 close-out surface is small (7 source/test commits) but high
quality. Each fix has:
1. A linked finding ID in the commit message and the source comment.
2. A test that pins the contract (or a test file already pinning it).
3. A doc-string update where the threat model needed clarification.

This is the "boring code" hallmark — defects do not arrive in the patches
themselves; they arrive in the gaps between patches. The cycle-4 review
surface is correspondingly quiet.

## Summary

| ID | Severity | File | Action |
|----|----------|------|--------|
| CRIT4-1 | LOW | `plans/open/2026-04-29-rpf-cycle-11-...md` | Archive stale plan |
| CRIT4-2 | LOW | `recruiting-results.ts` | JSDoc note about ignored fields |
| CRIT4-3 | LOW | `plans/done/2026-05-04-...md` | No action |

No HIGH/MEDIUM new findings.
