import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      email?: string | null;
      name: string;
      className?: string | null;
      role: string;
      mustChangePassword: boolean;
      image?: string | null;
    };
  }

  interface User {
    id?: string;
    username: string;
    email?: string | null;
    name?: string | null;
    className?: string | null;
    role: string;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    username?: string;
    email?: string | null;
    className?: string | null;
    mustChangePassword?: boolean;
    authenticatedAt?: number;
    uaHash?: string;
  }
}

/**
 * Validated JWT with required fields for post-authentication use.
 * Use after verifying the token is fully populated (e.g., after getApiUser).
 */
export type ValidatedJWT = Required<
  Pick<
    import("next-auth/jwt").JWT,
    "id" | "role" | "username" | "authenticatedAt"
  >
>;
