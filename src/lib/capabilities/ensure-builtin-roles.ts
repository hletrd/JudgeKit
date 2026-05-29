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
 * Seed any missing built-in roles with their default capabilities/levels.
 *
 * SEED-IF-MISSING ONLY: this used to onConflictDoUpdate, which ran on every
 * render of the admin roles page and silently overwrote admin-customized
 * built-in role capabilities/levels back to defaults (with no audit trail).
 * It now does nothing when a role already exists, so admin edits persist.
 * super_admin always resolves to ALL_CAPABILITIES at lookup time regardless of
 * the stored row (see resolveCapabilities), so it never needs re-seeding.
 * Safe to call repeatedly; concurrent calls are race-free via onConflictDoNothing.
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
    }).onConflictDoNothing({
      target: roles.name,
    });
  }
}
