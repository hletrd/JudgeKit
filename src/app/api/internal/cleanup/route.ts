import { NextRequest, NextResponse } from "next/server";
import { cleanupOldEvents } from "@/lib/db/cleanup";
import { safeTokenCompare } from "@/lib/security/timing";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Gate the deprecated cron endpoint behind an explicit opt-in.
  // In-process pruners (data-retention-maintenance.ts + audit/events.ts)
  // are the canonical cleanup mechanism and run on 24-hour intervals.
  // Set ENABLE_CRON_CLEANUP=true only if you have an external cron job
  // that depends on this endpoint.
  if (process.env.ENABLE_CRON_CLEANUP !== "true" && process.env.ENABLE_CRON_CLEANUP !== "1") {
    return NextResponse.json(
      {
        error: "endpointGone",
        message: "The /api/internal/cleanup endpoint is disabled by default. " +
          "In-process pruners handle all data retention cleanup automatically. " +
          "Set ENABLE_CRON_CLEANUP=true to re-enable this endpoint if you have an external cron job that depends on it.",
      },
      { status: 410 },
    );
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${cronSecret}`;
  const isValid = authHeader !== null && safeTokenCompare(authHeader, expected);
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit as defense-in-depth: if CRON_SECRET is leaked, this prevents
  // unbounded calls to the expensive batched DELETE endpoint.
  const rateLimitResponse = await consumeApiRateLimit(request, "internal:cleanup");
  if (rateLimitResponse) return rateLimitResponse;

  // Log deprecation notice: the in-process pruners (audit/events.ts and
  // data-retention-maintenance.ts) are the canonical cleanup mechanism.
  // This cron endpoint is kept for backward compatibility with external
  // cron jobs that may reference it.
  logger.info(
    "[cleanup] Cron endpoint called — this endpoint is deprecated in favor of in-process pruners. " +
    "See db/cleanup.ts JSDoc for details."
  );

  const result = await cleanupOldEvents();
  return NextResponse.json({ success: true, ...result });
}
