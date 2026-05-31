/**
 * Regression guard for the 2026-05-18 contest access-code gate fix.
 *
 * Before the fix, an authenticated user visiting a private contest URL
 * without an enrollment or access token saw a 404 — the link was a
 * dead end unless they navigated to /contests/join manually and pasted
 * a code. After the fix, the same URL inline-renders ContestJoinClient
 * so the candidate can paste the code on the same page they landed on.
 *
 * This spec uses a randomly-generated contest ID that is guaranteed
 * NOT to exist, simulating an authenticated user holding an
 * unknown/private contest link. Without the fix the page returns 404
 * (notFound()); with the fix the page renders the access-code form.
 *
 * Safe for remote smoke — read-only and uses an ID guaranteed not to
 * collide with real data.
 */

import { test, expect } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const NON_EXISTENT_CONTEST_ID = `nonexistent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

test.describe("private contest URL inline access-code gate", () => {
  test("authenticated user with no access sees inline code-entry form, not 404", async ({ page }) => {
    await loginWithCredentials(
      page,
      DEFAULT_CREDENTIALS.username,
      DEFAULT_CREDENTIALS.password,
      { allowPasswordChange: true },
    );
    // Sail through any forced password-change wall the seed account may
    // present on a fresh DB. The locator chain falls through silently
    // when /change-password is absent.
    if (page.url().includes("/change-password")) {
      await page.locator("#currentPassword").fill(DEFAULT_CREDENTIALS.password);
      await page.locator("#newPassword").fill(DEFAULT_CREDENTIALS.password);
      await page.locator("#confirmPassword").fill(DEFAULT_CREDENTIALS.password);
      await page.getByRole("button", { name: /Change Password|비밀번호 변경/ }).click();
      await page.waitForURL("**/dashboard", { timeout: 15_000 });
    }

    const response = await page.goto(`/contests/${NON_EXISTENT_CONTEST_ID}`, {
      waitUntil: "networkidle",
    });

    // The page itself should not 404 — the gate is rendered server-side
    // alongside the inline ContestJoinClient.
    const status = response?.status() ?? 0;
    expect(status, "private contest URL status").toBeGreaterThanOrEqual(200);
    expect(status, "private contest URL status").toBeLessThan(400);

    // Access-code input must be present on the page.
    const codeInput = page.locator('#access-code, input[placeholder*="code" i], input[placeholder*="코드" i]');
    await expect(codeInput.first(), "inline access-code input visible").toBeVisible({ timeout: 5_000 });
  });

  test("guest visitor does not see the access-code gate (no contest existence leak)", async ({ page, context }) => {
    await context.clearCookies();
    const response = await page.goto(`/contests/${NON_EXISTENT_CONTEST_ID}`, {
      waitUntil: "domcontentloaded",
    });
    const status = response?.status() ?? 0;

    // A redirect to /login or a hard 404 is unambiguously fine.
    if (page.url().includes("/login") || status === 404) {
      return;
    }

    // Otherwise Next.js serves a *streamed* soft-404: the page calls
    // notFound(), but because the route sits under a route-level loading.tsx
    // its not-found UI is wrapped in a Suspense boundary, so the HTTP status
    // stays 200 — documented, expected behavior:
    //   https://nextjs.org/docs/app/api-reference/file-conventions/loading#status-codes
    // That is acceptable for a guest ONLY if no contest existence is leaked,
    // which requires BOTH of the following to hold:
    //   1. the page is explicitly noindex (Next's prescribed soft-404 SEO
    //      mitigation, so crawlers don't index the URL despite the 200), and
    //   2. the inline access-code gate is NOT rendered — rendering it would
    //      acknowledge the (possibly private) contest to an anonymous caller.
    // A private contest and a non-existent one are indistinguishable to a
    // guest: both fall through to this same noindex not-found page.
    expect(status, "guest soft-404 must be a 2xx not-found, never a 5xx").toBeLessThan(400);
    await expect(
      page.locator('meta[name="robots"]').first(),
      "guest not-found page must be marked noindex",
    ).toHaveAttribute("content", /noindex/, { timeout: 5_000 });
    const codeInput = page.locator('#access-code, input[placeholder*="code" i], input[placeholder*="코드" i]');
    await expect(
      codeInput,
      "guest must NOT see the access-code gate (it would leak contest existence)",
    ).toHaveCount(0);
  });
});
