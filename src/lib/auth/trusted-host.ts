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

  // In production, reject requests with no determinable host
  if (!requestHost) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "MissingHostHeader" }, { status: 400 });
    }
    return null;
  }

  // In production, fail closed when no trusted hosts configured
  if (trustedHosts.size === 0) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "NoTrustedHostsConfigured" }, { status: 500 });
    }
    return null;
  }

  if (trustedHosts.has(requestHost)) {
    return null;
  }

  return NextResponse.json({ error: "UntrustedHost" }, { status: 400 });
}
