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

## Hardening references

The most recent multi-perspective security review lives in `.context/reviews/`. The platform's documented integrity model is in `docs/exam-integrity-model.md`. Read those before assuming a behavior is a bug — some "weaknesses" are documented architectural choices.
