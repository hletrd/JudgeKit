# Perspective: Student (assignments / exams) — RPF Cycle 7 (2026-06-13)

Seat: a student taking a graded assignment or a windowed/scheduled exam on the
platform. Reviewed the submission flow, deadline handling, anti-cheat
experience, and disconnect/timeout failure modes from the student's side.
**HEAD 0472b007.**

## ST7-1 — Submission listing can show my own submission twice or skip one at a page boundary (LOW-MEDIUM, High, CONFIRMED — student-facing CR7-1)
When I submit a burst near the deadline, several of my submissions share the
same `submitted_at` second. The offset-paginated listings that order by
timestamp only (CR7-1) can shuffle those rows between page 1 and page 2 — so
my submissions page shows one entry twice and hides another. During a high-
pressure exam this reads as "did my submission get lost?" and triggers a
re-submit (wasting time, adding anti-cheat noise). The submissions listing
itself was fixed in cycle-6; the anxiety-equivalent surfaces that remain
(anti-cheat timeline I might see, etc.) should get the same stable order.

## ST7-2 — If my exam gets extended, a token-only account could be denied (LOW, Medium, CONFIRMED — student face of SEC7-1)
If I'm in a contest via an access token (not a roster enrollment) and the
instructor extends the deadline to accommodate an incident, my token still
expires at the OLD time — every token gate would deny me during the bonus
window. Today a parallel enrollment row saves me, but that is luck, not
design. From my seat this would be a terrifying "you're not enrolled" error
during the exact window I was told I had extra time. Fix: sync token expiry on
schedule edit (SEC7-1).

## What works well from the student seat (verified)
- **Disconnect mid-exam:** the anti-cheat monitor queues events to
  localStorage FIRST and replays them on reconnect/remount (queue-first,
  cycle-6) — a brief wifi drop no longer silently loses my activity or
  fabricates a "stale heartbeat" flag against me.
- **Heartbeat freshness margin:** a failed heartbeat insert now evicts the
  dedup key so my client's retry re-records immediately (cycle-6) — I'm not
  penalized for a transient server hiccup.
- **Deadline accommodations:** windowed-exam personal deadline extensions are
  honored by submit AND telemetry (no dark window, no false flags) — fair.
- **Privacy notice:** the monitor shows an explicit notice of what's recorded
  (tab switches, copy/paste, IP, code snapshots) before monitoring — good
  consent UX.

## Carried (env-gated / product)
- ST5-5: the countdown trusts the client clock between refocus syncs
  (`countdown-timer.tsx:47`) — display-only; server enforces the real
  deadline. Carry (exit: a cycle adding a server-time sync indicator).

## Net
Two student-facing correctness items (ST7-1 paging anxiety on listings,
ST7-2 token lockout on extension) both pair with already-scheduled fixes; the
core exam experience is fair and resilient.
