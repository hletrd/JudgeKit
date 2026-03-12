import { NextRequest, NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import type { UserRole } from "@/types";
import {
  getApiUser,
  unauthorized,
  forbidden,
  csrfForbidden,
  isAdmin,
  isInstructor,
} from "@/lib/api/auth";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";
import { isUserRole } from "@/lib/security/constants";

/** Shape returned by getApiUser */
export type AuthUser = NonNullable<Awaited<ReturnType<typeof getApiUser>>>;

/** Context passed to the inner handler function */
export type HandlerContext<T = unknown> = {
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
    };

/**
 * Configuration object for createApiHandler.
 *
 * - auth       — enable auth check (default: true)
 * - csrf       — enable CSRF check for mutation methods (default: auto for POST/PUT/PATCH/DELETE)
 * - rateLimit  — rate limit key; when provided, checkApiRateLimit + recordApiRateHit are called
 * - schema     — Zod schema to parse and validate the request body
 * - handler    — the actual business logic; receives (req, ctx)
 */
export type HandlerConfig<T = unknown> = {
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
export function createApiHandler<T = unknown>(config: HandlerConfig<T>) {
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
    try {
      // --- CSRF check ---
      // Default: required for mutation methods unless explicitly disabled.
      const shouldCheckCsrf =
        csrf !== undefined ? csrf : MUTATION_METHODS.has(req.method);

      if (shouldCheckCsrf) {
        const csrfError = csrfForbidden(req);
        if (csrfError) return csrfError;
      }

      // --- Rate limiting ---
      if (rateLimit) {
        const rateLimitResponse = checkApiRateLimit(req, rateLimit);
        if (rateLimitResponse) return rateLimitResponse;
        recordApiRateHit(req, rateLimit);
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

      return await handler(req, {
        user: user as AuthUser,
        body,
        params,
      });
    } catch (error) {
      console.error(`[${req.method} ${req.nextUrl.pathname}] Unhandled error:`, error);
      return NextResponse.json({ error: "internalServerError" }, { status: 500 });
    }
  };
}

// Re-export helpers so routes that use the wrapper don't need two imports
export { isAdmin, isInstructor, unauthorized, forbidden };
