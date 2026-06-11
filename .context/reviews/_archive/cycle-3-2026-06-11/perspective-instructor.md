# Persona: Instructor (authoring, grading, groups, exams, exports) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Walked: exam setup → live monitoring → granting an extension → reviewing integrity signals → grading.

## What got better since cycle 2 (verified)
- Time extensions exist and are durably audited; the status board gives me the dialog; the student's screen follows within a minute. The biggest live-exam incident tool I was missing has landed.
- The IP-overlap report turns hundreds of telemetry rows into an actionable shortlist (shared IPs, >2-IP participants) with benign-explanation framing so I don't over-read NAT artifacts.
- New exams created through the general assignment form now default anti-cheat ON (48856f17) — the silent-no-proctoring trap is closed.
- code_snapshots now have a retention window consistent with the anti-cheat events I derive conclusions from.

## IN3-1 — My integrity dashboard lies to me about extended students (MEDIUM-HIGH from my seat; root cause CR3-1)
After I grant an extension past the assignment close, the platform shows me: a heartbeat GAP covering the accommodation window, and `submission_stale_heartbeat` escalate flags on every submission the student made in it. The documentation tells me these are exactly the signals that "merit deeper human investigation". I would open a misconduct review against a student I personally accommodated. Inverted evidence is worse than no evidence — this needs the server fix plus (after the fix) nothing in my workflow changes; old flags from the bug window cannot be distinguished retroactively, which is one more reason to fix it THIS cycle.

## IN3-2 — The integrity doc misinforms my mental model (MEDIUM; DOC3-1)
`docs/exam-integrity-model.md:55` tells me curl-submissions are hard-blocked. They are not (flag-only by design). My operational obligation — actually review `submission_stale_heartbeat` events before trusting results — is stated nowhere. Fix the doc; my trust in the rest of it depends on it.

## IN3-3 — Extension discoverability gaps (LOW, carried as IN2-2/TA2)
- Pre-start accommodations still impossible (extend requires a started session); per-student duration overrides remain a product decision with an owner exit criterion.
- The extend action lives on the status board only; during an incident I find it, but a hint on the participant timeline view would shorten the path. Cosmetic, defer-eligible.

## Authoring/grading spot-checks (no new issues)
- Problem authoring, test-case management, score overrides, exports: unchanged this cycle; carried items (IN3/JA2 export shapes, similarity-report workflow polish) remain in the register with unchanged preconditions.
- Catalog numbering on /problems now carries the per-viewer hint (title + sr-only), so my class stops citing "problem 37" as a shared id — small but real support-load reduction.
- Roster: manager-gated roster visibility tests landed in cycle-1's surface (3dfc2c75); behavior matches the group-detail gates.

Net: monitoring and incident tooling are now genuinely usable for a live exam; the trust-critical fix is IN3-1 + the doc truth fix.
