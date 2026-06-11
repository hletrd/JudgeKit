# Persona: Student taking assignments/exams — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Walked the windowed-exam flow as a student would experience it: start → work → deadline pressure → extension → disconnect → submit.

## What got better since cycle 2 (verified in code)
- If staff extends my time, my countdown now actually moves (within ≤60 s or on tab refocus), I get a toast plus a persistent "deadline extended" note, and the problem list comes back even if I was already staring at the red "time expired" panel (`ExamDeadlineSync` mounts in the expired state — `page.tsx:197-207`). This was the single most anxiety-inducing failure mode from the cycle-2 persona review; it is fixed.
- The extend dialog my instructor uses is no longer fiddly (Enter submits, Cancel exists) — indirectly my wait time for a rescue is shorter.
- A draft I forgot to submit announces itself when recovered (c7af2a37).

## ST3-1 — During my accommodation window, the platform quietly treats me as suspicious (MEDIUM-HIGH from my seat; same root cause as CR3-1)
If my extension carries me past the original assignment deadline: I keep seeing "tab switching is recorded" warnings (so I behave carefully), but every event my browser sends is rejected server-side, and **each submission I make adds a `submission_stale_heartbeat` flag to the instructor's dashboard against my name**. I have no way to know, no way to fix it, and the students MOST likely to hit this are accommodation holders. If a grade dispute ever cites those flags, the harm is real. This must be fixed server-side (CR3-1) — from my seat it is a fairness bug, not a telemetry bug.

## ST3-2 — Disconnect/timeout mid-exam (re-walked; acceptable)
- Editor drafts: autosave + recovery notification; offline anti-cheat events queue in localStorage and flush on `online`/refocus (bounded retries).
- Countdown: re-syncs server time on refocus; background-tab drift handled; threshold toasts suppressed after long-hidden (no toast storm on return).
- Deadline sync: offline poll failures keep the current deadline (extension-only contract means I can never LOSE time from a flaky network).
- Submission at the wire: the server is authoritative (`validateAssignmentSubmission`); if my heartbeats went stale because of wifi, I am NOT blocked (fail-open) — correct call for my anxiety, and the flag is reviewable context.

## ST3-3 — Clarity nits (LOW, carried)
- ST2 (problem statement sample-IO copy affordances) and the pre-start accommodation gap (IN2-2: extensions need an existing session, so extra time can only be granted AFTER I start) remain carried with unchanged owner decisions. The workaround (extend right after start) works but requires the instructor to remember per-student.
- When my exam-session poll 401s after a session expiry + re-login in another tab, the poller just stays silent (deadline frozen until refocus refetch succeeds) — acceptable, no false data shown.

Net: the student experience at this HEAD is the best it has been across cycles; the one open item (ST3-1) is serious precisely because everything else now works.
