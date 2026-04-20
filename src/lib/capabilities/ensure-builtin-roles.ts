import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";
import { getDbNowUncached } from "@/lib/db-time";
import { nanoid } from "nanoid";
import { BUILTIN_ROLE_NAMES } from "./types";
import {
  DEFAULT_ROLE_CAPABILITIES,
  DEFAULT_ROLE_LEVELS,
  DEFAULT_ROLE_DISPLAY_NAMES,
} from "./defaults";

/**
 * Ensure all built-in roles exist in the database.
 * Creates missing ones or updates existing ones with current default capabilities.
 * Safe to call multiple times — concurrent calls are race-free via onConflictDoUpdate.
 */
export async function ensureBuiltinRoles(): Promise<void> {
  for (const roleName of BUILTIN_ROLE_NAMES) {
    const now = await getDbNowUncached();
    await db.insert(roles).values({
      id: nanoid(),
      name: roleName,
      displayName: DEFAULT_ROLE_DISPLAY_NAMES[roleName],
      description: null,
      isBuiltin: true,
      level: DEFAULT_ROLE_LEVELS[roleName],
      capabilities: DEFAULT_ROLE_CAPABILITIES[roleName] as string[],
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: roles.name,
      set: {
        displayName: DEFAULT_ROLE_DISPLAY_NAMES[roleName],
        level: DEFAULT_ROLE_LEVELS[roleName],
        capabilities: DEFAULT_ROLE_CAPABILITIES[roleName] as string[],
        updatedAt: now,
      },
    });
  }
}
