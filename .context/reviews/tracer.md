# Tracer (causal flows, competing hypotheses) — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c. Method: pick the suspicious flows in the fresh
delta, form competing hypotheses, trace to ground truth in code.

## Trace 1 — "Can the new prev_worker_release corrupt a healthy counter?"
**H-A:** release fires on fresh pending claims → spurious decrements.
**H-B:** release + bump can target the same row → undefined CTE behavior.
**H-C:** the guarded same-worker case leaks instead.
Trace: `claim-query.ts:86-93` — release requires `previous_worker_id IS NOT
NULL` (fresh pending rows have NULL `judge_worker_id` → H-A REJECTED) and
`previous_worker_id <> @workerId` (same-row double-update impossible → H-B
REJECTED — and this guard is *required*: Postgres does not support updating
one row in two modifying CTEs of one statement). H-C CONFIRMED: the guard
means a self-reclaim bumps without releasing; `poll/route.ts:172` decrements
once → permanent +1 on a live worker (sweep only resets silent workers).
→ Finding (shared with code-reviewer CR1, MEDIUM): fold the self-case
compensation into `worker_bump`'s SET expression.

## Trace 2 — "Does the admin AI-override leak into exam contexts?"
**H-A:** `allowAiAssistantInRestrictedModes` bypasses per-assignment exam
restrictions (cheating door).
**H-B:** it only relaxes the PLATFORM-mode blanket restriction; assignment-
level gates still apply.
Trace: `platform-mode-context.ts:286-297` — the override suppresses only
`getPlatformModePolicy(effectiveMode).restrictAiByDefault`;
`getEffectivePlatformMode(options)` still derives exam/contest mode from the
assignment context, and `isAiAssistantEnabledForContext` is evaluated per
context. The override is global and admin-only (PUT /admin/settings is
admin-gated + durable-audited). So enabling it DOES allow AI inside
exam-mode contexts platform-wide — that is the documented intent of the knob
("admin opts out"), default false, audited. H-A is true *by design*, not a
defect; flagged to the instructor/admin personas so the consequence is
understood: this is a single global switch, not per-assignment.
→ No code defect. UX/policy note: a per-assignment override would be safer
granularity (recorded as product note, LOW).

## Trace 3 — "Why did /problems pages need a CSP matcher patch — is the class closed?"
Trace: `next.config.ts:156-170` static fallback (`script-src 'self'`) applies
whenever middleware doesn't run; `proxy.ts:392-427` matcher enumerates page
prefixes. Diffing the matcher against `src/app/**` page routes: every existing
page route is now covered EXCEPT unmatched-path 404s (root `not-found.tsx`)
and `/og` (image responses — no scripts, harmless). The class is NOT
structurally closed: any future top-level route re-opens it (this is already
the 2nd extension of the list). → Finding S2 (LOW, shared with security).

## Trace 4 — "Could draft hydration overwrite freshly-typed exam code?"
Trace: localStorage hydration is synchronous on first render
(`use-source-draft.ts`), server GET resolves later; restore guarded by
`isTemplateLike(sourceRef.current)` reading the CURRENT ref (not the captured
prop) → typing during the GET round-trip flips the guard. Race window: only
if the editor is still exactly template-equal when the response lands —
in which case restoring the user's own server draft is the desired behavior.
→ No defect. Confirmed the SAFETY INVARIANTS comment is accurate.

## Trace 5 — "Is the IOI flag correct for rejudge / practice / NULL assignment?"
Trace: `claim/route.ts:328-336` — flag computed only when
`claimed.assignmentId` non-null; practice submissions → false (fail-fast
preserved); rejudge re-enqueues the same submission row (assignment_id
preserved) → flag recomputed per claim → correct after scoringModel edits
(and the PATCH route now invalidates the ranking cache, 43b7cda0).
→ No defect.

## Final sweep
Also traced: exam-session GET authz change end-to-end (participant self-read
unchanged; staff override via canViewAssignmentSubmissions — consistent with
the participant-timeline route), and users/[id] DELETE scrub-vs-cascade
ordering inside one transaction (scrub first — correct). No further findings.
