import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const disableMinify = process.env.DISABLE_MINIFY === "1";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: disableMinify,
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
