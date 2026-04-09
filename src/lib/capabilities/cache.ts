/**
 * In-memory role → capabilities cache.
 *
 * On first access, loads all roles from DB and caches them.
 * Explicit invalidation clears the cache so the next access reloads.
 *
 * super_admin always has ALL capabilities regardless of DB state (hardcoded safety).
 */

import { ALL_CAPABILITIES, isBuiltinRole } from "./types";
import { DEFAULT_ROLE_CAPABILITIES, DEFAULT_ROLE_LEVELS } from "./defaults";

/** Cached role data: name → { capabilities Set, level } */
let roleCache: Map<string, { capabilities: Set<string>; level: number }> | null = null;
let loadPromise: Promise<void> | null = null;
let roleCacheLoadedAt = 0;
const ROLE_CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Load all roles from DB into the cache.
 * Uses dynamic import to avoid circular dependencies with db module.
 */
async function loadRolesFromDb(): Promise<void> {
  const { db } = await import("@/lib/db");
  const { roles } = await import("@/lib/db/schema");

  const allRoles = await db.select().from(roles);

  const cache = new Map<string, { capabilities: Set<string>; level: number }>();

  for (const role of allRoles) {
    const caps = (role.capabilities as string[] | null) ?? [];
    cache.set(role.name, {
      capabilities: new Set(caps),
      level: role.level,
    });
  }

  // Ensure built-in roles exist in cache even if not yet in DB (bootstrap)
  for (const builtinName of ["student", "instructor", "admin", "super_admin"] as const) {
    if (!cache.has(builtinName)) {
      cache.set(builtinName, {
        capabilities: new Set(DEFAULT_ROLE_CAPABILITIES[builtinName]),
        level: DEFAULT_ROLE_LEVELS[builtinName],
      });
    }
  }

  // super_admin safety: always has ALL capabilities
  const superAdminEntry = cache.get("super_admin");
  if (superAdminEntry) {
    superAdminEntry.capabilities = new Set(ALL_CAPABILITIES);
  }

  roleCache = cache;
}

/**
 * Ensure the cache is populated and not expired. Concurrent calls share one load.
 */
async function ensureLoaded(): Promise<void> {
  if (roleCache && Date.now() - roleCacheLoadedAt < ROLE_CACHE_TTL_MS) return;
  // Cache expired or not loaded — force reload (keep old cache until new one is ready)
  if (!loadPromise) {
    loadPromise = loadRolesFromDb()
      .then(() => {
        roleCacheLoadedAt = Date.now();
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  await loadPromise;
}

/**
 * Invalidate the cache. Next access will reload from DB.
 */
export function invalidateRoleCache(): void {
  roleCache = null;
  loadPromise = null;
}

/**
 * Resolve a role name to its capability set.
 * Returns an empty set for unknown roles.
 */
export async function resolveCapabilities(roleName: string): Promise<Set<string>> {
  // super_admin shortcut — always all capabilities
  if (roleName === "super_admin") {
    return new Set(ALL_CAPABILITIES);
  }

  await ensureLoaded();
  return roleCache?.get(roleName)?.capabilities ?? new Set();
}

/**
 * Get the numeric level for a role name.
 * Returns -1 for unknown roles.
 */
export async function getRoleLevel(roleName: string): Promise<number> {
  if (isBuiltinRole(roleName)) {
    // For built-in roles, we can use defaults as fallback
    await ensureLoaded();
    return roleCache?.get(roleName)?.level ?? DEFAULT_ROLE_LEVELS[roleName];
  }

  await ensureLoaded();
  return roleCache?.get(roleName)?.level ?? -1;
}

/**
 * Get all role names and their levels (for hierarchy comparisons).
 */
export async function getAllRoleLevels(): Promise<Map<string, number>> {
  await ensureLoaded();
  const levels = new Map<string, number>();
  if (roleCache) {
    for (const [name, entry] of roleCache) {
      levels.set(name, entry.level);
    }
  }
  return levels;
}

/**
 * Get all cached roles as RoleRecord-like objects.
 */
export async function getAllCachedRoles(): Promise<
  Array<{ name: string; capabilities: Set<string>; level: number }>
> {
  await ensureLoaded();
  const result: Array<{ name: string; capabilities: Set<string>; level: number }> = [];
  if (roleCache) {
    for (const [name, entry] of roleCache) {
      result.push({ name, ...entry });
    }
  }
  return result;
}

/**
 * Check if a role name exists in the system.
 */
export async function isValidRole(roleName: string): Promise<boolean> {
  await ensureLoaded();
  return roleCache?.has(roleName) ?? false;
}
