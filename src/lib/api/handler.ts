import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { ZodSchema } from "zod";
import type { UserRole } from "@/types";
import {
  getApiUser,
  unauthorized,
  forbidden,
  notFound,
  csrfForbidden,
  isAdminAsync,
} from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { isUserRole } from "@/lib/security/constants";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { logger } from "@/lib/logger";
import { withRecruitingContextCache } from "@/lib/recruiting/request-cache";
import { withPermissionCache } from "@/lib/auth/permission-cache";

/** Shape returned by getApiUser */
export type AuthUser = NonNullable<Awaited<ReturnType<typeof getApiUser>>>;

/** Context passed to the inner handler function */
export type HandlerContext<T = undefined> = {
  user: AuthUser;
  body: T;
  params: Record<string, string>;
  requestId: string;
};

/**
 * Minimal error taxonomy for API responses. Known operational failures expose a
 * machine-readable `code` field instead of being collapsed into a generic 500.
 */
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "ApiError";
  }
}

export class OperationalError extends ApiError {
  constructor(code: string, message: string, status: number = 500) {
    super(code, message, status);
    this.name = "OperationalError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string = "validationError") {
    super("validationError", message, 400);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super("notFound", `${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

/**
 * Auth config variants:
 *   true            — require any authenticated user
 *   { roles }       — require authenticated user whose role is in the list
 */
type AuthConfig =
  | true
  | {
      roles?: UserRole[];
      capabilities?: string[];
      requireAllCapabilities?: boolean;
    };

/**
 * Configuration object for createApiHandler.
 *
 * - auth       — enable auth check (default: true)
 * - csrf       — enable CSRF check for mutation methods (default: auto for POST/PUT/PATCH/DELETE)
 * - rateLimit  — rate limit key; when provided, consumeApiRateLimit is called
 * - schema     — Zod schema to parse and validate the request body
 * - handler    — the actual business logic; receives (req, ctx)
 */
export type HandlerConfig<T = undefined> = {
  /** Require authentication. Pass `{ roles: [...] }` to also check role. Defaults to true. */
  auth?: AuthConfig | false;
  /**
   * Whether to verify the CSRF header.
   * Defaults to true for POST, PUT, PATCH, DELETE; false for GET, HEAD, OPTIONS.
   */
  csrf?: boolean;
  /** Rate limit key (e.g. "users:create"). If omitted, no rate limiting is applied.
   * The configured limit is IP-keyed and consumed before auth so unauthenticated
   * requests are still throttled. For user-keyed limits, consume inside the
   * handler after authentication. */
  rateLimit?: string;
  /** Zod schema to validate request body. Body is only parsed when schema is provided. */
  schema?: ZodSchema<T>;
  handler: (
    req: NextRequest,
    ctx: HandlerContext<T>
  ) => Promise<Response>;
};

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
type NextRouteContext = { params: Promise<Record<string, string>> };

const REQUEST_ID_HEADER = "x-request-id";

function getOrCreateRequestId(req: NextRequest): string {
  return req.headers.get(REQUEST_ID_HEADER) ?? randomUUID();
}

function addRequestId(response: Response, requestId: string): Response {
  response.headers.set("X-Request-Id", requestId);
  return response;
}

function buildErrorBody(
  code: string,
  requestId: string,
  message?: string
): Record<string, unknown> {
  const body: Record<string, unknown> = { error: code, requestId };
  if (message) body.message = message;
  return body;
}

/**
 * Factory that wraps a Next.js App Router route handler with common middleware:
 * auth, CSRF, rate limiting, body parsing + Zod validation, and error handling.
 *
 * Usage:
 * ```ts
 * export const POST = createApiHandler({
 *   auth: { roles: ["admin", "super_admin"] },
 *   rateLimit: "users:create",
 *   schema: userCreateSchema,
 *   handler: async (req, { user, body, requestId }) => {
 *     // body is fully typed and validated
 *     return NextResponse.json({ data: body });
 *   },
 * });
 * ```
 */
// Overload: when schema is provided, body is typed as the schema output
export function createApiHandler<T>(config: HandlerConfig<T> & { schema: ZodSchema<T> }): (req: NextRequest, routeCtx: NextRouteContext) => Promise<Response>;
// Overload: when no schema, body is undefined
export function createApiHandler(config: HandlerConfig<undefined> & { schema?: undefined }): (req: NextRequest, routeCtx: NextRouteContext) => Promise<Response>;
// Implementation
export function createApiHandler<T = undefined>(config: HandlerConfig<T>) {
  const {
    auth = true,
    csrf,
    rateLimit,
    schema,
    handler,
  } = config;

  return async function apiHandler(
    req: NextRequest,
    routeCtx?: NextRouteContext
  ): Promise<Response> {
    const requestId = getOrCreateRequestId(req);
    const requestLogger = logger.child?.({ requestId, route: req.nextUrl.pathname }) ?? logger;

    // Initialize per-request AsyncLocalStorage cache for recruiting context.
    // This ensures that getRecruitingAccessContext deduplicates DB queries
    // within a single API request, even though React cache() does not work
    // in API route handlers.
    return withRecruitingContextCache(async () =>
    // Per-request permission verdict memo (F-1): nested inside the recruiting
    // cache so both ALS stores are active. canManageProblem (and peers) hit the
    // DB once per (userId, resourceId) per request instead of once per call.
    withPermissionCache(async () => {
    try {
      // --- Rate limiting ---
      // The configured rateLimit key is IP-keyed and checked before auth so that
      // anonymous clients cannot bypass throttling. Endpoints that need a
      // user-keyed limit should leave rateLimit unset and call
      // consumeUserApiRateLimit inside the handler after auth/recruiting checks.
      if (rateLimit) {
        const rateLimitResponse = await consumeApiRateLimit(req, rateLimit);
        if (rateLimitResponse) return addRequestId(rateLimitResponse, requestId);
      }

      // --- Auth check ---
      let user: AuthUser | null = null;

      if (auth !== false) {
        user = await getApiUser(req);
        if (!user) return addRequestId(unauthorized(), requestId);

        // Role check
        if (typeof auth === "object" && auth.roles && auth.roles.length > 0) {
          if (!isUserRole(user.role) || !auth.roles.includes(user.role)) return addRequestId(forbidden(), requestId);
        }

        if (typeof auth === "object" && auth.capabilities && auth.capabilities.length > 0) {
          const caps = await resolveCapabilities(user.role);
          const hasRequiredCapabilities = auth.requireAllCapabilities === false
            ? auth.capabilities.some((capability) => caps.has(capability))
            : auth.capabilities.every((capability) => caps.has(capability));
          if (!hasRequiredCapabilities) return addRequestId(forbidden(), requestId);
        }
      }

      // --- CSRF check ---
      // Skip CSRF for API key-authenticated requests (no cookies involved).
      // Default: required for mutation methods unless explicitly disabled.
      const isApiKeyAuth = user && "_apiKeyAuth" in user;
      const shouldCheckCsrf =
        csrf !== undefined ? csrf : (!isApiKeyAuth && MUTATION_METHODS.has(req.method));

      if (shouldCheckCsrf) {
        const csrfError = await csrfForbidden(req);
        if (csrfError) return addRequestId(csrfError, requestId);
      }

      // --- Body parsing + Zod validation ---
      let body: T = undefined as T;

      if (schema) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          return addRequestId(
            NextResponse.json({ error: "invalidJson", requestId }, { status: 400 }),
            requestId
          );
        }

        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          const issues = parsed.error.issues;
          return addRequestId(
            NextResponse.json(
              {
                error: issues[0]?.message ?? "validationError",
                errors: issues.map((issue) => issue.message),
                requestId,
              },
              { status: 400 }
            ),
            requestId
          );
        }
        body = parsed.data as T;
      }

      // --- Route params ---
      const params = routeCtx?.params ? await routeCtx.params : {};

      // --- Call the inner handler ---
      // When auth is enabled (default), user is guaranteed non-null here.
      // When auth is false, user may be null — handlers must check.
      if (auth !== false && !user) {
        // This should never happen since we return unauthorized() above,
        // but guard against logic errors.
        return addRequestId(unauthorized(), requestId);
      }

      const result = await handler(req, {
        user: user as AuthUser,
        body,
        params,
        requestId,
      });

      // Prevent caching of authenticated API responses
      if (!result.headers.has("Cache-Control")) {
        result.headers.set("Cache-Control", "no-store");
      }

      // Defense-in-depth: prevent browsers from MIME-sniffing API responses
      if (!result.headers.has("X-Content-Type-Options")) {
        result.headers.set("X-Content-Type-Options", "nosniff");
      }

      return addRequestId(result, requestId);
    } catch (error) {
      if (error instanceof ApiError) {
        requestLogger.warn(
          { err: error, code: error.code, status: error.status },
          "Operational API error"
        );
        return addRequestId(
          NextResponse.json(
            buildErrorBody(error.code, requestId, error.message),
            { status: error.status }
          ),
          requestId
        );
      }

      requestLogger.error({ err: error, method: req.method, path: req.nextUrl.pathname }, "Unhandled error");
      return addRequestId(
        NextResponse.json(
          buildErrorBody("internalServerError", requestId),
          { status: 500 }
        ),
        requestId
      );
    }
    }));
  };
}

// Re-export helpers so routes that use the wrapper don't need two imports
export { isAdminAsync, unauthorized, forbidden, notFound };
