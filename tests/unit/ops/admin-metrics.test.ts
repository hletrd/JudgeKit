import { describe, expect, it } from "vitest";

import { formatAdminMetrics } from "@/lib/ops/admin-metrics";

describe("formatAdminMetrics", () => {
  it("renders Prometheus-style metrics for the admin health snapshot", () => {
    const output = formatAdminMetrics({
      checks: {
        database: "ok",
        auditEvents: "degraded",
      },
      judgeWorkers: {
        online: 3,
        stale: 1,
        offline: 2,
      },
      submissionQueue: {
        pending: 17,
        limit: 250,
      },
      uptimeSeconds: 3600,
      responseTimeMs: 12,
      appVersion: "test",
      status: "degraded",
      timestamp: "2026-04-17T00:00:00.000Z",
      details: {
        auditEvents: {
          failedWrites: 4,
          lastFailureAt: "2026-04-17T00:00:00.000Z",
        },
      },
    });

    expect(output).toContain("judgekit_health_status 0");
    expect(output).toContain('judgekit_health_check{check="database"} 1');
    expect(output).toContain('judgekit_health_check{check="audit_events"} 0');
    expect(output).toContain('judgekit_judge_workers{status="online"} 3');
    expect(output).toContain("judgekit_submission_queue_pending 17");
    expect(output).toContain("judgekit_uptime_seconds 3600");
    expect(output).toContain("judgekit_health_response_time_ms 12");
    expect(output).toContain("judgekit_audit_failed_writes 4");
  });
});
