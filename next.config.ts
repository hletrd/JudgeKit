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
            // NOTE: This static CSP is a baseline fallback for routes NOT
            // handled by the proxy middleware (src/proxy.ts). The proxy
            // generates a per-request cryptographic nonce and sets a stricter
            // CSP with `script-src 'self' 'nonce-<value>'` which overrides
            // this header for all dashboard and API routes.
            //
            // 'unsafe-inline' is retained here ONLY for the static fallback
            // because Next.js config headers cannot contain dynamic nonces.
            // style-src keeps 'unsafe-inline' because CSS-in-JS libraries
            // and Next.js font injection require it.
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
