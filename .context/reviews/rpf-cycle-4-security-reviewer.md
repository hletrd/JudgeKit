# RPF Cycle 4 (Loop Cycle 4/100) — Security Reviewer

**Date:** 2026-04-23
**Base commit:** d4b7a731
**HEAD commit:** d4b7a731
**Scope:** OWASP top 10, secrets, unsafe patterns, auth/authz angle across the entire repo.

## Production-code delta since last review

Only `src/lib/judge/sync-language-configs.ts` changed.

### Security analysis of the delta

The added short-circuit:

```ts
if (process.env.SKIP_INSTRUMENTATION_SYNC === "1") {
  logger.warn(
    "[sync] SKIP_INSTRUMENTATION_SYNC=1 — skipping language-config startup sync. DO NOT use this in production."
  );
  return;
}
```

- Uses **strict equality with literal `"1"`** — not falsy coercion — preventing accidental opt-out under truthy-coerced values. Matches existing env-flag convention elsewhere in the repo.
- Emits a loud `logger.warn` so production boot logs would surface any misconfiguration.
- The in-code comment explicitly warns "DO NOT use this in production" and points at the plan + designer-runtime review for provenance.
- The flag only *skips* a DB-write operation — it does not bypass authZ, authN, or any security-relevant path. The downstream judge/worker pipeline still reads `languageConfigs` from the DB; if the table is empty because sync was skipped, downstream reads return empty and the judge will refuse to execute — fail-closed behavior.

**Verdict:** the delta introduces no security risk.

## Re-sweep findings (this cycle)

**Zero new findings.**

Systematically re-examined security-sensitive surfaces:

- Auth config (`src/lib/auth/config.ts`) — **not modified this cycle**, as required by `CLAUDE.md` deployment rule. Verified password rehash consolidation from cycle 36 intact.
- CSRF double-submit token validation in `createApiHandler` — intact.
- Rate-limit + audit-event pruning background jobs — intact.
- LIKE-pattern escaping in audit-logs page (`escapeLikePattern` usage) — intact since cycle 36 Lane 3.
- Secret-handling paths (NextAuth callbacks, worker auth token, admin migrate/import) — unchanged.
- Anti-cheat clipboard/text-copy privacy path — intact at 80-char cap (SEC-3, LOW/LOW, deferred).
- Docker client error-sanitization (cycle 32 Task B) — intact.
- `invite-participants.tsx` / `access-code-manager.tsx` — `.catch(() => ({}))` guards on `res.json()` verified in current HEAD.

## Carry-over deferred items (unchanged)

- SEC-2 (cycle 43): Anti-cheat heartbeat dedup `Date.now()` LRU — LOW/LOW, deferred.
- SEC-3: Anti-cheat copies user text content — LOW/LOW, deferred.
- SEC-4: Docker build error leaks paths (defense-in-depth beyond cycle 32) — LOW/LOW, deferred.

## Recommendation

No action this cycle. `src/lib/auth/config.ts` preserved as-is per `CLAUDE.md` deployment rule.
