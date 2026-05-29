# Cycle 7 — critic (multi-perspective)

## N7-C7 — strongest finding this cycle
Multiple lenses converge: code-reviewer (gap + dead cache-bust), verifier (claim falsified), tracer (H1 bug beats H2 intentional on evidence), architect (two-engine SSoT violation), debugger (live failure + fix edge-cases), document-specialist (docs silent), test-engineer (no coverage either way). High signal.

**Skeptical counter-argument (steelman H2):** maybe contest rankings SHOULD ignore overrides for integrity — an instructor shouldn't be able to manually inflate a contest rank. Rebuttal: (a) the gradebook already trusts the instructor with overrides for the same assignment; (b) commit `1bbec040` explicitly wired override→ranking cache invalidation; (c) overrides are capped at the problem's max points (`overrides/route.ts:88-91`) and audit-logged, so they are not unbounded cheating. The integrity argument does not survive the existing code's own intent. Proceed with the fix.

**Scope discipline:** per the orchestrator's anti-churn guidance and the debugger's edge-case analysis, the cycle-7 fix should cover IOI (unambiguous: override replaces the per-problem score) + single-user live rank, and EXPLICITLY DEFER the ICPC-override penalty/firstAc semantics (genuinely undefined by the product — an override has no AC timestamp) with a stated exit criterion. Implementing a guessed ICPC behavior would be exactly the "manufacture scope" the orchestrator warns against. This is a principled defer of an UNDEFINED sub-behavior, not a defer of the confirmed IOI correctness gap.

## Process note
Cycle-6 N6-C6 fully landed + deployed; the stale `plans/open/2026-05-14-cycle-6-review-remediation.md` (a different, older "cycle 6") should be reconciled/archived to avoid confusion with the May-29 cycle-6 plan. Housekeeping, not a code finding.

No security, data-loss, or Korean-typography issues this cycle.
