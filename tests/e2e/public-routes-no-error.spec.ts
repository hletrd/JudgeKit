/**
 * Comprehensive public-route crawl for post-deploy smoke.
 *
 * Catches the class of regressions that took down auraedu for 14 hours
 * (server-side DB query throwing inside an RSC render) — those produce
 * a Next.js error shell on the affected route while the rest of the app
 * still returns 200. A single curl on `/` won't notice.
 *
 * This spec hits every guest-reachable route, asserts the response is
 * 200, and asserts the rendered HTML does NOT contain the Next.js error
 * shell markers. Anything past that requires page-specific checks and is
 * covered by `public-shell.spec.ts`.
 *
 * Safe for remote post-deploy smoke. Read-only.
 */

import { test, expect, type Page } from "@playwright/test";

const ERROR_SHELL_MARKERS = [
  /This page couldn['’]t load/i,
  /A server error occurred/i,
  /Application error: a client-side exception has occurred/i,
  /500 Internal Server Error/i,
];

const GUEST_ROUTES = [
  "/",
  "/practice",
  "/contests",
  "/community",
  "/playground",
  "/rankings",
  "/languages",
  "/login",
  "/signup",
  "/forgot-password",
];

async function expectNoErrorShell(page: Page, route: string) {
  const body = await page.content();
  for (const marker of ERROR_SHELL_MARKERS) {
    expect(body, `${route} body must not contain ${marker}`).not.toMatch(marker);
  }
}

test.describe("public routes return without server error shell", () => {
  for (const route of GUEST_ROUTES) {
    test(`GET ${route}`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "networkidle" });
      // 200..399 are acceptable (some routes redirect — e.g. /forgot-password
      // when SMTP is unconfigured may render a 200 with an inline notice).
      const status = response?.status() ?? 0;
      expect(status, `${route} status`).toBeGreaterThanOrEqual(200);
      expect(status, `${route} status`).toBeLessThan(400);

      await expectNoErrorShell(page, route);
    });
  }

  test("auth-gated routes redirect guests to /login", async ({ page }) => {
    // /submissions intentionally allows guest access with a public-problem
    // filter (verified in src/app/(public)/submissions/page.tsx); it is NOT
    // in this list. /dashboard and /workspace are the strictly gated ones.
    const protectedRoutes = ["/dashboard", "/workspace"];
    for (const route of protectedRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page, `${route} should redirect guests`).toHaveURL(/\/login/);
    }
  });

  test("robots.txt and sitemap.xml stay serveable", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Disallow:");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("<urlset");
  });
});
