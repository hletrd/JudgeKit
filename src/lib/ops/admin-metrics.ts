import type { AdminHealthSnapshot } from "@/lib/ops/admin-health";

function metricLine(name: string, value: number, labels?: Record<string, string>) {
  if (!labels || Object.keys(labels).length === 0) {
    return `${name} ${value}`;
  }

  const renderedLabels = Object.entries(labels)
    .map(([key, labelValue]) => `${key}="${labelValue.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
    .join(",");

  return `${name}{${renderedLabels}} ${value}`;
}

export function formatAdminMetrics(snapshot: AdminHealthSnapshot) {
  const lines = [
    "# HELP judgekit_health_status Overall JudgeKit health status (1=ok, 0=degraded/error).",
    "# TYPE judgekit_health_status gauge",
    metricLine("judgekit_health_status", snapshot.status === "ok" ? 1 : 0),
    "# HELP judgekit_health_check Individual health check states (1=healthy, 0=unhealthy).",
    "# TYPE judgekit_health_check gauge",
    metricLine("judgekit_health_check", snapshot.checks.database === "ok" ? 1 : 0, { check: "database" }),
    metricLine("judgekit_health_check", snapshot.checks.auditEvents === "ok" ? 1 : 0, { check: "audit_events" }),
    "# HELP judgekit_judge_workers Judge worker counts by status.",
    "# TYPE judgekit_judge_workers gauge",
    metricLine("judgekit_judge_workers", snapshot.judgeWorkers.online, { status: "online" }),
    metricLine("judgekit_judge_workers", snapshot.judgeWorkers.stale, { status: "stale" }),
    metricLine("judgekit_judge_workers", snapshot.judgeWorkers.offline, { status: "offline" }),
    "# HELP judgekit_submission_queue_pending Submission queue depth.",
    "# TYPE judgekit_submission_queue_pending gauge",
    metricLine("judgekit_submission_queue_pending", snapshot.submissionQueue.pending),
    "# HELP judgekit_submission_queue_limit Configured submission queue limit.",
    "# TYPE judgekit_submission_queue_limit gauge",
    metricLine("judgekit_submission_queue_limit", snapshot.submissionQueue.limit),
    "# HELP judgekit_uptime_seconds Process uptime in seconds.",
    "# TYPE judgekit_uptime_seconds gauge",
    metricLine("judgekit_uptime_seconds", snapshot.uptimeSeconds),
    "# HELP judgekit_health_response_time_ms Health snapshot probe latency in milliseconds.",
    "# TYPE judgekit_health_response_time_ms gauge",
    metricLine("judgekit_health_response_time_ms", snapshot.responseTimeMs),
    "# HELP judgekit_audit_failed_writes Total failed audit-event writes tracked by the app.",
    "# TYPE judgekit_audit_failed_writes gauge",
    metricLine("judgekit_audit_failed_writes", snapshot.details?.auditEvents.failedWrites ?? 0),
  ];

  return `${lines.join("\n")}\n`;
}
