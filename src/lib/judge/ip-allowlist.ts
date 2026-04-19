import type { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/security/ip";

/**
 * Parse the JUDGE_ALLOWED_IPS env var (comma-separated IPs or CIDR ranges).
 * When empty or not set, all IPs are allowed (backward compatible).
 */

let cachedAllowlist: string[] | null = null;

function getAllowlist(): string[] | null {
  if (cachedAllowlist !== null) return cachedAllowlist;

  const raw = process.env.JUDGE_ALLOWED_IPS?.trim();
  if (!raw) {
    cachedAllowlist = null; // no allowlist configured — allow all
    return null;
  }

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    cachedAllowlist = null;
    return null;
  }

  cachedAllowlist = entries;
  return cachedAllowlist;
}

/** Invalidate the cached allowlist (useful for testing). */
export function resetIpAllowlistCache(): void {
  cachedAllowlist = null;
}

/**
 * Check whether a CIDR or plain IP string matches the given client IP.
 * Supports:
 *   - Exact IP match (e.g. "192.168.1.10")
 *   - CIDR /24 and /16 shorthand (e.g. "192.168.1.0/24")
 */
export function ipMatchesAllowlistEntry(clientIp: string, entry: string): boolean {
  // Exact match
  if (entry === clientIp) return true;

  // CIDR match
  if (entry.includes("/")) {
    const [network, prefixLenStr] = entry.split("/");
    const prefixLen = parseInt(prefixLenStr, 10);
    if (Number.isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;

    const clientParts = clientIp.split(".").map(Number);
    const networkParts = network.split(".").map(Number);

    if (clientParts.length !== 4 || networkParts.length !== 4) return false;

    const clientNum =
      ((clientParts[0] << 24) | (clientParts[1] << 16) | (clientParts[2] << 8) | clientParts[3]) >>> 0;
    const networkNum =
      ((networkParts[0] << 24) | (networkParts[1] << 16) | (networkParts[2] << 8) | networkParts[3]) >>> 0;

    const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;

    return (clientNum & mask) === (networkNum & mask);
  }

  return false;
}

/**
 * Check whether the request's client IP is allowed to access judge API routes.
 * When JUDGE_ALLOWED_IPS is not configured, all IPs are allowed.
 */
export function isJudgeIpAllowed(request: NextRequest): boolean {
  const allowlist = getAllowlist();

  // No allowlist configured — allow all (temporary for worker access)
  if (!allowlist) {
    return true;
  }

  const clientIp = extractClientIp(request.headers);

  // If we can't determine the IP, deny by default when an allowlist exists
  if (!clientIp || clientIp === "0.0.0.0") return false;

  return allowlist.some((entry) => ipMatchesAllowlistEntry(clientIp, entry));
}
