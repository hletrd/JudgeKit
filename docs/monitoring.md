# Monitoring and alerting

_Last updated: 2026-04-18_

This guide describes the monitoring surfaces JudgeKit currently ships and the minimum alerting posture operators should wire around them.

## Built-in health surfaces

### `GET /api/health`
- public callers receive a coarse `{ status }`
- callers with the `system.settings` capability receive database, audit-pipeline, queue, worker, uptime, and probe-latency detail
- shared source of truth: `src/lib/ops/admin-health.ts`

### `GET /api/metrics`
- Prometheus-style plaintext metrics
- accessible to:
  - authenticated sessions whose role resolves to `system.settings`, or
  - `Authorization: Bearer $CRON_SECRET`
- exposes gauges for:
  - overall health
  - database / audit checks
  - judge worker counts by status
  - submission queue depth and queue limit
  - uptime and health probe latency
  - failed audit-event writes

### `scripts/monitor-health.sh`
- PostgreSQL-first shell monitor
- checks:
  - disk usage
  - PostgreSQL readiness
  - stale worker count
  - submission queue depth
- intended for cron/systemd environments that need a simple alertable script even before full metrics shipping is in place

## Minimum recommended alerts

At a minimum, alert when any of the following becomes true:
- `/api/health` reports `status=error`
- any judge worker is stale for more than one heartbeat window
- submission queue depth exceeds the local warning/critical thresholds
- audit-event failed writes become non-zero
- disk usage crosses the configured warning/critical thresholds

## Suggested scrape / polling split

- use `/api/metrics` for continuous metrics collection (Prometheus-style)
- use `scripts/monitor-health.sh` for host-local cron/systemd alerting
- use `/api/health` for dashboarding, smoke checks, and post-deploy verification

## Current limitations

- no bundled Grafana dashboard JSON is shipped yet
- no bundled Prometheus scrape config is shipped yet
- alert delivery is still deployment-specific (cron mailer, systemd hooks, external monitoring stack, etc.)

Operators should treat this as a documented baseline, not a complete managed observability platform.
