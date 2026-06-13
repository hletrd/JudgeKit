# RPF Cycle 6 (2026-06-12) — Aggregate Review

**Date:** 2026-06-12
**HEAD reviewed:** 22e1510f (main == origin/main, clean tree) — cycle-5's completed tree, deployed healthy on all three targets at bcfa32aa.
**Cycle:** 6/100 (orchestrator-numbered)
**Lenses:** 11 specialist + 6 persona files in this directory, all fresh at this HEAD (cycle-5 versions moved to `_archive/cycle-5-2026-06-12/`).
**Baseline gates on review HEAD (executed):** tsc 0 · eslint 0/0 · lint:bash clean · unit 338 files / 2632 tests PASS.

## AGENT FAILURES
None of the named reviewer subagents are registered in this environment (no Agent tool is available to this cycle's runner; `.claude/` contains no agent definitions — same condition as cycles 1–5). Per the established fan-out fallback, every lens was executed directly by the cycle agent and written to its own file; no lens was dropped. Recorded for provenance.

## Merged findings (deduped; severity/confidence preserved at max across lenses)

### AGG6-1 — Contest access-token lifecycle: no revocation on roster removal; expiry enforced on only 3 of 6 gates (MEDIUM, High, CONFIRMED)
**Lenses:** security SEC6-1 + perspective-security §1/§3, code-reviewer CR6-1, architect A6-1, tracer Trace 1, debugger D6-4, test-engineer TE6-1, perspective-student ST6-1, perspective-instructor IN6-1, perspective-admin AD6-3, perspective-assistant TA6-3, perspective-job-applicant JA6-1 — **12-lens agreement; highest signal.**
(a) `DELETE /groups/[id]/members/[userId]` deletes only `enrollments`; zero `delete(contestAccessTokens)` call sites exist, so the invite-era token re-grants submit + contest detail after removal. (b) `validateAssignmentSubmission` (`submissions.ts:324-330`), `getContestUserStatus` (`public-contests.ts:224-231`), `getEnrolledContestDetail` (`:291-297`) skip the `expires_at` filter that `platform-mode-context.ts` (×3), `getContestsForUser` (`contests.ts:182-185`), and the anti-cheat ingest (`anti-cheat/route.ts:84`) enforce. Fix: new `src/lib/assignments/contest-access-tokens.ts` owning a Drizzle finder + SQL EXISTS fragment (both expiry-checked); consume in the 3 unchecked gates; member-removal tx deletes that user's tokens for the group's assignments (+ audit detail); creation sets `expiresAt = lateDeadline ?? deadline` (invite route + recruiting redemption) so the legitimate late window survives. Red-first tests per TE6-1.

### AGG6-2 — `reportEvent` direct send: the last silent telemetry-loss window (MEDIUM, High, CONFIRMED — cycle-5 G4 residual, exit criterion FIRED: this is "the next monitor pass")
**Lenses:** debugger D6-1, architect A6-2, critic §2, tracer Trace 2, test-engineer TE6-2, security persona rec #2, student ST6-2, applicant JA6-3.
`anti-cheat-monitor.tsx:195-225`: first transmission of every event bypasses queue and in-flight slot; tab close mid-send loses it. Fix: queue-first — synchronously enqueue (retries:0) then trigger `flushPendingEvents()`; the existing claim loop + slot + single-flight + backoff cover the rest. Component test: unmount mid-send → remount → sent exactly once.

### AGG6-3 — Anti-cheat filter chips are mouse-only (MEDIUM a11y, High, CONFIRMED — WCAG 2.1.1/4.1.2)
**Lenses:** designer DES6-1/DES6-2, instructor IN6-4, assistant TA6-2, test-engineer TE6-3.
`anti-cheat-dashboard.tsx:459-475` + `participant-anti-cheat-timeline.tsx:251-269`: span-rendered Badges with onClick only. Fix: Badge `render` prop → real `<button type="button">` with `aria-pressed`; keyboard tests both views.

### AGG6-4 — Heartbeat LRU dedup marks the window before the insert commits (LOW, Medium, RISK)
**Lenses:** debugger D6-3, security SEC6-2, tracer Trace 3(b), applicant JA6-2, test-engineer TE6-6.
`anti-cheat/route.ts:139-158`: failed insert → 60 s suppressed heartbeats on that instance, shrinking the 90 s freshness margin honest candidates depend on. Fix: evict the key when the insert throws; route test with one-shot insert failure.

### AGG6-5 — Submissions offset listing lacks the id tiebreak (LOW-MEDIUM, High, CONFIRMED)
**Lenses:** code-reviewer CR6-3, student ST6-4, test-engineer TE6-4, doc-specialist (api.md note).
`submissions/route.ts:167` vs cursor mode `:123`. Fix: `desc(submissions.id)` second key + shape test.

### AGG6-6 — Timeline poll-reset vs loadMore race duplicates evidence rows (LOW, Medium, LIKELY)
**Lenses:** perf P6-2, debugger D6-2, instructor IN6-3, assistant TA6-4.
`participant-anti-cheat-timeline.tsx:104-113` + `:126-144`. Fix: fetch-sequence counter dropping stale loadMore responses (+ defensive id-dedupe on append); component test interleaving poll+loadMore.

### AGG6-7 — `code_similarity` evidence rows omit the language bucket (LOW, High, CONFIRMED)
**Lenses:** code-reviewer CR6-4, security SEC6-3, instructor IN6-2, perspective-security §1.
`code-similarity.ts:420-435`. Fix: add `language` to the details payload (+ test asserting it).

### AGG6-8 — Dead `service_unavailable` similarity vocabulary: enum member, dashboard branch, both locale strings (LOW, High, CONFIRMED)
**Lenses:** code-reviewer CR6-2, architect A6-4, verifier V6-8, doc-specialist DOC6-3, admin AD6-2, test-engineer TE6-5.
`code-similarity.ts:242`, `anti-cheat-dashboard.tsx:74,299`, `messages/en.json:2313` + ko. Fix: remove all four surfaces; adjust catalog-pin baseline with justification per the pin's own contract.

### AGG6-9 — Stale registers and a false authz comment (LOW–MEDIUM doc, High, CONFIRMED)
**Lenses:** verifier V6-6/V6-7, doc-specialist DOC6-1/DOC6-2, admin AD6-1, assistant TA6-1, critic §5, code-reviewer CR6-5.
(a) `plans/open/user-injected/pending-next-cycle.md` items #1/#3 are complete in-repo (evidence: archived migration plan "ALL PHASES COMPLETE"; `deploy-docker.sh:657`). (b) `anti-cheat/route.ts:192-195` comment misstates the POST's authz. Fix: update the register with citations (move resolved items per `plans/done/user-injected` convention); correct the comment.

## New deferral candidate (perf)
**P6-1** — TS similarity fallback's normalization phase doesn't time-slice or honor the abort signal (`code-similarity.ts:266-275`). LOW/Medium, bounded (500-row cap, 10k literal cap, Rust sidecar default). DEFER; exit: any edit to `runSimilarityCheckTS`, or an incident implicating app-server event-loop stalls during a fallback run.

## Carried register (unchanged this cycle; preconditions re-checked)
AGG5-7 (Rust cosmetics — no behavioral Rust edit planned), AGG5-8 (similarity-history policy — owner), AGG3-7 (deploy retry log), DES3-1, TA3-1-followup(+DES4-4), JA-clarity, ST5-5, C3-AGG-5 (deploy SSH extraction trigger — TRIPPED, binds any cycle touching SSH plumbing), IN2-2, DEFER-ENV-GATES, and the cycle-1 origin-register tail — all carried with severities preserved at origin.

## Cross-agent agreement summary
12 lenses: AGG6-1. 8 lenses: AGG6-2. 6 lenses: AGG6-8/AGG6-9. 5 lenses: AGG6-4. 4 lenses: AGG6-3/AGG6-6/AGG6-7. 3 lenses: AGG6-5.
