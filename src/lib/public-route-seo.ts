const INDEXABLE_PUBLIC_ROUTE_PREFIXES = [
  "/practice",
  "/contests",
  "/community",
  "/playground",
  "/rankings",
] as const;

const INDEXABLE_PUBLIC_ROUTE_EXACT = ["/"] as const;

export const SEO_ROUTE_MATRIX = [
  {
    route: "/",
    indexable: true,
    localized: true,
    includedInSitemap: true,
    jsonLd: true,
    socialCards: true,
    notes: "Public landing page",
  },
  {
    route: "/practice",
    indexable: true,
    localized: true,
    includedInSitemap: true,
    jsonLd: true,
    socialCards: true,
    notes: "Public problem catalog and detail pages",
  },
  {
    route: "/contests",
    indexable: true,
    localized: true,
    includedInSitemap: true,
    jsonLd: true,
    socialCards: true,
    notes: "Public contest catalog and detail pages",
  },
  {
    route: "/community",
    indexable: true,
    localized: true,
    includedInSitemap: true,
    jsonLd: true,
    socialCards: true,
    notes: "General community board and public thread detail pages",
  },
  {
    route: "/playground",
    indexable: true,
    localized: true,
    includedInSitemap: true,
    jsonLd: true,
    socialCards: true,
    notes: "Public compiler landing page",
  },
  {
    route: "/rankings",
    indexable: true,
    localized: true,
    includedInSitemap: true,
    jsonLd: true,
    socialCards: true,
    notes: "Public rankings page",
  },
  {
    route: "/submissions",
    indexable: false,
    localized: false,
    includedInSitemap: false,
    jsonLd: false,
    socialCards: false,
    notes: "Authenticated personal submission history and detail pages",
  },
  {
    route: "/signup",
    indexable: false,
    localized: false,
    includedInSitemap: false,
    jsonLd: false,
    socialCards: false,
    notes: "Conversion/auth route",
  },
  {
    route: "/login",
    indexable: false,
    localized: false,
    includedInSitemap: false,
    jsonLd: false,
    socialCards: false,
    notes: "Auth route",
  },
  {
    route: "/community/new",
    indexable: false,
    localized: false,
    includedInSitemap: false,
    jsonLd: false,
    socialCards: false,
    notes: "Authenticated thread composer",
  },
] as const;

export const ROBOTS_DISALLOWED_PATHS = [
  "/api",
  "/dashboard",
  "/workspace",
  "/login",
  "/signup",
  "/change-password",
  "/recruit",
  "/community/new",
  "/submissions",
] as const;

function hasPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isIndexablePublicSeoPath(pathname: string) {
  return INDEXABLE_PUBLIC_ROUTE_EXACT.includes(pathname as (typeof INDEXABLE_PUBLIC_ROUTE_EXACT)[number])
    || INDEXABLE_PUBLIC_ROUTE_PREFIXES.some((prefix) => hasPathPrefix(pathname, prefix));
}

export function usesDeterministicPublicLocale(pathname: string) {
  return isIndexablePublicSeoPath(pathname);
}

export function isRobotsDisallowedPublicPath(pathname: string) {
  return ROBOTS_DISALLOWED_PATHS.some((prefix) => hasPathPrefix(pathname, prefix));
}
