# Persona: Job Applicant (recruiting coding test) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Walked the candidate path: token redemption → first-run → timed test → incident (disconnect / extension) → submission → trust perception.

## First-run and trust (verified at this HEAD)
- Privacy notice before any telemetry: the anti-cheat monitor blocks on an explicit accept dialog enumerating exactly what is collected (tab switches, copy/paste, IP, code snapshots) — no silent surveillance; the notice cannot be dismissed accidentally (`disablePointerDismissal`, no close button). This matters for recruiting-candidate consent posture.
- Token redemption failure modes return distinct errors (`tokenExpired`, `alreadyRedeemed` — seen in unit logs) rather than a generic failure; the candidate knows whether to ask the recruiter for a new link.
- The countdown re-syncs server time on refocus — my timer is honest even after laptop sleep.

## JA3-1 — Incident recovery now works, but it can mark me as a cheater (MEDIUM-HIGH from this seat; CR3-1)
The exact recruiting scenario the extension feature was built for — "outage ate part of a candidate's window, recruiter grants time back" — is the scenario that triggers the false-suspicion flags when the granted time crosses the original close. A hiring decision influenced by `submission_stale_heartbeat` escalate flags fabricated by the platform against a candidate who was COMPENSATED for the platform's own outage is the worst-case fairness outcome for recruiting use. Highest-priority fix from this seat.

## JA3-2 — Accidental-disqualification risks (re-walked; acceptable)
- Brief alt-tabs are absorbed by the 3 s grace timer before a tab_switch is recorded; the warning toast is informative, not punitive.
- Submissions are never hard-blocked on heartbeat staleness (fail-open) — a flaky cafe wifi cannot eat my final submission; it can only add reviewable context.
- localStorage event queue survives page reloads; my disconnect during the test does not silently void my telemetry for the connected periods.
- One residual: nothing in the UI tells me ahead of time which languages are available for THIS test; the problem workspace's language selector is registry-driven, so I discover availability live. Carried as the JA-environment-clarity item (LOW; unchanged from the register).

## JA3-3 — Time-pressure UX (verified good)
Threshold warnings at 15/5/1 min with screen-reader announcements (`aria-live`, assertive at 1 min); no toast storm on tab return; extension (if granted) announces itself with a persistent status note rather than a transient toast only — I won't miss it while heads-down coding.

## Trust/fairness perception summary
The platform's honest-by-design choices (fail-open submission gate, advisory-not-proof documentation posture, consent dialog) are exactly what a candidate-rights-aware recruiting flow needs. The single inversion of that posture is JA3-1/CR3-1 — fix it before the next live recruiting window that might need an extension.
