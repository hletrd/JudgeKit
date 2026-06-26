import type { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/security/ip";
import { logger } from "@/lib/logger";

/**
 * Parse the JUDGE_ALLOWED_IPS env var (comma-separated IPs or CIDR ranges).
 * When empty or not set, all IPs are allowed (backward compatible) UNLESS the
 * operator has explicitly opted into strict enforcement via
 * `JUDGE_STRICT_IP_ALLOWLIST=1`.
 *
 * C4-2 Part 2: the unset==allow-all default is deliberately preserved for
 * backward compatibility. The cycle-2 attempt to flip this default was
 * reverted in `23851d69` because it broke deployed workers that rely on the
 * open default. Operators who want fail-closed behaviour must opt in
 * explicitly via `JUDGE_STRICT_IP_ALLOWLIST=1` (or simply set
 * `JUDGE_ALLOWED_IPS`).
 */

/** Whether the strict opt-in flag is set. Exposed for tests. */
function isStrictIpAllowlistOptedIn(): boolean {
  return process.env.JUDGE_STRICT_IP_ALLOWLIST === "1";
}

let warnedAboutUnsetAllowlist = false;

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
  warnedAboutUnsetAllowlist = false;
}

/**
 * Expand a (possibly compressed / dual-stack) IPv6 address to its 16-byte
 * representation. Returns null if the input is not a syntactically valid IPv6.
 */
function ipv6ToBytes(ip: string): Uint8Array | null {
  // Strip optional zone identifier (e.g. fe80::1%eth0).
  const zoneIndex = ip.indexOf("%");
  const cleaned = zoneIndex >= 0 ? ip.slice(0, zoneIndex) : ip;

  // Optional embedded IPv4 (::ffff:1.2.3.4 or ::1.2.3.4) — translate the IPv4
  // tail into the last two hextets before the rest of the parser runs.
  const lastColon = cleaned.lastIndexOf(":");
  let normalized = cleaned;
  if (lastColon >= 0 && cleaned.slice(lastColon + 1).includes(".")) {
    const tail = cleaned.slice(lastColon + 1);
    const head = cleaned.slice(0, lastColon);
    const v4 = tail.split(".").map((part) => Number(part));
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    const hex1 = ((v4[0] << 8) | v4[1]).toString(16);
    const hex2 = ((v4[2] << 8) | v4[3]).toString(16);
    normalized = `${head}:${hex1}:${hex2}`;
  }

  if (!/^[0-9a-fA-F:]+$/.test(normalized)) return null;

  // RFC 5952: at most one "::".
  const doubleColonCount = (normalized.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return null;

  let head: string[];
  let tail: string[];
  if (doubleColonCount === 1) {
    const [headRaw, tailRaw] = normalized.split("::");
    head = headRaw === "" ? [] : headRaw.split(":");
    tail = tailRaw === "" ? [] : tailRaw.split(":");
  } else {
    head = normalized.split(":");
    tail = [];
  }

  const totalGroups = head.length + tail.length;
  if (totalGroups > 8) return null;
  if (doubleColonCount === 0 && totalGroups !== 8) return null;

  const groups: string[] = [...head];
  for (let i = totalGroups; i < 8; i++) groups.push("0");
  groups.push(...tail);
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const group = groups[i];
    if (group.length === 0 || group.length > 4) return null;
    const value = parseInt(group, 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) return null;
    bytes[i * 2] = (value >>> 8) & 0xff;
    bytes[i * 2 + 1] = value & 0xff;
  }
  return bytes;
}

function bytesEqualUnderPrefix(a: Uint8Array, b: Uint8Array, prefixLen: number): boolean {
  if (a.length !== b.length) return false;
  const fullBytes = Math.floor(prefixLen / 8);
  for (let i = 0; i < fullBytes; i++) {
    if (a[i] !== b[i]) return false;
  }
  const trailingBits = prefixLen - fullBytes * 8;
  if (trailingBits === 0) return true;
  if (fullBytes >= a.length) return true;
  const mask = (0xff << (8 - trailingBits)) & 0xff;
  return (a[fullBytes] & mask) === (b[fullBytes] & mask);
}

/**
 * Check whether a CIDR or plain IP string matches the given client IP.
 * Supports IPv4 (exact + CIDR /0-/32) and IPv6 (exact + CIDR /0-/128).
 */
export function ipMatchesAllowlistEntry(clientIp: string, entry: string): boolean {
  if (entry === clientIp) return true;

  if (entry.includes("/")) {
    const [network, prefixLenStr] = entry.split("/");
    const prefixLen = parseInt(prefixLenStr, 10);
    if (Number.isNaN(prefixLen) || prefixLen < 0) return false;

    // IPv6 path
    if (network.includes(":")) {
      if (prefixLen > 128) return false;
      const clientBytes = ipv6ToBytes(clientIp);
      const networkBytes = ipv6ToBytes(network);
      if (!clientBytes || !networkBytes) return false;
      return bytesEqualUnderPrefix(clientBytes, networkBytes, prefixLen);
    }

    // IPv4 path
    if (prefixLen > 32) return false;
    const clientParts = clientIp.split(".").map(Number);
    const networkParts = network.split(".").map(Number);
    if (clientParts.length !== 4 || networkParts.length !== 4) return false;
    if (clientParts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    if (networkParts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

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
 *
 * Behaviour matrix (C4-2 Part 2 — opt-in, NOT a default flip):
 * - `JUDGE_ALLOWED_IPS` set            → enforce the allowlist (deny unknown).
 * - unset + `JUDGE_STRICT_IP_ALLOWLIST=1` → fail-closed (deny all). Explicit opt-in.
 * - unset + flag unset                  → allow-all (back-compat) + loud startup WARN.
 */
export function isJudgeIpAllowed(request: NextRequest): boolean {
  const allowlist = getAllowlist();

  // No allowlist configured.
  if (!allowlist) {
    if (isStrictIpAllowlistOptedIn()) {
      // Operator explicitly opted into strict enforcement without configuring
      // an allowlist — fail closed.
      return false;
    }
    // Back-compat: allow all. Warn once at startup so the open posture is not
    // silent (a leaked judge token has no network-layer backstop in this mode).
    if (!warnedAboutUnsetAllowlist) {
      warnedAboutUnsetAllowlist = true;
      logger.warn(
        "JUDGE_ALLOWED_IPS is not set; judge API routes accept any client IP. " +
          "Set JUDGE_ALLOWED_IPS or JUDGE_STRICT_IP_ALLOWLIST=1 to enforce network isolation.",
      );
    }
    return true;
  }

  const clientIp = extractClientIp(request.headers);

  // If we can't determine the IP, deny by default when an allowlist exists
  if (!clientIp || clientIp === "0.0.0.0") return false;

  return allowlist.some((entry) => ipMatchesAllowlistEntry(clientIp, entry));
}
