# Cycle 8 — designer lens (UI/UX, source-level)

**HEAD:** db1a28d0. Web frontend present (Next.js + React). agent-browser not used this cycle (no running dev server provisioned; the finding is logic-layer, not visual).

## UX symptom of N8-C8-LIVERANK
The leaderboard table (`src/components/contest/leaderboard-table.tsx`) renders a "live" rank badge for the current user during freeze (`entry.liveRank != null` → `t("liveRank", { rank })`). When the underlying rank is inflated by the SUM-over-rows bug, the student is shown a *misleading* live position — a direct UX/trust defect during a high-stakes contest/exam window. The fix is in the data layer; no component change required, but the symptom is real and user-facing, which corroborates the MEDIUM severity (not LOW).

## No NEW UI/UX findings
Korean typography rule respected (no letter-spacing changes proposed). a11y/contrast/focus surfaces unchanged this cycle; carried items unchanged.
