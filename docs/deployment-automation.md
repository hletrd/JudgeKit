# Deployment Automation & Reproducibility

This document records the current production-standard deployment baseline for JudgeKit and the automated verification path that supports it.

## Current production-standard workflow

JudgeKit production deploys currently run from a trusted workstation or operator-managed environment with an explicit target profile:

```bash
DEPLOY_TARGET=auraedu ./deploy-docker.sh
```

Current target-specific SSH keys in the local deploy environment:

| Target | Domain | SSH key |
|--------|--------|---------|
| `oj` / AuraEdu | `oj.auraedu.me` | `~/.ssh/xylolabs-algo.pem` |

> `worv` (`test.worv.ai`) was retired from the roster on 2026-07-06 and
> `algo` (`algo.xylolabs.com`) was retired on 2026-07-23; both are rejected
> by `deploy-docker.sh`.

That path is the canonical baseline because it:

- builds images on the target host
- runs the PostgreSQL volume safety check before touching containers
- captures a pre-deploy `pg_dump`
- applies the Docker-based production architecture described in `docs/deployment.md`
- prunes stopped containers, dangling images, BuildKit cache, and BuildKit
  history metadata on every host it touched (app + each `WORKER_HOSTS` entry)
  at the end of the deploy. Automated cleanup never prunes Docker volumes.
  Opt out with `SKIP_POST_DEPLOY_PRUNE=1`. See `docs/deployment.md` §
  "Automatic post-deploy cleanup".

## Automated verification path

The reproducible verification baseline lives in GitHub Actions CI:

- `.github/workflows/ci.yml`
- TypeScript gate: `npx tsc --noEmit`
- unit coverage gate: `npm run test:unit:coverage`
- component tests: `npm run test:component`
- integration tests: `npm run test:integration`
- dependency scans: `npm audit --audit-level=high` and `cargo audit`

This is the automation path that should stay green before a workstation-triggered production deploy.

## CD status

GitHub Actions CD is intentionally **disabled** today.

`.github/workflows/cd.yml` is `workflow_dispatch` only and exits with guidance instead of performing a deploy. This is deliberate until any GitHub-initiated deploy can prove that it:

1. runs `scripts/pg-volume-safety-check.sh` on the target first
2. fails closed if the safety check does not pass
3. invokes `deploy-docker.sh` instead of the removed host-specific systemd path

## Reproducibility expectations

Until stronger infrastructure automation lands, treat the following as required reproducibility controls:

- deployment hosts are configured to match `docs/deployment.md`
- `.env.example` and `.env.production.example` stay aligned with the runtime contract
- release operators use the same `deploy-docker.sh` path instead of ad-hoc shell sequences
- post-deploy verification follows `docs/release-readiness-checklist.md` and `docs/monitoring.md`

## Known gap

JudgeKit does **not** yet ship a full infrastructure-as-code stack for host provisioning. The current guarantee is narrower:

- one documented production deployment baseline
- one automated verification baseline
- one intentionally disabled CD path that documents the conditions required before re-enabling GitHub-initiated deploys

When that changes, update this document together with:

- `.github/workflows/cd.yml`
- `docs/deployment.md`
- `docs/release-readiness-checklist.md`
- any new provisioning/IaC entrypoints
