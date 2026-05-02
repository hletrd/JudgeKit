# High-stakes operations guide

_Last updated: 2026-04-12_

This guide explains the current operational truth for recruiting assessments, exams, and serious contests.

## Current position
- Homework / low-stakes coursework: supported
- Internal recruiting pilot: supported only with current restrictions and privacy safeguards
- Formal exams: not yet launch-ready
- Public or reputationally important contests: not yet launch-ready

## Reasons for continued caution
1. Recruiting identity and candidate privacy need stronger enforcement than a generic classroom flow.
2. Anti-cheat telemetry is useful, but it is not equivalent to proctoring.
3. Realtime contest/exam coordination now supports a PostgreSQL-backed coordination path for SSE connection caps and heartbeat deduplication, but still needs broader scaling/load proof before high-stakes rollout.
4. The judge worker remains a privileged trust boundary and must be operated as such.

## Required operator checks before any high-stakes pilot
- Confirm the intended platform mode and the effective restrictions it activates.
- Confirm candidate/instructor/admin privacy expectations and retention policy are communicated.
- Confirm the deployment matches the documented realtime constraints.
- Confirm the judge-worker tier is monitored as privileged infrastructure.
- Confirm the latest go/no-go and release-readiness docs still match the deployed branch.

## Judge worker trust boundary
The judge worker can start sibling judge containers through the Docker proxy path. Treat it as privileged infrastructure:
- restrict who can deploy or reconfigure it
- monitor it separately from the normal app tier
- keep incident guidance specific to worker compromise or abnormal behavior

## Judge worker fleet (capacity & availability)
A single judge worker is a single point of failure during any timed event. A
worker restart, OOM kill, or container crash leaves submissions queued for the
duration of `STALE_WORKER_SECONDS` (default 300 seconds) before another worker
can reclaim them. For a 100+-participant exam or contest this is a hard outage.

Before any high-stakes event:

- **Deploy at least two workers** on distinct physical hosts. Use
  `docker-compose.worker.yml` plus the deploy script:
  `./scripts/deploy-worker.sh --host=<second-host> --app-url=https://<app>/api/v1 --concurrency=4 --sync-images`
- **Confirm both workers register** in `/dashboard/admin/workers` and are sending
  heartbeats. Both should appear in the `Workers online` count on the homepage.
- **Wire an alert** on `degraded` state from `/api/health` (the route reports
  degraded when `pending > 0 && online === 0`). This requires `CRON_SECRET` to
  be set so Prometheus can scrape `/api/metrics`.
- **Freeze-before-restart procedure**: if a worker must be restarted during the
  event window, first toggle the assignment / contest to a paused state via the
  admin settings, drain the queue, restart the worker, then unpause. The
  application does not yet have an automated drain — restarting a worker mid-event
  without freezing the queue causes a visible 5-minute gap to participants.

Reference: `.context/reviews/2026-05-03/00-overall-verdict.md` C-8,
`.context/reviews/2026-05-03/03-admin.md` RISK-2.

## Anti-cheat truth
Use anti-cheat signals as review aids only. They should support human review, not replace it, and should not be presented as standalone proof of misconduct.

## Recruiting truth
Do not expose shared standings or peer-identifying ranking data to recruiting candidates. Recruiting flows should prioritize identity assurance, privacy, and self-scoped progress only.

## See also
- `docs/exam-integrity-model.md`
- `docs/judge-worker-incident-runbook.md`
- `docs/operator-incident-runbook.md`
- `docs/high-stakes-validation-matrix.md`
