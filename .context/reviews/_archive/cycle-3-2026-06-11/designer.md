# Designer (UI/UX + a11y) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Environment note: no browser is provisioned in this run environment (DES-ENV carry — agent-browser cannot reach the deployed instances' auth flows, and no local dev server with seeded data is available); findings below are from component/source inspection with text-extractable evidence (selectors, classes, ARIA), per the multimodal caveat.

## DES3-1 — Extension announcement UX is well-built; one gap: the EXPIRED state's recovery moment isn't announced as a recovery (LOW, Medium)
`ExamDeadlineSync` (`src/components/exam/exam-deadline-sync.tsx:103-112`) shows `role="status"` "deadline extended" + toast, and `CountdownTimer` un-expires (the red `role="alert"` examTimeExpired text disappears, badge returns to a live countdown). For a student staring at the red "time expired" panel, the transition is visually complete after `router.refresh()` — but the panel swap itself is unannounced for screen-reader users beyond the status note (which IS the right mechanism; aria-live="polite" via role=status). Verdict: acceptable; consider `aria-live="assertive"` for the extension note only when transitioning from expired→active, since that user believed their exam was over. Cosmetic; defer-eligible.

## DES3-2 — Anti-cheat warning toasts continue while events are silently rejected (LOW, ties to CR3-1)
`anti-cheat-monitor.tsx:215-218`: on tab switch the student sees `toast.warning(warningMessage)` regardless of whether the POST succeeded. During the CR3-1 blackout the student is warned ("this is being recorded") while nothing is recorded — the UX actively misinforms during accommodations. The CR3-1 server fix resolves this without client changes; no separate UI work needed. Recorded so the persona files don't double-count it.

## DES3-3 — `ExamExtendDialog` post-G6 state (verified good)
`exam-extend-dialog.tsx`: numeric inputMode, Enter-submit via form, Cancel button with `common.cancel` in both locales, client-side 1–600 range mirror of the zod bound. Matches score-override-dialog conventions. No further polish needed this cycle.

## DES3-4 — Korean typography policy compliance (verified)
Repo-wide grep: every `tracking-*` use is locale-guarded (`locale !== "ko"`) or scoped to Latin/mono content with an explanatory comment (`public-header.tsx:305-306`, `public-problem-set-detail.tsx:55`, discussion headings, `access-code-manager.tsx:153` access codes); `globals.css:129-136` zeroes letter-spacing for `ko`. No violations at this HEAD.

## DES3-5 — New strings i18n parity (verified)
`examDeadlineExtended` and the cycle-1/2 additions exist in both `messages/en.json` and `messages/ko.json` (commit-level confirmation d693939c adds 1 key to each; en/ko parity test suite green in the unit run).

## Standing items
- The instructor anti-cheat dashboard's new IP-overlap panel renders only when non-empty with benign-explanation framing — good restraint (no scary empty table).
- DES-ENV (no live-browser audit possible from this environment: WCAG contrast spot-checks, focus order on the exam workspace, INP under load) remains carried with the same exit criterion: provisioned browser access or local seeded dev server.
