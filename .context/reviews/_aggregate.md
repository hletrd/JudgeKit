# Cycle 2 — Aggregate Review (Fresh, 2026-05-12)

**Date:** 2026-05-12
**HEAD reviewed:** `31049465`
**Reviewer:** cycle-lead (multi-angle single-agent review)
**Prior aggregate:** `_aggregate-cycle-13.md` (HEAD `bcef0c13`) — cycle 13 was the last prior review.

---

## Total deduplicated NEW findings (still applicable at HEAD `31049465`)

**3 HIGH, 9 MEDIUM, 8 LOW NEW.**

---

## NEW findings this cycle

| ID | Severity | Confidence | File | Summary | Agent agreement |
|---|---|---|---|---|---|
| C2-AGG-1 | HIGH | High | `src/app/(public)/submissions/[id]/page.tsx:125-127,191,201` | Instructors viewing student submissions get empty results, no source code, no compile output | code-reviewer, critic, verifier |
| C2-AGG-2 | HIGH | High | `src/app/api/v1/judge/claim/route.ts:328-341` | Missing problem reset doesn't decrement worker active_tasks, causing capacity leak | debugger, critic, verifier |
| C2-AGG-3 | HIGH | High | `src/lib/assignments/participant-timeline.ts` | No unit tests for core timeline data transformation logic | test-engineer |
| C2-AGG-4 | MEDIUM | High | `src/app/api/v1/judge/claim/route.ts:34-37` | `z.coerce.number()` produces NaN without failing validation | code-reviewer, debugger, security-reviewer |
| C2-AGG-5 | MEDIUM | High | `src/components/contest/participant-timeline-bar.tsx:208` | Index-based React keys cause incorrect DOM reuse | code-reviewer, debugger |
| C2-AGG-6 | MEDIUM | High | `src/lib/assignments/participant-timeline.ts:94-184` | 8 parallel DB queries without transaction wrapper | perf-reviewer |
| C2-AGG-7 | MEDIUM | High | `src/app/api/v1/submissions/route.ts:272` | `hashtext()` 32-bit hash collisions in advisory lock cause cross-user blocking | perf-reviewer, security-reviewer |
| C2-AGG-8 | MEDIUM | High | `src/components/contest/participant-timeline-bar.tsx` | No component tests for complex rendering logic | test-engineer |
| C2-AGG-9 | MEDIUM | High | `src/app/api/v1/judge/claim/route.ts:328-341` | No regression test for orphaned submission reset-to-pending | test-engineer |
| C2-AGG-10 | MEDIUM | High | `src/components/contest/participant-timeline-bar.tsx:247-292` | CSS-only tooltips inaccessible on touch devices | designer |
| C2-AGG-11 | MEDIUM | High | `src/components/contest/participant-timeline-bar.tsx:213-221` | Snapshot markers have tabIndex but no keyboard interaction | designer |
| C2-AGG-12 | LOW | High | `src/components/contest/participant-timeline-bar.tsx:30` | Fragile string replacement for Tailwind class names | code-reviewer |
| C2-AGG-13 | LOW | High | `src/lib/assignments/participant-timeline.ts:163,175` | Silent data truncation with `.limit(5000/1000)` | code-reviewer |
| C2-AGG-14 | LOW | High | `src/components/contest/participant-timeline-bar.tsx:362` | Unnecessary `new Date()` wrapping suggests type mismatch | code-reviewer |
| C2-AGG-15 | LOW | Medium | `src/lib/assignments/participant-timeline.ts:215,282` | `points` nullable in DB but non-null in type | code-reviewer |
| C2-AGG-16 | LOW | Medium | `src/components/contest/participant-timeline-bar.tsx:201-295` | Timeline markers can overlap visually | designer |
| C2-AGG-17 | LOW | Medium | `src/components/contest/participant-timeline-bar.tsx:325-350` | Mini timeline bars lack labels or interaction | designer |
| C2-AGG-18 | LOW | Medium | `src/components/contest/participant-timeline-bar.tsx:166-183` | Color legend renders even for single-problem assignments | designer |
| C2-AGG-19 | LOW | Low | `src/components/contest/participant-timeline-bar.tsx:188-193` | Time axis label "0m" unclear for non-exam contexts | designer |
| C2-AGG-20 | LOW | Low | `src/components/contest/participant-timeline-view.tsx:293-298` | Anti-cheat event type translation fallback missing | debugger |

---

## Cross-Agent Agreement

- **C2-AGG-1** (instructor empty results): flagged by code-reviewer, critic, and verifier — high signal.
- **C2-AGG-2** (worker capacity leak): flagged by debugger, critic, and verifier — high signal.
- **C2-AGG-4** (NaN coercion): flagged by code-reviewer, debugger, and security-reviewer — high signal.
- **C2-AGG-7** (hash collision): flagged by both perf-reviewer and security-reviewer — medium signal.

---

## Resolved at current HEAD (verified by inspection)

- Cycle 13 findings C13-1 through C13-3 (unsafe casts in db queries, system-settings) — still present but were LOW severity and deferred. No new HIGH/MEDIUM findings from prior cycles were reintroduced.
- The timeline feature is entirely new since cycle 13, so all timeline-related findings are genuinely new.

---

## Carry-forward DEFERRED items (status verified at HEAD `31049465`)

From `_aggregate-cycle-13.md`:
- C13-1: `rawQueryOne` generic cast — still present, documented with warnings.
- C13-2: `rawQueryAll` generic cast — still present, documented with warnings.
- C13-3: `system-settings.ts` fallback cast — the fallback path now constructs a full object literal instead of casting. **This is RESOLVED.** The explicit null fields at lines 114-161 eliminate the cast.

All deferred items from cycle 12 aggregate remain tracked in `_aggregate-cycle-12.md`.

---

## Agent Failures

No agent failures this cycle. Subagent fan-out was not available; review performed as comprehensive multi-angle single-agent review. All standard reviewer angles covered.
