# Privacy and retention policy (current platform baseline)

_Last updated: 2026-04-12_

This document defines the current default handling expectations for sensitive operational data in JudgeKit.

## Audience
- students and candidates who want to know what may be stored and reviewed
- instructors/admins who need handling rules
- operators preparing recruiting, exam, or contest rollouts

## Data classes and retention windows

| Data class | Default retention window | Intended access |
| --- | --- | --- |
| Audit logs | 90 days | authorized operators/admins investigating platform actions |
| AI chat logs | 30 days | authorized staff with `system.chat_logs`, only for support, misuse review, or governance |
| Anti-cheat events | 180 days | authorized instructors/admins reviewing assessment integrity telemetry |
| Recruiting invitation records | 365 days | authorized recruiting/instructor/admin staff for assessment operations and dispute review |
| Submissions and grading records | 365 days | instructors/admins and the submitting user, subject to normal platform permissions |

## Important interpretation notes
- Anti-cheat signals are **review aids**, not proof of misconduct by themselves.
- Recruiting and exam records may be reviewed by authorized staff for support, dispute handling, and assessment governance.
- AI chat transcripts should be treated as potentially sensitive academic or candidate-support data.

## Current automation baseline
- audit-log pruning is automated in the app runtime
- AI chat-log pruning is automated in the app runtime
- anti-cheat event pruning is automated in the app runtime
- recruiting invitation records older than 365 days are pruned automatically once they are terminal (redeemed/revoked) or long-expired pending invites
- terminal submissions and grading records older than 365 days are pruned automatically; in-progress queue items are excluded from automatic deletion
- if a deployment needs longer archival retention before deletion, add a dedicated export/archive workflow before changing the automated window

## Operator rules
1. Grant chat-log access only to staff who actually need it.
2. Do not use anti-cheat telemetry as standalone proof.
3. For recruiting use, disclose that submissions, timing/progress metadata, and integrity telemetry may be reviewed.
4. Re-check this policy before any exam or public contest launch.
