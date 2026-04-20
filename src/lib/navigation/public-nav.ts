/**
 * Shared navigation configuration for PublicHeader.
 *
 * Both the public layout and dashboard layout render the same top navbar
 * with the same navigation items. This module centralizes the item
 * definitions so they stay in sync automatically.
 */

type HeaderItem = {
  href: string;
  label: string;
};

type DropdownItem = {
  href: string;
  label: string;
  capability?: string;
};

/**
 * Build the public navigation items for PublicHeader.
 * Uses the `publicShell.nav.*` i18n namespace.
 */
export function getPublicNavItems(t: (key: string) => string): HeaderItem[] {
  return [
    { href: "/practice", label: t("nav.practice") },
    { href: "/playground", label: t("nav.playground") },
    { href: "/contests", label: t("nav.contests") },
    { href: "/rankings", label: t("nav.rankings") },
    { href: "/submissions", label: t("nav.submissions") },
    { href: "/community", label: t("nav.community") },
  ];
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
 * The `label` field is a `publicShell.nav.*` i18n key suffix.
 * The `capability` field, when set, gates the item behind the
 * corresponding user capability. When absent, the item is always shown.
 * Capability checks must stay aligned with AppSidebar's filterItems().
 * Icons for each item are defined in DROPDOWN_ICONS in public-header.tsx —
 * keep both in sync when adding or removing items.
 */
const DROPDOWN_ITEM_DEFINITIONS: DropdownItem[] = [
  { href: "/dashboard", label: "dashboard" },
  { href: "/dashboard/problems", label: "problems", capability: "problems.create" },
  { href: "/dashboard/groups", label: "groups", capability: "groups.view_all" },
  { href: "/dashboard/submissions", label: "mySubmissions" },
  { href: "/dashboard/contests", label: "contests" },
  { href: "/dashboard/profile", label: "profile" },
  { href: "/dashboard/admin", label: "admin", capability: "system.settings" },
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
