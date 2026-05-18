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

  test("guest visitor still gets 404 (no contest existence leak)", async ({ page, context }) => {
    await context.clearCookies();
    const response = await page.goto(`/contests/${NON_EXISTENT_CONTEST_ID}`, {
      waitUntil: "domcontentloaded",
    });
    // Guests must NOT see the inline gate — that would acknowledge the
    // existence of the (possibly private) contest to anonymous callers.
    // Either a 404 or a redirect to /login is acceptable.
    const status = response?.status() ?? 0;
    expect(
      status === 404 || page.url().includes("/login"),
      `guest should be redirected to login or get 404; got status=${status}, url=${page.url()}`,
    ).toBeTruthy();
  });
});
