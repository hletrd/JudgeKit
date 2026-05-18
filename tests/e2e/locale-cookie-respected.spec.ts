/**
 * Regression guard for the 2026-05-18 locale-toggle fix.
 *
 * Before the fix, SEO-deterministic public routes (/, /practice, /contests,
 * /community, /playground, /rankings, /languages) forced DEFAULT_LOCALE for
 * unauthenticated callers regardless of any explicit `locale` cookie. The
 * locale switcher set the cookie and reloaded, the page came back in English,
 * the switcher reverted, and users could not change language without logging
 * in.
 *
 * `src/i18n/request.ts` and `src/proxy.ts` now honor the cookie first and
 * fall through to DEFAULT_LOCALE only when no cookie is present (so crawlers
 * still see canonical English).
 *
 * This spec is intentionally fast and safe to run against a live remote
 * deployment as a post-deploy smoke check — it does not mutate any state.
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3110";

// Pages that are SEO-deterministic for guests. The bug only manifested
// here — auth/login pages were always cookie-respecting.
const SEO_DETERMINISTIC_PUBLIC_ROUTES = [
  "/",
  "/practice",
  "/contests",
  "/community",
  "/playground",
  "/rankings",
  "/languages",
];

test.describe("locale cookie is honored on SEO-deterministic public routes", () => {
  for (const route of SEO_DETERMINISTIC_PUBLIC_ROUTES) {
    test(`${route} renders Korean when locale=ko cookie is set`, async ({ page, context }) => {
      const url = new URL(BASE_URL);
      await context.addCookies([
        {
          name: "locale",
          value: "ko",
          domain: url.hostname,
          path: "/",
          sameSite: "Lax",
        },
      ]);

      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status() ?? 0, `${route} should not error`).toBeLessThan(500);
      expect(response?.status() ?? 0, `${route} should be reachable`).toBeLessThan(400);

      // Content-Language must reflect the cookie, not DEFAULT_LOCALE.
      // Note: Vary: Cookie is asserted at the proxy unit-test layer
      // (tests/unit/proxy.test.ts). Next.js's RSC streaming pipeline
      // rewrites the Vary header downstream of our middleware in some
      // build modes, so the e2e layer only checks the visible language
      // behaviour to avoid a false alarm.
      const contentLanguage = response?.headers()["content-language"];
      expect(contentLanguage, `${route} Content-Language header`).toBe("ko");
    });

    test(`${route} renders English (DEFAULT_LOCALE) with no locale cookie`, async ({ page, context }) => {
      await context.clearCookies();

      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status() ?? 0, `${route} should not error`).toBeLessThan(500);
      expect(response?.status() ?? 0, `${route} should be reachable`).toBeLessThan(400);

      const contentLanguage = response?.headers()["content-language"];
      expect(contentLanguage, `${route} Content-Language header`).toBe("en");
    });
  }
});
