# perspective-security — RPF Cycle 10 (2026-06-13)

**Framing:** Authorized defensive security assessment of the owner's own JudgeKit platform (complements security-reviewer.md).

## Coverage areas (re-checked at this HEAD)
1. **Academic-dishonesty detection coverage** — anti-cheat event recording (tab switches, copy/paste, focus loss), code-similarity (Jaccard n-gram, identifier-normalized, per-(problem,language)), and the code-snapshot evidence timeline. The evidence timeline now paginates deterministically (cycle-9 AGG9-1), so a collusion/answer-sharing finding rests on a complete, non-shuffled evidence set. Similarity is capped (500 subs) with truthful skip reasons. No new gap.
2. **Sandbox isolation** — seccomp deny-list, no-network judge containers, non-root, memory/CPU/pids limits, docker-proxy boundary (worker never touches the socket directly). Unchanged and intact.
3. **Authorization boundaries** — role/group gates via dedicated helpers; recruiting/exam/contest routes individually gated; group-manager-gated roster (3dfc2c75). No new boundary surface added.
4. **Confidentiality of hidden tests / others' submissions** — `accepted-solutions` excludes assignment-tied submissions and honors per-user share flag; export redaction always applies the ALWAYS map. Intact.
5. **Scoreboard/grading integrity** — leaderboard freeze auto-unfreezes; IOI overrides overlay board+live-rank consistently; ICPC tie-breakers deterministic (incl. userId lexicographic final key). Intact.
6. **Judging-pipeline resilience under peak load** — stale-worker reaping on a background sweep (7e198b51), stale-submission reclaim, per-worker secret-token auth. Intact.

## Findings
**No new actionable security findings.** Carried: AGG8-2 (gap-scan order, LOW, bounded non-paged) and P6-1 (similarity pre-loop, LOW/RISK) — exit criteria did not fire; both blocks unedited this cycle. AGG5-8 (similarity rerun resets first-flagged ts, LOW/policy) — owner evidence-retention decision, carry.
