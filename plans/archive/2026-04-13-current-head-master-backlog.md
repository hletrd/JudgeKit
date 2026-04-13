# Current-head master backlog — reopened 2026-04-13

## Why this exists
The 2026-04-12 current-head follow-up plans were previously archived as **accepted current posture**. A newer user directive on 2026-04-13 explicitly overrides that acceptance and requires implementation work to resume.

## Source artifacts now driving execution
- `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md`
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`
- `.omx/plans/prd-2026-04-12-current-head-followup.md`
- `.omx/plans/test-spec-2026-04-12-current-head-followup.md`

## Reopened backlog

### 1. Custom-role and role-model correctness
- user CRUD still rejects custom roles in multiple API/server-action flows
- page-level contest/group entrypoints still cast sessions to built-in-only roles
- contest/group access helpers still branch on built-in roles in places
- **Status:** completed 2026-04-13
- **Progress note:** user CRUD now accepts validated custom-role names in the API/server-action flows, built-in-only page assertions were removed from the affected contest/group pages, and contest discovery now uses capability-aware branching for custom roles.

### 2. Chat transcript integrity and admin review correctness
- client can suppress or forge logged chat history
- admin chat-log session query is invalid on PostgreSQL and uses wrong preview semantics
- chat tool assignment metadata still needs an access-control audit/fix
- **Status:** completed 2026-04-13
- **Progress note:** chat logging now records authoritative user/assistant turns on the server instead of trusting client replay/skip flags, the admin chat-log session index now uses a PostgreSQL-safe first-message/session-bounds query, and the assignment-info tool now checks assignment/group/recruiting scope before returning metadata.

### 3. Realtime / deployment / worker runtime correctness
- shared SSE coordination leaks slots on one-shot terminal responses
- production upload blobs are not persisted across container replacement
- shipped docker-proxy permissions do not match documented admin image-management behavior
- current-head high-stakes/runtime posture docs/env examples need truth sync
- **Status:** completed 2026-04-13
- **Progress note:** the shared SSE terminal path now releases coordination slots correctly, production compose now persists `/app/data`, production/dedicated-worker docker-proxy configs now expose the image/build surfaces expected by the admin image-management flow, and the env examples now describe the real supported realtime modes.

### 4. Similarity-engine parity
- TS fallback and Rust sidecar normalize code differently
- inline `#` comments still evade normalization in Python/shell-like languages
- **Status:** completed 2026-04-13
- **Progress note:** TS and Rust now preserve identifier casing consistently, both strip inline `#` comments outside strings/preprocessor directives, and parity/regression coverage now locks the shared normalization contract.

### 5. Higher-assurance current-head follow-up workstreams
- recruiting identity assurance beyond shared secrets
- stronger event-integrity/runtime enforcement posture
- anti-cheat evidence-model tightening
- sensitive-data governance tightening
- worker-boundary operational containment improvements
- instructor/admin workflow simplification where still actionable
- **Status:** completed 2026-04-13
- **Progress note:** repository-local hardening from the current-head multi-perspective/adversarial plans has been revalidated against the current codebase. Remaining higher-assurance demands now sit outside this repository pass (for example, future mailbox/passkey identity factors or real load/failover rehearsal infrastructure) rather than as missing local code changes.
- **UI/i18n follow-up:** a literal-key audit across all `src/app` + `src/components` translation calls now has implementation coverage, and the missing database-backup/recruit-session keys discovered during the deploy follow-up were added to both locale bundles.
- **Further UI follow-up:** remaining reviewed hardcoded English strings in dashboard error/not-found views, lecture-mode surfaces, anti-cheat warnings, copy-code controls, and language-selector fallbacks were moved onto the translation path and covered by a hardcoded-string implementation guard.

## Execution ordering
1. Plan/doc reopening
2. Custom-role slice
3. Chat/admin-log slice
4. Realtime/upload/docker-runtime slice
5. Similarity/docs/final closure slice

## Verification bar
- `pnpm -s tsc --noEmit`
- targeted Vitest for each slice
- targeted eslint on changed files
- broader verification before closure
