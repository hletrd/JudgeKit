import { NextRequest, NextResponse } from "next/server";
import { cleanupOldEvents } from "@/lib/db/cleanup";
import { safeTokenCompare } from "@/lib/security/timing";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

  const result = await cleanupOldEvents();
  return NextResponse.json({ success: true, ...result });
}
