# Persona: TA / Assistant (partial permissions) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Walked the TA seat: monitor a live exam, triage integrity signals, support students, attempt (and be denied) write actions.

## Permission boundary checks on the new surface (verified correct)
- **Extension PATCH** (`exam-sessions/[userId]/route.ts:39-45`): gated by `canManageGroupResourcesAsync` — monitoring-only TAs CANNOT change exam time. Correct: time changes are grading-relevant and stay with managing staff. The route comment states the rationale explicitly.
- **IP-overlap report** (`anti-cheat/route.ts:180-184,193`): gated by `canMonitorContest` — the same read gate as the event list, so as a TA I CAN use the new duplicate-account shortlist during a live exam without write power. Right call: it is read-only aggregation of rows I already see.
- **Cross-participant exam-session GET**: requires `canViewAssignmentSubmissions`; as a monitoring TA I can check a student's personal deadline when they claim "my timer is wrong" — useful in the support flow; non-staff cannot enumerate (silent self-fallback).
- Roster remains manager-gated (3dfc2c75 tests); I see what I need for grading without student-PII overreach.

## TA3-1 — I can SEE the false-suspicion flags but cannot see they're false (MEDIUM from this seat; root cause CR3-1)
Exam-end triage is typically delegated to TAs. Post-extension, the dashboard hands me `submission_stale_heartbeat` escalate flags and heartbeat gaps for the accommodated student; nothing on the dashboard correlates "this window was a granted extension" with "these flags are artifacts". Even after the CR3-1 server fix, consider (LOW, future) surfacing the extension event in the participant timeline view — the durable audit row exists (`exam_session.extend`); rendering it in the timeline would let a TA self-serve the explanation. Recording as a follow-up candidate, not this cycle's scope.

## TA3-2 — Carried gaps (unchanged)
- TA1/TA2 from the register (clearer TA-capability documentation; TA visibility into score-override history) carry with unchanged preconditions and exit criteria.
- IN2-2 (pre-start accommodations) affects my support scripts too: the answer to "student X gets time-and-a-half" is still "have them start, then extend immediately" — workable, documented in the plan register, awaiting the owner's product decision.

## Workflow spot-checks (no new issues)
- Grading/regrade request flows, similarity-report read access, and submission viewing for my groups behave per the capability matrix at this HEAD; no privilege escalation paths found through the new endpoints (extension PATCH rejects TA tokens with 403; verified by the route's gate order — group → canManage → assignment).
- The status board's extend control simply doesn't render actionable for non-managers, matching the API gate — no "button that 403s" trap for TAs.

Net: TA boundaries on the new features are correctly drawn; the one material issue is shared with the instructor seat (CR3-1 artifacts land in MY triage queue).
