# Monitoring and alerting

_Last updated: 2026-05-31_

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

## Prometheus alert rules (starting point)

Copy into your Alertmanager rule files and tune `for:` windows to your heartbeat
cadence. Metric names match the `/api/metrics` exposition above.

```yaml
groups:
  - name: judgekit
    rules:
      # Judging is halted: no live worker is accepting claims.
      - alert: JudgeKitNoOnlineWorkers
        expr: sum(judgekit_judge_workers{status="online"}) == 0
        for: 2m
        labels: { severity: critical }
        annotations:
          summary: "No online judge workers — submissions will queue indefinitely"
      # A worker stopped heartbeating (single-worker death, or a flaky link).
      - alert: JudgeKitWorkerStale
        expr: judgekit_judge_workers{status="stale"} > 0
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "A judge worker has been stale for >5m"
      # Overall health snapshot degraded/error.
      - alert: JudgeKitHealthDegraded
        expr: judgekit_health_status == 0
        for: 5m
        labels: { severity: warning }
      # Backlog building (correlate with NoOnlineWorkers for severity).
      - alert: JudgeKitQueueBacklog
        expr: judgekit_submission_queue_pending > judgekit_submission_queue_limit
        for: 10m
        labels: { severity: warning }
      # Durable-audit pipeline is dropping writes.
      - alert: JudgeKitAuditWriteFailures
        expr: increase(judgekit_audit_failed_writes[15m]) > 0
        labels: { severity: warning }
      # The app (or the scrape) is down entirely.
      - alert: JudgeKitScrapeDown
        expr: up{job="judgekit"} == 0
        for: 2m
        labels: { severity: critical }
```

### Log-based signal (scrape-independent)

The background staleness sweep (`src/lib/judge/worker-staleness-sweep.ts`) emits a
structured log the instant it reaps a worker, so a dead single worker surfaces
immediately rather than waiting on the next metrics scrape:

- `WARN [judge] staleness sweep reaped unresponsive worker(s) to offline`
  (fields: `reaped`, `workerIds`) — a worker missed its claim-timeout and was
  reaped to `offline`. Wire a log alert (Loki/journald/CloudWatch) on this line.
- `INFO [judge] staleness sweep marked silent worker(s) stale`
  (fields: `markedStale`, `workerIds`) — early warning a worker went quiet.

Each transition logs exactly once (the sweep filters on the prior status), so a
persistently-dead worker does not produce repeated log spam.

## Suggested scrape / polling split

- use `/api/metrics` for continuous metrics collection (Prometheus-style)
- use `scripts/monitor-health.sh` for host-local cron/systemd alerting
- use `/api/health` for dashboarding, smoke checks, and post-deploy verification

## Current limitations

- no bundled Grafana dashboard JSON is shipped yet
- no bundled Prometheus scrape config is shipped yet
- alert delivery is still deployment-specific (cron mailer, systemd hooks, external monitoring stack, etc.)

Operators should treat this as a documented baseline, not a complete managed observability platform.
