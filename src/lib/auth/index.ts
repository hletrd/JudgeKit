import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "next-auth/adapters";
import { db } from "@/lib/db";
import { authConfig } from "./config";
import { accounts, sessions, users } from "@/lib/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
  }) as Adapter,
  ...authConfig,
});
