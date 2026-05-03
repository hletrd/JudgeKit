# Security Policy

## Reporting a vulnerability

Email **security@xylolabs.com** with:

- A short description of the issue
- Steps to reproduce (or a minimal proof of concept)
- Affected version, build, or production hostname
- Impact assessment in your own words

Please do **not** open a public GitHub issue for security reports.

## Scope

In scope:

- The Next.js application (`src/`)
- The Rust judge worker (`judge-worker-rs/`)
- The code-similarity and rate-limiter sidecars (`code-similarity-rs/`, `rate-limiter-rs/`)
- The deployed instances at `algo.xylolabs.com` (and any other JudgeKit instance the operator publishes)
- Docker images, deploy script, runbook content under `docs/`

Out of scope:

- Findings that require pre-existing privileged access (e.g., a compromised admin token, host-level filesystem access)
- DoS that requires unrealistic traffic
- Reports without a technical reproduction
- Issues in third-party dependencies that have not been integrated yet

## Response targets

- Acknowledgement: within 3 business days
- Triage and severity assignment: within 5 business days
- Fix or mitigation timeline: communicated after triage; depends on severity

## What we ask

- Give us a reasonable window to fix before public disclosure (90 days is the default; we will coordinate earlier disclosure for already-public issues)
- Do not access data that is not yours during testing
- Do not run destructive tests (no DROP, no force-push, no deletion of others' submissions)
- Avoid testing against active live exams or recruiting events

## What we offer

- Public credit (or anonymous, if preferred)
- Coordinated disclosure once a fix ships
- For substantial reports against the production instance, we will follow up with the operator's specific recognition policy at the time of triage

## Sensitive on-disk artefacts

### Pre-restore database snapshots

Before a destructive `importDatabase()` (admin-driven restore from an
uploaded export), JudgeKit takes a server-side **pre-restore snapshot**
of the live DB so the operator has an emergency rollback artifact.

- **Path:** `${DATA_DIR:-./data}/pre-restore-snapshots/`
- **Filename:** `pre-restore-{ISO-stamp}-{actorId-prefix}.json`
- **Mode:** directory `0o700` (best-effort `chmod`, falls back gracefully on shared volumes), file `0o600`
- **Retention:** the most recent 5 snapshots are kept on disk; older ones are pruned automatically after each new snapshot
- **Contents:** **full-fidelity** export with `sanitize: false` — includes
  password hashes, encrypted column ciphertexts, JWT secrets in their
  stored form, and any other sensitive fields. **This is intentionally
  not portable** — it is the operator's own emergency rollback artifact,
  not a backup format suitable for offsite archival.

Operators are expected to keep the data directory off shared volumes
when feasible. The snapshot file is **not** included in the standard
backup workflow because of its sensitive content; treat it like a
production database dump.

The implementation lives at `src/lib/db/pre-restore-snapshot.ts`.

## Hardening references

The most recent multi-perspective security review lives in `.context/reviews/`. The platform's documented integrity model is in `docs/exam-integrity-model.md`. Read those before assuming a behavior is a bug — some "weaknesses" are documented architectural choices.
