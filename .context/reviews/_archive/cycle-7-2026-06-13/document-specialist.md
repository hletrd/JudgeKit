# Document Specialist — RPF Cycle 7 (2026-06-13)

**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (fallback per cycles 1–6).
**Method:** code-vs-doc agreement against authoritative repo sources (the route schemas, the validator code) — not against external/general knowledge.

## DOC7-1 — `docs/api.md` anti-cheat POST eventType enum is wrong (LOW-MEDIUM, High, CONFIRMED)
`docs/api.md:815` lists the POST body eventType as
`tab_switch|copy|paste|blur|contextmenu|ip_change|code_similarity|heartbeat`.
Authoritative source = the route's zod schema = `z.enum(CLIENT_EVENT_TYPES)`
(`src/lib/anti-cheat/client-events.ts:18-25`) = the 6 CLIENT types only.
`ip_change` and `code_similarity` are server-inserted classes that the POST
schema REJECTS (a deliberate anti-forgery control, cycle-4 AGG4-2). The doc
invites integrators to send forbidden values. **Fix:** correct the enum to the
6 client types and add a one-line note that `ip_change`, `code_similarity`,
and `submission_stale_heartbeat` are server-generated and not accepted in the
POST body. (Same finding as V7-2.)

## DOC7-2 — anti-cheat GET listing order undocumented (LOW, Medium, CONFIRMED)
The submissions section gained an explicit order contract in cycle-6; the
anti-cheat GET section (`docs/api.md:824-840`) states no order. After CR7-1
adds the `(createdAt desc, id desc)` tiebreak, document it there so paging
consumers can rely on a total order. (Same as V7-3.)

## Checked, in agreement (no finding)
- `docs/api.md` GET anti-cheat "Instructor or above" matches `canMonitorContest` (which also admits group TAs + scoped `anti_cheat.view_events`) — the doc's "or above" is a reasonable summary; no contradiction.
- The 60 s heartbeat throttle doc matches the route's LRU/shared-coordination dedup.
- Export-CSV docs ("includes anti-cheat event counts and IP addresses") match the export route.
- No stale references to the removed `service_unavailable` similarity vocabulary in docs (cycle-6 G5 removed it; only an explanatory CODE comment remains at code-similarity.ts:373, which is accurate).
- `pending-next-cycle.md` register items #1/#3 marked RESOLVED with evidence — accurate (verified the cited `deploy-docker.sh:657` and the archived migration plan in cycle-6).

## Final sweep
The two doc mismatches (DOC7-1 enum, DOC7-2 order) are the only doc/code
divergences found; both are LOW–LOW-MEDIUM and both pair with code fixes this
cycle.
