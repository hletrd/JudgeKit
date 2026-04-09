"use server";

import { headers } from "next/headers";
import { getTrustedAuthHosts, normalizeHostForComparison } from "@/lib/security/env";

function getOriginHost(origin: string | null) {
  if (!origin) {
    return null;
  }

  try {
    return normalizeHostForComparison(new URL(origin).host);
  } catch {
    return null;
  }
}

export async function isTrustedServerActionOrigin() {
  const headerStore = await headers();
  const trustedHosts = await getTrustedAuthHosts();
  const originHost = getOriginHost(headerStore.get("origin"));

  if (!originHost) {
    return process.env.NODE_ENV !== "production";
  }

  if (trustedHosts.size === 0) {
    return process.env.NODE_ENV !== "production";
  }

  return trustedHosts.has(originHost);
}
