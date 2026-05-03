import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getAdminHealthSnapshot } from "@/lib/ops/admin-health";
import { formatAdminMetrics } from "@/lib/ops/admin-metrics";
import { safeTokenCompare } from "@/lib/security/timing";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function isCronAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return { ok: false as const, missingSecret: true };
  }

  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${cronSecret}`;
  const ok = authHeader !== null && safeTokenCompare(authHeader, expected);

  return { ok, missingSecret: false as const };
}

export async function GET(request: NextRequest) {
  const user = await getApiUser(request).catch(() => null);
  const canViewAdminMetrics = user
    ? (await resolveCapabilities(user.role)).has("system.settings")
    : false;

  if (!canViewAdminMetrics) {
    const cronAuth = isCronAuthorized(request);
    if (!cronAuth.ok) {
      if (cronAuth.missingSecret) {
        // Don't leak the env-var name to anonymous callers; treat as unauthorized.
        // Operators see the misconfiguration via the warn log + the
        // instrumentation startup gate, not via the public response body.
        logger.warn(
          "[metrics] CRON_SECRET is not configured; cron-authenticated callers cannot reach this endpoint",
        );
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const snapshot = await getAdminHealthSnapshot();

  return new NextResponse(formatAdminMetrics(snapshot), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
    status: snapshot.status === "error" ? 503 : 200,
  });
}
