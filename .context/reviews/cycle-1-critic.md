# RPF Loop Cycle 1 — Critic Review (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** critic

## Summary
Multi-perspective critique of the overall change surface. Strong overall trajectory; concerns are concentrated in (a) test maintenance debt, (b) recruit results scoring math, and (c) reviewer/test drift.

## NEW findings

### CRIT-1: [HIGH] Test gate is broken at HEAD — 28 failing tests silently merged

- **Multiple files**
- **Description:** The current cycle's HEAD `37a4a8c3` ships with 28 failing unit tests across 22 files. Some failures are intentional (e.g., the "falls back to shared token" test that contradicts a security hardening commit), but many are silent regressions caused by source refactors that didn't update accompanying tests in the same commit. The fact that `npm run test:unit` was apparently never run on a few of these recent commits is a process-level issue.
- **Confidence:** HIGH
- **Fix (process):** All commits that touch source under `src/` should run `npm run test:unit` locally before push. Consider adding a pre-push git hook (with `npm run test:unit` and `npm run lint`).
- **Fix (immediate):** Cycle 1 PROMPT 3 must triage and fix all 28.

### CRIT-2: [MEDIUM] Recruit results page is the recruiting-flow's final candidate-facing screen and has a math bug

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx`
- **See:** code-reviewer CR-1.
- **Description:** The displayed total score is mathematically incoherent (mixing percentage 0-100 with weighted points). For a recruiting feature that's literally about producing a deliverable for a hiring manager, an obviously-wrong total undermines product trust at the worst possible moment.
- **Confidence:** HIGH
- **Fix:** Apply CR-1's proposed fix in this cycle.

### CRIT-3: [MEDIUM] Source-grep "implementation" tests are brittle, and recent refactors triggered a wave of failures

- **Files:** 12 `*-implementation.test.ts` files (see test-engineer TE-11)
- **Description:** Source-grep tests are valuable for guarding against regressions in invariants like "this surface contains the i18n key X" or "this page redirects recruiting candidates". But their pattern-matching is too fragile — a refactor to the same effect breaks them. The right answer isn't to delete them; it's to make them test the BEHAVIOR they're guarding (via render-tree assertions or i18n-key existence checks) rather than the literal source bytes.
- **Confidence:** MEDIUM
- **Fix:** This cycle: update each broken pattern. Future cycle: gradually convert implementation guards to behavior tests.

### CRIT-4: [LOW] Korean letter-spacing rule is enforced inline (e.g., header tracking-wide branch); easy to forget

- **File:** `src/components/layout/public-header.tsx:301`
- **Description:** The repo rule "do NOT apply tracking-* to Korean text" is enforced via a per-line `${locale !== "ko" ? " tracking-wide" : ""}` check. This pattern is duplicated in multiple files. A future contributor may apply `tracking-wide` to a new component without the conditional. There's no automated check.
- **Confidence:** MEDIUM
- **Fix:** Add an ESLint custom rule (or a `lint:i18n` script) that grep-warns on `tracking-` Tailwind utilities in JSX/TSX files unless preceded by a `locale !==`-style guard. Or extract a utility component `<TextWithTracking>` that handles the conditional.

### CRIT-5: [LOW] AGENTS.md is 38KB — onboarding cost is high

- **File:** `AGENTS.md`
- **Description:** The AI documentation has grown organically and is now ~38KB. New contributors and review agents must page through it to find rules. There's no TOC or index.
- **Confidence:** LOW
- **Fix:** Add a TOC at the top with anchor links to each major section. Future cycle: split into `AGENTS.md` (overview + index) + `docs/agents/{topic}.md`.

## Final-sweep checklist

- [x] Cross-checked findings with each reviewer's lane.
- [x] No new architecture-level concerns beyond test-gate breakage.
