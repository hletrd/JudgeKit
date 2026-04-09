import { NextRequest, NextResponse } from "next/server";
import { getTrustedAuthHosts, normalizeHostForComparison } from "@/lib/security/env";

function getRequestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost) {
    const firstForwardedHost = forwardedHost
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);

    if (firstForwardedHost) {
      return normalizeHostForComparison(firstForwardedHost);
    }
  }

  const host = request.headers.get("host")?.trim();

  return host ? normalizeHostForComparison(host) : null;
}

export async function validateTrustedAuthHost(request: NextRequest) {
  const requestHost = getRequestHost(request);
  const trustedHosts = await getTrustedAuthHosts();

  if (!requestHost || trustedHosts.size === 0 || trustedHosts.has(requestHost)) {
    return null;
  }

  return NextResponse.json({ error: "UntrustedHost" }, { status: 400 });
}
