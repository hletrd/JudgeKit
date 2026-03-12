const AUTH_SECRET_PLACEHOLDER = "your-secret-key-here-generate-with-openssl-rand-base64-32";
const JUDGE_AUTH_TOKEN_PLACEHOLDER = "your-judge-auth-token";
const JUDGE_AUTH_TOKEN_DEV_PLACEHOLDER = "dev-test-token-for-local-development";
const JUDGE_AUTH_TOKEN_MIN_LENGTH = 32;
const SECURE_AUTH_SESSION_COOKIE_NAME = "__Secure-authjs.session-token";
const AUTH_SESSION_COOKIE_NAME = "authjs.session-token";

const LOOPBACK_HOST_ALIASES = ["localhost", "127.0.0.1", "[::1]"] as const;

export function normalizeHostForComparison(host: string) {
  const normalized = host.trim().toLowerCase();

  if (!normalized) {
    return normalized;
  }

  if (normalized.startsWith("[")) {
    const closingBracketIndex = normalized.indexOf("]");

    if (closingBracketIndex === -1) {
      return normalized;
    }

    const hostname = normalized.slice(0, closingBracketIndex + 1);
    const suffix = normalized.slice(closingBracketIndex + 1);

    if (!suffix || suffix === ":80" || suffix === ":443") {
      return hostname;
    }

    return `${hostname}${suffix}`;
  }

  const firstColonIndex = normalized.indexOf(":");
  const lastColonIndex = normalized.lastIndexOf(":");

  if (firstColonIndex === -1 || firstColonIndex !== lastColonIndex) {
    return normalized;
  }

  const hostname = normalized.slice(0, lastColonIndex);
  const port = normalized.slice(lastColonIndex + 1);

  if (port === "80" || port === "443") {
    return hostname;
  }

  return `${hostname}:${port}`;
}

function requireNonEmptyEnv(name: string, value: string | undefined) {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} must be set before starting the application.`);
  }

  return value.trim();
}

export function getAuthUrl() {
  return process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
}

export function getAuthUrlObject() {
  const authUrl = getAuthUrl();

  if (!authUrl) {
    return null;
  }

  try {
    return new URL(authUrl);
  } catch {
    throw new Error("AUTH_URL must be a valid absolute URL.");
  }
}

export function validateAuthUrl() {
  const authUrl = getAuthUrl();

  if (process.env.NODE_ENV === "production" && !authUrl) {
    throw new Error(
      "AUTH_URL must be set in production (e.g., AUTH_URL=https://your-domain.com). " +
      "This is required for secure authentication."
    );
  }

  if (authUrl) {
    getAuthUrlObject();
  }

  return authUrl;
}

export function getTrustedAuthHosts() {
  const authUrl = getAuthUrlObject();
  const trustedHosts = new Set<string>();

  if (!authUrl) {
    return trustedHosts;
  }

  trustedHosts.add(normalizeHostForComparison(authUrl.host));

  if (process.env.NODE_ENV === "production") {
    return trustedHosts;
  }

  if (LOOPBACK_HOST_ALIASES.includes(authUrl.hostname as (typeof LOOPBACK_HOST_ALIASES)[number])) {
    const portSuffix = authUrl.port ? `:${authUrl.port}` : "";

    for (const hostname of LOOPBACK_HOST_ALIASES) {
      trustedHosts.add(normalizeHostForComparison(`${hostname}${portSuffix}`));
    }
  }

  return trustedHosts;
}

export function shouldUseSecureSessionCookie() {
  const authUrl = getAuthUrl();

  return authUrl?.startsWith("https://") === true;
}

export function shouldTrustAuthHost() {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return process.env.AUTH_TRUST_HOST === "true";
}

export function getAuthSessionCookieName() {
  return shouldUseSecureSessionCookie()
    ? SECURE_AUTH_SESSION_COOKIE_NAME
    : AUTH_SESSION_COOKIE_NAME;
}

export function getValidatedAuthSecret() {
  const authSecret = requireNonEmptyEnv("AUTH_SECRET", process.env.AUTH_SECRET);

  if (authSecret === AUTH_SECRET_PLACEHOLDER || authSecret.length < 32) {
    throw new Error("AUTH_SECRET must be replaced with a strong value that is at least 32 characters long.");
  }

  return authSecret;
}

export function getValidatedJudgeAuthToken() {
  const judgeAuthToken = requireNonEmptyEnv("JUDGE_AUTH_TOKEN", process.env.JUDGE_AUTH_TOKEN);

  if (
    judgeAuthToken === JUDGE_AUTH_TOKEN_PLACEHOLDER ||
    judgeAuthToken === JUDGE_AUTH_TOKEN_DEV_PLACEHOLDER
  ) {
    throw new Error("JUDGE_AUTH_TOKEN must be replaced with a strong random value before starting the application.");
  }

  if (judgeAuthToken.length < JUDGE_AUTH_TOKEN_MIN_LENGTH) {
    throw new Error(
      "JUDGE_AUTH_TOKEN must be at least 32 characters. Generate one with: openssl rand -hex 32"
    );
  }

  return judgeAuthToken;
}
