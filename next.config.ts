import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const disableMinify = process.env.DISABLE_MINIFY === "1";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: disableMinify,
  serverExternalPackages: ["pg", "drizzle-orm", "@auth/drizzle-adapter"],
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  async redirects() {
    return [
      // Workspace-to-public migration: redirect legacy workspace routes
      {
        source: "/workspace",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/workspace/discussions",
        destination: "/community?filter=mine",
        permanent: false,
      },
      // Phase 4 route consolidation: redirect dashboard duplicates to public pages
      {
        source: "/dashboard/rankings",
        destination: "/rankings",
        permanent: false,
      },
      {
        source: "/dashboard/languages",
        destination: "/languages",
        permanent: false,
      },
      {
        source: "/dashboard/compiler",
        destination: "/playground",
        permanent: false,
      },
      // Control route group merged into dashboard (Phase 4)
      {
        source: "/control",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/control/discussions",
        destination: "/dashboard/admin/discussions",
        permanent: false,
      },
      // Phase 6 route consolidation: more dashboard duplicates → public pages
      {
        source: "/dashboard/submissions",
        destination: "/submissions?scope=mine",
        permanent: false,
      },
      {
        source: "/dashboard/submissions/:id",
        destination: "/submissions/:id",
        permanent: false,
      },
      {
        source: "/dashboard/contests/join",
        destination: "/contests/join",
        permanent: false,
      },
      {
        source: "/dashboard/problems/:id/rankings",
        destination: "/practice/problems/:id/rankings",
        permanent: false,
      },
      // Phase 7 route consolidation: legacy dashboard workspace routes →
      // public counterparts. Internal links have been migrated; these
      // redirects exist for old bookmarks and external links.
      {
        source: "/dashboard/profile",
        destination: "/profile",
        permanent: false,
      },
      {
        source: "/dashboard/problems",
        destination: "/problems",
        permanent: false,
      },
      {
        source: "/dashboard/problems/:path*",
        destination: "/problems/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/groups",
        destination: "/groups",
        permanent: false,
      },
      {
        source: "/dashboard/groups/:path*",
        destination: "/groups/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/problem-sets",
        destination: "/problem-sets",
        permanent: false,
      },
      {
        source: "/dashboard/problem-sets/:path*",
        destination: "/problem-sets/:path*",
        permanent: false,
      },
      // Contests: legacy workspace URL maps to the manage area, which is
      // where instructors/admins came from. Participant deep-links now
      // route to /contests/[id] directly.
      {
        source: "/dashboard/contests",
        destination: "/contests/manage",
        permanent: false,
      },
      {
        source: "/dashboard/contests/create",
        destination: "/contests/manage/create",
        permanent: false,
      },
      {
        source: "/dashboard/contests/:path*",
        destination: "/contests/manage/:path*",
        permanent: false,
      },
    ];
  },
  webpack: disableMinify
    ? (config) => {
        config.optimization.minimize = false;
        return config;
      }
    : undefined,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-XSS-Protection", value: "0" },
          {
            // SEC H-3 — defense-in-depth static fallback. The production
            // CSP is set per-request by src/proxy.ts (Next 16 middleware
            // convention), which injects a per-request nonce into
            // script-src. That header overrides this static one for
            // every matched route. This block is intentionally STRICTER
            // than the runtime CSP so that, if proxy.ts ever stops
            // running on a route, inline scripts break loudly instead
            // of silently allowing XSS bypasses. Operators should treat
            // any browser console "blocked by CSP" report on a
            // proxy-matched route as a wiring bug.
            //
            // style-src keeps 'unsafe-inline' because Next.js's
            // hydrated CSS-in-JS pipeline emits inline <style> tags
            // without a way to add nonces in stable releases.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
