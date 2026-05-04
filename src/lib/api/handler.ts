import { NextRequest, NextResponse } from "next/server";
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

/** Shape returned by getApiUser */
export type AuthUser = NonNullable<Awaited<ReturnType<typeof getApiUser>>>;

/** Context passed to the inner handler function */
export type HandlerContext<T = undefined> = {
  user: AuthUser;
  body: T;
  params: Record<string, string>;
};

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
  /** Rate limit key (e.g. "users:create"). If omitted, no rate limiting is applied. */
  rateLimit?: string;
  /** Zod schema to validate request body. Body is only parsed when schema is provided. */
  schema?: ZodSchema<T>;
  handler: (
    req: NextRequest,
    ctx: HandlerContext<T>
  ) => Promise<NextResponse>;
};

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
 *   handler: async (req, { user, body }) => {
 *     // body is fully typed and validated
 *     return NextResponse.json({ data: body });
 *   },
 * });
 * ```
 */
// Overload: when schema is provided, body is typed as the schema output
export function createApiHandler<T>(config: HandlerConfig<T> & { schema: ZodSchema<T> }): (req: NextRequest, routeCtx?: { params: Promise<Record<string, string>> }) => Promise<NextResponse>;
// Overload: when no schema, body is undefined
export function createApiHandler(config: HandlerConfig<undefined> & { schema?: undefined }): (req: NextRequest, routeCtx?: { params: Promise<Record<string, string>> }) => Promise<NextResponse>;
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
    routeCtx?: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> {
    // Initialize per-request AsyncLocalStorage cache for recruiting context.
    // This ensures that getRecruitingAccessContext deduplicates DB queries
    // within a single API request, even though React cache() does not work
    // in API route handlers.
    return withRecruitingContextCache(async () => {
    try {
      // --- Rate limiting ---
      if (rateLimit) {
        const rateLimitResponse = await consumeApiRateLimit(req, rateLimit);
        if (rateLimitResponse) return rateLimitResponse;
      }

      // --- Auth check ---
      let user: AuthUser | null = null;

      if (auth !== false) {
        user = await getApiUser(req);
        if (!user) return unauthorized();

        // Role check
        if (typeof auth === "object" && auth.roles && auth.roles.length > 0) {
          if (!isUserRole(user.role) || !auth.roles.includes(user.role)) return forbidden();
        }

        if (typeof auth === "object" && auth.capabilities && auth.capabilities.length > 0) {
          const caps = await resolveCapabilities(user.role);
          const hasRequiredCapabilities = auth.requireAllCapabilities === false
            ? auth.capabilities.some((capability) => caps.has(capability))
            : auth.capabilities.every((capability) => caps.has(capability));
          if (!hasRequiredCapabilities) return forbidden();
        }
      }

      // --- CSRF check ---
      // Skip CSRF for API key-authenticated requests (no cookies involved).
      // Default: required for mutation methods unless explicitly disabled.
      const isApiKeyAuth = user && "_apiKeyAuth" in user;
      const shouldCheckCsrf =
        csrf !== undefined ? csrf : (!isApiKeyAuth && MUTATION_METHODS.has(req.method));

      if (shouldCheckCsrf) {
        const csrfError = csrfForbidden(req);
        if (csrfError) return csrfError;
      }

      // --- Body parsing + Zod validation ---
      let body: T = undefined as T;

      if (schema) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          return NextResponse.json({ error: "invalidJson" }, { status: 400 });
        }

        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "validationError" },
            { status: 400 }
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
        return unauthorized();
      }

      const result = await handler(req, {
        user: user as AuthUser,
        body,
        params,
      });

      // Prevent caching of authenticated API responses
      if (!result.headers.has("Cache-Control")) {
        result.headers.set("Cache-Control", "no-store");
      }

      // Defense-in-depth: prevent browsers from MIME-sniffing API responses
      if (!result.headers.has("X-Content-Type-Options")) {
        result.headers.set("X-Content-Type-Options", "nosniff");
      }

      return result;
    } catch (error) {
      logger.error({ err: error, method: req.method, path: req.nextUrl.pathname }, "Unhandled error");
      return NextResponse.json({ error: "internalServerError" }, { status: 500 });
    }
    });
  };
}

// Re-export helpers so routes that use the wrapper don't need two imports
export { isAdminAsync, unauthorized, forbidden, notFound };
