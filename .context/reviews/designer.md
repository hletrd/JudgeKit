# Designer (UI/UX) — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. No dev server / browser available in this environment
(standing DEFER-ENV-GATES); review is source + structural.

## DES9-1 — paging glitch is user-visible on the snapshot/invite tables (LOW, Medium)
The CR9-1/2/3 non-determinism manifests in the UI as a row that "jumps" between
pages or disappears when an instructor clicks Next/Prev on the code-snapshot
evidence table or the recruiting-invitation table. Beyond correctness, this reads
as a trust defect on an integrity surface — a reviewer who sees a snapshot on
page 1 then cannot find it on a refresh loses confidence in the evidence. The
backend `id`-tiebreak fix resolves the UX symptom; no component change needed.

## Carried a11y register (browser exit criterion not fired)
- **DES3-1** expired→active live-region assertiveness (`exam-deadline-sync.tsx:107`)
  — carry; needs a browser a11y pass.
- The anti-cheat filter-chip a11y (aria-pressed real buttons) fix from cycle-6
  (a1f290cf) remains in place; no regression in the dashboard markup changed by
  cycle-7's paging-fidelity commit (3cf9cb39).

No NEW UI-only defect found in the static pass. Korean text carries no custom
letter-spacing (project rule honored) in the files touched this cycle.
