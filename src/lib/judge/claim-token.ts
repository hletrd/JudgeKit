import { nanoid } from "nanoid";

const CLAIM_TOKEN_SEPARATOR = ":";

/**
 * Build a claim token that embeds the original claim timestamp so the poll
 * route can cap total claim duration without relying on `judgeClaimedAt`,
 * which is refreshed by in-progress reports.
 *
 * The random nanoid prefix is opaque to workers; the timestamp suffix is
 * server-generated and only parsed by the app server.
 */
export function createClaimToken(claimCreatedAt: number): string {
  return `${nanoid()}${CLAIM_TOKEN_SEPARATOR}${claimCreatedAt}`;
}

export function parseClaimToken(token: string): {
  token: string;
  claimCreatedAt: number | null;
} {
  const sepIndex = token.lastIndexOf(CLAIM_TOKEN_SEPARATOR);
  if (sepIndex === -1) {
    // Legacy token without an embedded timestamp.
    return { token, claimCreatedAt: null };
  }

  const timestampStr = token.slice(sepIndex + 1);
  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return { token, claimCreatedAt: null };
  }

  return { token, claimCreatedAt: timestamp };
}
