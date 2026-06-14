# JudgeKit "Wow" Features — Roadmap

Date: 2026-06-14
Status: roadmap (captures the full set; each item gets its own spec → plan → build)

The user asked for new "wow" features / differentiators. After surveying the
existing product (sandboxed judging across ~80 languages, live playground,
exam/contest mode with deep anti-cheat, recruiting flows, groups/roles,
community, an LLM provider layer with AI auto-review + chat widget, a plugin
system, and a realtime-coordination primitive), we agreed to pursue ALL of the
following, sequenced by reuse/dependency. **Build order chosen: ② first.**

## Phase 1 — Keystones (reusable across recruiting / education / contests)
- **① Code Playback (keystroke "DVR")** — capture editor edit-deltas during any
  submission/exam/interview; store compactly; replay with a scrubber. Serves
  recruiting review, exam integrity (pairs with anti-cheat), and education.
- **② Function / unit-test judging mode** — problems defined as "implement
  `foo()`" with per-language harnesses over the existing sandbox, instead of
  only stdin/stdout. Architectural unlock for recruiting + classroom + interview
  problems. **← first to design + build.**

## Phase 2 — Live & contest experiences (build on realtime + Phase 1)
- **③ Live interview mode** — shared real-time editor + interviewer rubric panel
  (uses realtime-coordination + ① playback).
- **④ ICPC live theatre** — animated leaderboard, final-hour freeze, balloons,
  first-solve highlights, post-contest replay scrubber (shares replay concepts
  with ①).

## Phase 3 — AI & depth
- **⑤ AI problem generator** (judge-validated hidden tests) **+ Socratic tutor**
  (exam-gated progressive hints) — leverage the existing LLM provider layer;
  generator benefits from ②.
- **⑥ Advanced judging** — special judge (checker) / interactive problems /
  stress-testing (shares plumbing with ②).
- **⑦ Engagement** — Codeforces-style rating + seasons, daily challenge,
  streaks, skill-tree mastery map + spaced repetition, shareable profile cards.

## Current architecture notes (for ②)
- `problems.problemType` already exists: `auto` (stdin/stdout auto-judge) or
  `manual` (instructor-graded). A new `function` value fits cleanly.
- `test_cases` = `input` (stdin) + `expected_output` (stdout), compared via
  `problems.comparison_mode` (exact/float).
- `language_configs` holds per-language `compileCommand` / `runCommand` /
  `dockerImage` / `extension` / `timeLimitMultiplier`.
- Rust judge worker (`judge-worker-rs/`) compiles+runs in a sandbox and compares
  stdout. `src/lib/judge/code-templates.ts` already supplies per-language editor
  starter stubs.
- Design insight: function-judging can compile DOWN to the existing pipeline by
  wrapping `harness_prelude + user_code + harness_main`, reusing the sandbox,
  limits, and comparator unchanged.
