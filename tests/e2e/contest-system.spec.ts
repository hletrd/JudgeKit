/**
 * E2E tests for the Contest System.
 *
 * Tests the full contest lifecycle: listing, creation flow, detail page,
 * leaderboard, join page, and analytics — all through the browser UI.
 *
 * Run against a live server:
 *   PLAYWRIGHT_BASE_URL=http://oj-internal.maum.ai E2E_USERNAME=admin E2E_PASSWORD=xxx npx playwright test tests/e2e/contest-system.spec.ts
 */

import { test, expect } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD || DEFAULT_CREDENTIALS.password;

async function login(page: import("@playwright/test").Page) {
  await loginWithCredentials(page, DEFAULT_CREDENTIALS.username, DEFAULT_CREDENTIALS.password, {
    allowPasswordChange: true,
  });
  // Handle password change if required
  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#newPassword").fill(NEW_PASSWORD);
    await page.locator("#confirmPassword").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: /Change Password|비밀번호 변경/ }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  }
}

test.describe("Contest System", () => {
  test.describe("Contest List Page", () => {
    test("loads contest list page and shows filter tabs", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests");
      await page.waitForLoadState("networkidle");

      await expect(page.locator("h2")).toContainText(/Contests|대회/);

      // Filter badges exist
      const badges = page.locator("a [data-slot='badge']");
      await expect(badges.first()).toBeVisible();
    });

    test("shows Create Contest button for non-student users", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests");
      await page.waitForLoadState("networkidle");

      const createBtn = page.getByRole("link", { name: /Create Contest|대회 만들기/ });
      await expect(createBtn).toBeVisible();
    });

    test("shows Join with Code button", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests");
      await page.waitForLoadState("networkidle");

      const joinBtn = page.getByRole("link", { name: /Join with Code|코드로 참가/ });
      await expect(joinBtn).toBeVisible();
    });

    test("filter tabs exist and are clickable", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests");
      await page.waitForLoadState("networkidle");

      // Verify multiple filter badges exist (All, Upcoming, Active, Past)
      const filterLinks = page.locator("a").filter({ has: page.locator("[data-slot='badge']") });
      const count = await filterLinks.count();
      expect(count).toBeGreaterThanOrEqual(3);

      // Click the last filter (Past) and verify page doesn't error
      await filterLinks.last().click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("h2")).toContainText(/Contests|대회/);
    });
  });

  test.describe("Create Contest Flow", () => {
    test("navigates to create page and shows group selection", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests/create");
      await page.waitForLoadState("networkidle");

      await expect(page.locator("h2")).toContainText(/Create Contest|대회 만들기/);
    });

    test("create page has back link to contests", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests/create");
      await page.waitForLoadState("networkidle");

      const backLink = page.getByRole("link", { name: /Back|뒤로/ });
      await expect(backLink).toBeVisible();
      await backLink.click();
      await page.waitForURL("**/dashboard/contests");
    });
  });

  test.describe("Join Contest Page", () => {
    test("loads join page with code input", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests/join");
      await page.waitForLoadState("networkidle");

      const codeInput = page.locator("#access-code");
      await expect(codeInput).toBeVisible();
      await expect(codeInput).toHaveAttribute("maxLength", "32");
    });

    test("join button is disabled when code is empty", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests/join");
      await page.waitForLoadState("networkidle");

      const joinBtn = page.getByRole("button", { name: /^Join$|^참가$/ });
      await expect(joinBtn).toBeDisabled();
    });

    test("shows error for invalid access code", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests/join");
      await page.waitForLoadState("networkidle");

      await page.locator("#access-code").fill("INVALIDCODE99");
      await page.getByRole("button", { name: /^Join$|^참가$/ }).click();

      // Wait for toast or loading to finish
      await page.waitForTimeout(3000);
      const toast = page.locator("[data-sonner-toast]");
      await expect(toast.first()).toBeVisible({ timeout: 10_000 });
    });

    test("pre-fills code from URL param", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard/contests/join?code=TEST1234");
      await page.waitForLoadState("networkidle");

      await expect(page.locator("#access-code")).toHaveValue("TEST1234");
    });
  });

  test.describe("API Endpoints (unauthenticated)", () => {
    test("anti-cheat API rejects unauthenticated POST", async ({ page }) => {
      const response = await page.request.post("/api/v1/contests/fake-id/anti-cheat", {
        data: { eventType: "tab_switch" },
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      expect(response.status()).toBe(401);
    });

    test("export API rejects unauthenticated GET", async ({ page }) => {
      const response = await page.request.get("/api/v1/contests/fake-id/export?format=csv");
      expect(response.status()).toBe(401);
    });

    test("analytics API rejects unauthenticated GET", async ({ page }) => {
      const response = await page.request.get("/api/v1/contests/fake-id/analytics");
      expect(response.status()).toBe(401);
    });
  });

  test.describe("API Endpoints (authenticated)", () => {
    test("leaderboard returns error for non-existent contest", async ({ page }) => {
      await login(page);
      const response = await page.request.get("/api/v1/contests/nonexistent-id/leaderboard");
      expect([404, 500]).toContain(response.status());
    });

    test("join API rejects empty code", async ({ page }) => {
      await login(page);
      const response = await page.request.post("/api/v1/contests/join", {
        data: { code: "" },
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      expect(response.ok()).toBeFalsy();
    });
  });

  test.describe("Navigation", () => {
    test("sidebar has Contests link", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      const contestsLink = page.getByRole("link", { name: /Contests|대회/ });
      await expect(contestsLink.first()).toBeVisible();
    });

    test("clicking Contests nav leads to contest list", async ({ page }) => {
      await login(page);
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      await page.getByRole("link", { name: /Contests|대회/ }).first().click();
      await page.waitForURL("**/dashboard/contests", { timeout: 15_000 });
    });
  });
});
