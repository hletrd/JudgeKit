/**
 * Shared navigation configuration for PublicHeader.
 *
 * Both the public layout and dashboard layout render the same top navbar
 * with the same navigation items. This module centralizes the item
 * definitions so they stay in sync automatically.
 */

import type { ComponentType, SVGProps } from "react";
import {
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Shield,
  Users,
} from "lucide-react";

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

type HeaderItem = {
  href: string;
  label: string;
};

type DropdownItem = {
  href: string;
  label: string;
  capability?: string;
  icon: LucideIcon;
};

/**
 * Build the public navigation items for PublicHeader.
 *
 * Uses the `publicShell.nav.*` i18n namespace. When `capabilities` is
 * provided, capability-gated entries (Groups, Problem Sets) are
 * surfaced inline so users with those capabilities don't have to hunt
 * for them in the avatar dropdown. The base entries (Practice,
 * Playground, Contests, Rankings, Submissions, Community) always render.
 *
 * Cap-aware insertion order is curated for menu rhythm: capability-gated
 * items are appended after the always-on entries, before any later
 * additions. Adding a new cap-gated entry is a single edit here.
 */
export function getPublicNavItems(
  t: (key: string) => string,
  capabilities?: string[]
): HeaderItem[] {
  const capsSet = capabilities ? new Set(capabilities) : null;
  const items: HeaderItem[] = [
    { href: "/practice", label: t("nav.practice") },
    { href: "/playground", label: t("nav.playground") },
    { href: "/contests", label: t("nav.contests") },
    { href: "/rankings", label: t("nav.rankings") },
    { href: "/submissions", label: t("nav.submissions") },
    { href: "/community", label: t("nav.community") },
    // "Languages" moved to footer — it is a reference page, not a primary action.
    // See: PublicFooter (always includes the Languages link).
  ];

  // Cap-aware additions for instructors / group leaders / problem-set authors.
  // Without these, those users would have to dig into the avatar dropdown
  // for primary work (Groups, Problem Sets). When capabilities are not
  // supplied (e.g. unauthenticated public layout), these are not surfaced.
  if (capsSet) {
    if (capsSet.has("groups.view_all") || capsSet.has("groups.create")) {
      items.push({ href: "/groups", label: t("nav.groups") });
    }
    if (capsSet.has("problem_sets.create")) {
      items.push({ href: "/problem-sets", label: t("nav.problemSets") });
    }
  }

  return items;
}

/**
 * Build the auth action items (Sign In / Sign Up) for PublicHeader.
 * Uses the `auth.*` i18n namespace.
 */
export function getPublicNavActions(
  tAuth: (key: string) => string,
  publicSignupEnabled: boolean
): HeaderItem[] {
  return [
    { href: "/login", label: tAuth("signIn") },
    ...(publicSignupEnabled ? [{ href: "/signup", label: tAuth("signUp") }] : []),
  ];
}

/**
 * Dropdown menu item definitions for the authenticated user.
 *
 * Per cycle-1 IA cleanup, items already present in the top nav
 * (Practice, Contests, Submissions) are NOT repeated here. The dropdown
 * is reserved for personal/account items and capability-gated workspace
 * items (Groups, Problem Sets, Admin) that have no top-nav presence.
 *
 * `label` is a `publicShell.nav.*` i18n key suffix.
 * `capability`, when set, gates the item behind the corresponding
 * capability. When absent, the item is always shown.
 * `icon` is rendered directly in the dropdown — no string-keyed map.
 *
 * Capability checks must stay aligned with the admin landing
 * (`ADMIN_NAV_GROUPS` in `src/lib/navigation/admin-nav.ts`) and the
 * cap definitions in `src/lib/capabilities/*`.
 */
const DROPDOWN_ITEM_DEFINITIONS: DropdownItem[] = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "profile", icon: Settings },
  { href: "/submissions?scope=mine", label: "mySubmissions", icon: ClipboardList },
  { href: "/groups", label: "groups", icon: Users },
  { href: "/problem-sets", label: "problemSets", icon: FolderOpen },
  { href: "/dashboard/admin", label: "admin", capability: "system.settings", icon: Shield },
];

/**
 * Build the dropdown menu items for the authenticated user.
 *
 * Uses capability-based filtering when `capabilities` is available.
 * When capabilities are absent (e.g. session not yet resolved), only
 * items that require no specific capability are shown.
 */
export function getDropdownItems(capabilities?: string[]): DropdownItem[] {
  const capsSet = capabilities ? new Set(capabilities) : null;

  return DROPDOWN_ITEM_DEFINITIONS.filter((item) => {
    if (!item.capability) return true;
    return capsSet?.has(item.capability) ?? false;
  });
}

export type { DropdownItem };
