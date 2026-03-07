import { db } from "@/lib/db";
import { loginEvents } from "@/lib/db/schema";

export type LoginEventOutcome =
  | "success"
  | "invalid_credentials"
  | "rate_limited"
  | "policy_denied";

export type LoginEventRequestSummary = {
  attemptedIdentifier: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestMethod: string | null;
  requestPath: string | null;
};

export type LoginEventContextCarrier = {
  loginEventContext?: LoginEventRequestSummary;
};

type RequestLike = {
  headers: Headers;
  method?: string | null;
  url?: string | null;
};

type RecordLoginEventInput = {
  outcome: LoginEventOutcome;
  attemptedIdentifier?: string | null;
  userId?: string | null;
  request: RequestLike;
};

type RecordLoginEventWithContextInput = {
  outcome: LoginEventOutcome;
  userId?: string | null;
  context: LoginEventRequestSummary;
};

const MAX_IDENTIFIER_LENGTH = 320;
const MAX_IP_LENGTH = 128;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_METHOD_LENGTH = 16;
const MAX_PATH_LENGTH = 512;

function normalizeText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function getClientIp(headers: Headers) {
  const forwardedFor = headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const realIp = headers.get("x-real-ip")?.trim();

  return normalizeText(forwardedFor || realIp, MAX_IP_LENGTH);
}

function getRequestPath(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    return normalizeText(new URL(url).pathname, MAX_PATH_LENGTH);
  } catch {
    return null;
  }
}

export function buildLoginEventContext(
  request: RequestLike,
  attemptedIdentifier?: string | null
): LoginEventRequestSummary {
  return sanitizeLoginEventContext({
    attemptedIdentifier,
    ipAddress: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    requestMethod: request.method,
    requestPath: getRequestPath(request.url),
  });
}

export function sanitizeLoginEventContext(
  context: Partial<LoginEventRequestSummary>
): LoginEventRequestSummary {
  return {
    attemptedIdentifier: normalizeText(context.attemptedIdentifier, MAX_IDENTIFIER_LENGTH),
    ipAddress: normalizeText(context.ipAddress, MAX_IP_LENGTH),
    userAgent: normalizeText(context.userAgent, MAX_USER_AGENT_LENGTH),
    requestMethod: normalizeText(context.requestMethod, MAX_METHOD_LENGTH)?.toUpperCase() ?? null,
    requestPath: normalizeText(context.requestPath, MAX_PATH_LENGTH),
  };
}

export function getLoginEventContextFromUser(user: unknown) {
  if (!user || typeof user !== "object") {
    return null;
  }

  return (user as LoginEventContextCarrier).loginEventContext ?? null;
}

export function recordLoginEvent({
  outcome,
  attemptedIdentifier,
  userId,
  request,
}: RecordLoginEventInput) {
  recordLoginEventWithContext({
    outcome,
    userId,
    context: buildLoginEventContext(request, attemptedIdentifier),
  });
}

export function recordLoginEventWithContext({
  outcome,
  userId,
  context,
}: RecordLoginEventWithContextInput) {
  try {
    db.insert(loginEvents)
      .values({
        outcome,
        attemptedIdentifier: context.attemptedIdentifier,
        userId: normalizeText(userId, 64),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestMethod: context.requestMethod,
        requestPath: context.requestPath,
      })
      .run();
  } catch (error) {
    console.warn("Failed to persist login event", {
      outcome,
      userId: normalizeText(userId, 64),
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
