"use client";

import { signOut } from "next-auth/react";

/**
 * Known localStorage key prefixes used by the application.
 * Only these keys are cleared on sign-out instead of calling
 * localStorage.clear() which would destroy data from other
 * apps or browser extensions sharing the same origin.
 *
 * When adding a new prefix, update this list and reference the source file:
 * - "oj:"                    — src/hooks/use-source-draft.ts (oj:submission-draft:*, oj:preferred-language:*)
 * - "source-draft-"          — legacy prefix (superseded by "oj:" above, kept for backward compat)
 * - "code-draft-"            — legacy prefix (superseded by "oj:" above, kept for backward compat)
 * - "judgekit_anticheat_"    — src/components/exam/anti-cheat-monitor.tsx (judgekit_anticheat_pending_*)
 * - "compiler:"              — src/components/code/compiler-client.tsx (compiler:language)
 */
const APP_STORAGE_PREFIXES = [
  "oj:",
  "source-draft-",
  "code-draft-",
  "judgekit_anticheat_",
  "compiler:",
];

/**
 * Clear application-owned keys from localStorage and sessionStorage.
 * Avoids the destructive localStorage.clear() which wipes all origin
 * storage including data from browser extensions and other apps.
 */
function clearAppStorage(): void {
  if (typeof window === "undefined") return;

  try {
    // Clear localStorage keys with app prefixes
    const lsKeysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && APP_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        lsKeysToRemove.push(key);
      }
    }
    for (const key of lsKeysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage may be inaccessible in some environments
  }

  try {
    // Clear sessionStorage keys with app prefixes
    const ssKeysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key && APP_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        ssKeysToRemove.push(key);
      }
    }
    for (const key of ssKeysToRemove) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage may be inaccessible in some environments
  }
}

/**
 * Sign-out handler used by PublicHeader (desktop dropdown + mobile drawer).
 * Clears application storage, calls NextAuth signOut, and handles
 * errors gracefully by resetting the loading state.
 *
 * @param setIsSigningOut - React state setter for the loading flag
 * @returns true if sign-out succeeded, false if it failed (caller can show toast)
 */
export async function handleSignOutWithCleanup(
  setIsSigningOut: (value: boolean) => void
): Promise<boolean> {
  setIsSigningOut(true);
  clearAppStorage();

  try {
    await signOut({ callbackUrl: "/login" });
    return true;
  } catch {
    // Reset loading state so the user can retry instead of being stuck
    setIsSigningOut(false);
    return false;
  }
}
