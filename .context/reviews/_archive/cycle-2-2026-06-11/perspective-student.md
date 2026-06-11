# Persona: Student taking assignments/exams — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035. Seat: enrolled student in a group, windowed exam
and regular assignments. Walked: assignment list → start exam → editor →
submit → results; failure modes: disconnect, timeout, deadline, recovery.

## What works well at HEAD
- **Crash/disconnect recovery is genuinely good now.** localStorage draft +
  server-side autosave + the NEW recovered-draft toast with timestamp
  (cycle-1 F9) means losing a laptop mid-exam costs at most ~3 s of typing,
  and the recovery is explained ("your own saved work") instead of looking
  like planted code.
- **The windowed model is fair on disconnect:** my personal deadline is a
  server-side row; reconnecting on any device resumes the same window.
  Submissions are validated against DB time, not my clock.
- **Submission feedback** (status SSE, per-test results, failed-case index)
  is fast and specific; queue-status endpoint gives an honest "where am I"
  answer under load.

## Pain points found this cycle

### ST2-NEW-1 — If staff extends my time, I can't tell (LOW-MEDIUM, High confidence)
The countdown is fixed at page render (`page.tsx:196-201`). Scenario: outage
eats 20 minutes, instructor grants +20 — my timer still hits 0; I panic-
submit or stop, and only a reload shows the truth. The server accepts my
work the whole time, but I don't know that. This is the anxiety-inducing
failure mode the extension feature was meant to remove. Fix: live refetch of
the personal deadline + a status note when it changes (shared with V2-1).

### ST2 (carried) — At expiry the editor just… stays open
After my personal deadline passes, the editor remains editable; submission
fails server-side with `assignmentClosed`/deadline errors. I would rather see
an explicit "time expired — your draft is saved; submissions are closed"
state. Carried from cycle 1 with the same exit criterion (pair it with the
ST2-NEW-1 refetch work, which provides the trigger signal).

### ST2-NEW-2 — Snapshot/anti-cheat is invisible but my data lives forever (privacy note, MEDIUM via SEC2-2)
As a student my in-progress code is snapshotted every ~10 s during
assignments. I'd expect that surveillance-adjacent data to expire like the
anti-cheat events do (180 d); today it never does. The fix is the retention
window — from the student seat this is a trust issue as much as a disk one.

## Re-checked, fine
- Problem statements render sanitized markdown with images; samples are
  copy-able; limits visible per problem (`/problems` table shows time/memory).
- Draft autosave does not fire pre-hydration (D4 carried, contract
  documented); language switch preserves non-template work.
- Anti-cheat events: only my own tab/copy/paste/blur activity is recorded,
  during the exam window only, and the exam-integrity doc says exactly that.
