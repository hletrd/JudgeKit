# Perspective: Student (taking assignments/exams) — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. Seat: a student joining an exam/contest via an access code.

## ST8-1 — Contest can disappear from my view during a late window I was promised (MEDIUM via CR8-1)
**File:** `src/lib/assignments/access-codes.ts:191`.
If I join an exam by typing the access code, my access token is stamped to expire
at the **deadline** — not the **late deadline**. If my instructor set a late
window (e.g. "due 5pm, accepted with penalty until 6pm"), then between 5pm and
6pm the contest can drop out of my platform-mode catalog, while a classmate who
was *invited* (not access-code) still sees it. From my seat this is "the system
locked me out / lost my access" during a window I was told I had — a real anxiety
and fairness failure mode in a timed assessment. (I can still submit because I'm
auto-enrolled, but the inconsistent visibility is confusing and erodes trust.)
**Fix:** stamp expiry at the effective close (`lateDeadline ?? deadline`), same
as invited students — makes my experience identical regardless of how I joined.

## What works well for me
- Disconnect mid-exam: heartbeats + gap detection mean a brief drop is recorded,
  not treated as instant failure; resuming continues my session.
- Submission feedback, problem statements, and the countdown remain clear.
- Anti-cheat evidence the proctor sees is now stable (no rows vanishing), so a
  reviewer is less likely to mis-read my activity.

## Carried (affects me, owner-gated): ST5-5 (countdown trusts client clock
between refocus syncs). Carried — no server-time-sync indicator added this cycle.
