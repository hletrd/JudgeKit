# Data Retention Policy

_Last updated: 2026-04-14_

Governance reference for operators deploying JudgeKit. All implementation lives in `src/lib/data-retention.ts` and `src/lib/data-retention-maintenance.ts`.

---

## Default retention windows

| Data class | Default | Environment variable override |
|---|---|---|
| Audit events | 90 days | `AUDIT_EVENT_RETENTION_DAYS` |
| AI chat messages | 30 days | `CHAT_MESSAGE_RETENTION_DAYS` |
| Anti-cheat events | 180 days | `ANTI_CHEAT_RETENTION_DAYS` |
| Recruiting invitation records | 365 days | `RECRUITING_RECORD_RETENTION_DAYS` |
| Submissions and grading records | 365 days | `SUBMISSION_RETENTION_DAYS` |

All overrides must be positive integers. Invalid or zero values are silently ignored and the default is used.

Automatic pruning runs once every 24 hours at runtime startup. In-progress submissions (`pending`, `queued`, `judging`) are excluded from automatic deletion regardless of age.

---

## Legal hold

Set `DATA_RETENTION_LEGAL_HOLD=true` (or `=1`) to suspend all automatic pruning across every data class.

When the hold is active, the runtime logs:

```
Data retention legal hold is active — skipping all automatic pruning
```

No data is deleted until the variable is removed and the application is restarted. Activate before any litigation, regulatory investigation, or audit that requires data preservation.

---

## Export modes

The export endpoint (`POST /api/v1/admin/migrate/export`) supports two modes:

**Sanitized** (default) — passwords, tokens, and keys are redacted. Use for data sharing, migration testing, or handing off a snapshot to a third party. This is the default when `?full` is omitted. Sanitized exports are intentionally **not** accepted by the disaster-recovery restore route.

**Full-fidelity** (`?full=true`) — all fields included. Use only for disaster-recovery backups. Treat the output as a secret; store with encryption and access controls equivalent to the live database.

The backup route (`POST /api/v1/admin/backup`) always produces a full-fidelity copy. ZIP backups embed a checksum manifest so the restore route can reject tampered archives before import. Every export is recorded in the audit log with an entry noting whether the export was sanitized or full-fidelity.

---

## Operator responsibilities

1. Review all retention windows before deployment. Confirm they satisfy your legal, academic, or contractual obligations.
2. Activate `DATA_RETENTION_LEGAL_HOLD=true` immediately when a hold is required. Lift it only after receiving written clearance.
3. Use sanitized exports for any sharing outside the production environment.
4. Store full-fidelity backups with the same access controls as the live database.
5. Re-verify this policy before launching public contests, exams, or recruiting campaigns.
