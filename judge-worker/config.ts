const DEFAULT_BASE_URL = "http://localhost:3000/api/v1";
const DEFAULT_POLL_INTERVAL_MS = 2000;
const JUDGE_AUTH_TOKEN_PLACEHOLDER = "your-judge-auth-token";

function normalizeBooleanEnv(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getBaseUrl() {
  const baseUrl = process.env.JUDGE_BASE_URL?.trim();
  if (baseUrl) {
    return baseUrl.replace(/\/+$/, "");
  }

  // Legacy fallback: derive base from JUDGE_POLL_URL
  const pollUrl = process.env.JUDGE_POLL_URL?.trim();
  if (pollUrl) {
    const suffix = "/judge/poll";
    if (pollUrl.endsWith(suffix)) {
      return pollUrl.slice(0, -suffix.length);
    }
    // Non-standard poll URL; return as-is and let callers handle it
    console.warn(
      "JUDGE_POLL_URL does not end with /judge/poll; claim URL derivation may be incorrect."
    );
    return pollUrl.replace(/\/judge\/poll$/, "");
  }

  return DEFAULT_BASE_URL;
}

export function getJudgeClaimUrl() {
  return `${getBaseUrl()}/judge/claim`;
}

export function getJudgePollUrl() {
  return `${getBaseUrl()}/judge/poll`;
}

export function getJudgePollIntervalMs() {
  const rawValue = process.env.POLL_INTERVAL?.trim();

  if (!rawValue) {
    return DEFAULT_POLL_INTERVAL_MS;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error("POLL_INTERVAL must be a positive integer.");
  }

  return parsedValue;
}

export function getJudgeAuthToken() {
  const authToken = process.env.JUDGE_AUTH_TOKEN?.trim();

  if (!authToken) {
    throw new Error("JUDGE_AUTH_TOKEN must be set before starting the judge worker.");
  }

  if (authToken === JUDGE_AUTH_TOKEN_PLACEHOLDER) {
    throw new Error("JUDGE_AUTH_TOKEN must be replaced with a strong random value before starting the judge worker.");
  }

  return authToken;
}

export function shouldDisableCustomSeccomp() {
  const disabled = normalizeBooleanEnv(process.env.JUDGE_DISABLE_CUSTOM_SECCOMP);

  if (disabled) {
    console.warn(
      "WARNING: JUDGE_DISABLE_CUSTOM_SECCOMP is set. " +
      "Custom seccomp profile is disabled. " +
      "This MUST NOT be used in production environments."
    );
  }

  return disabled;
}
