# Perspective: Instructor (author, grader, proctor) — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. Walked authoring → roster → live proctoring → similarity review → grading/export as the owning instructor of a group.

## What works well
- **Live proctoring view** finally answers "who is dark RIGHT NOW": the ongoing heartbeat-gap badge (cycle-5 G3) plus the legible escalate flag with humanized details and the linked submission id. The signals disclaimer correctly frames telemetry as low-confidence input, not verdicts.
- **Collusion tooling:** the ipOverlap report (shared IPs, multi-IP users) over data I already see per-row; similarity scan with truthful skip reasons and language-bucketed pairs.
- **Accommodations:** `extendExamSession` composes concurrent extensions in SQL and is honored end-to-end (submission gate, telemetry gate, late-penalty scoring) — the cross-gate consistency work from cycles 1–3 holds.

## Pain points / risks found

### IN6-1 — Removing a student from my roster does NOT revoke their contest access (MEDIUM, High — instructor-visible face of SEC6-1)
My mental model of the roster page is "this list = who can participate." Reality: anyone I ever invited keeps a `contest_access_tokens` row that the submit gate honors even after I remove them (and even past expiry on some gates). During a recruiting test this means a candidate I disqualified can keep submitting until the window closes. The removal action must delete the group's tokens for that user, and all gates must check expiry identically.

### IN6-2 — Similarity evidence rows don't record the language (LOW, High — CR6-4)
The scan compares per (problem, language) and the on-screen pair table shows language, but the persisted `code_similarity` event (what I'd cite in an academic-integrity case file) omits it. Two-language flags for the same pair look like duplicates. Add language to the stored details.

### IN6-3 — My timeline can show duplicate rows while I watch a student live (LOW, Medium — P6-2/D6-2)
Poll refresh + "Load more" can interleave into doubled events. I can't trust an evidence view that visibly duplicates rows, even cosmetically.

### IN6-4 — I cannot filter events from the keyboard (MEDIUM a11y, High — DES6-1)
The type-filter chips on both proctoring views are mouse-only spans.

### IN6-5 (carried) — Extension grants don't appear in the participant timeline (TA3-1-followup/DES4-4): when I extend a student's window mid-incident there's no timeline artifact to point at later. Carried with its owner-scheduling exit criterion.

## Authoring/grading spot-checks (no new issues)
- Score overrides flow into the status rows exactly once (`getAssignmentStatusRows` override map) and are flagged `isOverridden`.
- Late-penalty math keys on personal deadlines for windowed exams — consistent across leaderboard/status/stats (single SQL case-expr source).
- IN2-2 (pre-start accommodations / per-student duration) remains an owner decision; workaround (extend after start) documented — carried.

## Verdict
Proctoring UX took a real step forward in cycle-5. The roster-revocation gap (IN6-1) is the one item I'd insist on before my next recruiting round.
