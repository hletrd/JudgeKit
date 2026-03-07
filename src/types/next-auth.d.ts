import type { UserRole } from "@/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      email?: string | null;
      name: string;
      role: UserRole;
      mustChangePassword: boolean;
      image?: string | null;
    };
  }

  interface User {
    id?: string;
    username: string;
    email?: string | null;
    name?: string | null;
    role: UserRole;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    username?: string;
    email?: string | null;
    mustChangePassword?: boolean;
  }
}
