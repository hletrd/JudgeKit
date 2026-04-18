import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getAdminHealthSnapshot, getPublicHealthStatus } from "@/lib/ops/admin-health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getApiUser(request).catch(() => null);
  const canViewAdminHealth = user
    ? (await resolveCapabilities(user.role)).has("system.settings")
    : false;

  if (canViewAdminHealth) {
    const snapshot = await getAdminHealthSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
      status: snapshot.status === "error" ? 503 : 200,
    });
  }

  const status = await getPublicHealthStatus();
  return NextResponse.json(
    { status },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: status === "error" ? 503 : 200,
    }
  );
}
