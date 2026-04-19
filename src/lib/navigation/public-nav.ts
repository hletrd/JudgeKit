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
    { href: "/languages", label: t("nav.languages") },
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
