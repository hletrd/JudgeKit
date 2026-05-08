"use server";

import { headers } from "next/headers";
import { getTrustedAuthHosts, normalizeHostForComparison } from "@/lib/security/env";
import { logger } from "@/lib/logger";

function getOriginHost(origin: string | null) {
  if (!origin) {
    return null;
  }

  try {
    return normalizeHostForComparison(new URL(origin).host);
  } catch (err) {
    logger.warn({ err, origin }, "[server-actions] failed to parse origin URL");
    return null;
  }
}

export async function isTrustedServerActionOrigin() {
  const headerStore = await headers();
  const trustedHosts = await getTrustedAuthHosts();
  const originHost = getOriginHost(headerStore.get("origin"));

  if (!originHost) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("[server-actions] Origin header missing — bypassing origin check in development mode. Set NODE_ENV=production or configure TRUSTED_AUTH_HOSTS to prevent this.");
    }
    return process.env.NODE_ENV !== "production";
  }

  if (trustedHosts.size === 0) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn({ originHost }, "[server-actions] No trusted hosts configured — restricting origin check to loopback in development mode. Configure TRUSTED_AUTH_HOSTS to allow other origins.");
    }
    // In development, only allow loopback origins when no trusted hosts are configured.
    // This prevents arbitrary third-party origins from invoking server actions while
    // still permitting local development on localhost/127.0.0.1.
    const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return process.env.NODE_ENV !== "production" && LOOPBACK_HOSTS.has(originHost);
  }

  return trustedHosts.has(originHost);
}
