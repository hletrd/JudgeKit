import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Rate limit this endpoint to prevent abuse (e.g. from load balancer polls)
  const rateLimitResponse = await consumeApiRateLimit(request, "health:check");
  if (rateLimitResponse) return rateLimitResponse;

  const start = Date.now();
  let dbStatus: "ok" | "error" = "ok";

  try {
    if (pool) {
      const result = await pool.query("SELECT 1");
      dbStatus = result.rows.length > 0 ? "ok" : "error";
    }
  } catch (err) {
    logger.warn({ err }, "[health] database connectivity check failed");
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? "unknown",
      db: dbStatus,
      uptime: Math.floor(process.uptime()),
      responseTimeMs: Date.now() - start,
    },
    {
      status: status === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
