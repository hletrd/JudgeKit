/**
 * E2E tests for the Contest Participant Audit page.
 *
 * Tests navigation from contest detail → participant audit and verifies
 * all four sections render correctly.
 *
 * Run against a live server:
 *   PLAYWRIGHT_BASE_URL=<from .env> E2E_USERNAME=<from .env> E2E_PASSWORD='<from .env>' npx playwright test tests/e2e/contest-participant-audit.spec.ts
 */

import { test, expect } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const NEW_PASSWORD =
  process.env.E2E_NEW_PASSWORD || DEFAULT_CREDENTIALS.password;

async function login(page: import("@playwright/test").Page) {
  await loginWithCredentials(
    page,
    DEFAULT_CREDENTIALS.username,
    DEFAULT_CREDENTIALS.password,
    { allowPasswordChange: true }
  );
  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#newPassword").fill(NEW_PASSWORD);
    await page.locator("#confirmPassword").fill(NEW_PASSWORD);
    await page
      .getByRole("button", { name: /Change Password|비밀번호 변경/ })
      .click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  }
}

test.describe("Contest Participant Audit", () => {
  test("navigate to participant audit page from contest submissions tab", async ({
    page,
  }) => {
    await login(page);

    // Go to contests list
    await page.goto("/dashboard/contests");
    await page.waitForLoadState("networkidle");

    // Find the first contest link and click
    const contestLink = page
      .locator("a[href*='/dashboard/contests/']")
      .first();
    const isVisible = await contestLink.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(true, "No contests available to test");
      return;
    }

    await contestLink.click();
    await page.waitForLoadState("networkidle");

    // Click on Submissions tab
    const submissionsTab = page.getByRole("tab", {
      name: /Submissions|제출/,
    });
    const tabExists = await submissionsTab.isVisible().catch(() => false);
    if (!tabExists) {
      test.skip(true, "Submissions tab not visible (might be student view)");
      return;
    }
    await submissionsTab.click();
    await page.waitForLoadState("networkidle");

    // Find a participant link in the status board
    const participantLink = page
      .locator("a[href*='/participant/']")
      .first();
    const hasParticipants = await participantLink
      .isVisible()
      .catch(() => false);
    if (!hasParticipants) {
      test.skip(true, "No participants in this contest");
      return;
    }

    await participantLink.click();
    await page.waitForLoadState("networkidle");

    // Verify URL contains /participant/
    expect(page.url()).toContain("/participant/");

    // Verify header section renders (student name)
    const heading = page.locator("h2");
    await expect(heading).toBeVisible();

    // Verify back link exists
    const backLink = page.locator(
      "a[href*='/dashboard/contests/']"
    ).first();
    await expect(backLink).toBeVisible();
  });

  test("participant audit page renders all sections", async ({ page }) => {
    await login(page);

    await page.goto("/dashboard/contests");
    await page.waitForLoadState("networkidle");

    const contestLink = page
      .locator("a[href*='/dashboard/contests/']")
      .first();
    const isVisible = await contestLink.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(true, "No contests available to test");
      return;
    }

    await contestLink.click();
    await page.waitForLoadState("networkidle");

    const submissionsTab = page.getByRole("tab", {
      name: /Submissions|제출/,
    });
    const tabExists = await submissionsTab.isVisible().catch(() => false);
    if (!tabExists) {
      test.skip(true, "Submissions tab not visible");
      return;
    }
    await submissionsTab.click();
    await page.waitForLoadState("networkidle");

    const participantLink = page
      .locator("a[href*='/participant/']")
      .first();
    const hasParticipants = await participantLink
      .isVisible()
      .catch(() => false);
    if (!hasParticipants) {
      test.skip(true, "No participants in this contest");
      return;
    }

    await participantLink.click();
    await page.waitForLoadState("networkidle");

    // Verify header with rank/score badges
    const badges = page.locator("[data-slot='badge']");
    await expect(badges.first()).toBeVisible();

    // Verify Solving Timeline section (card with table)
    const cards = page.locator("[data-slot='card']");
    const cardCount = await cards.count();
    // At minimum: solving timeline + submission history = 2 cards
    expect(cardCount).toBeGreaterThanOrEqual(2);

    // Verify Submission History section renders
    const submissionHistoryTitle = page.getByText(
      /Submission History|제출 내역/
    );
    await expect(submissionHistoryTitle).toBeVisible();

    // Verify Solving Timeline section renders
    const solvingTimelineTitle = page.getByText(
      /Solving Timeline|풀이 타임라인/
    );
    await expect(solvingTimelineTitle).toBeVisible();
  });

  test("back link returns to contest page", async ({ page }) => {
    await login(page);

    await page.goto("/dashboard/contests");
    await page.waitForLoadState("networkidle");

    const contestLink = page
      .locator("a[href*='/dashboard/contests/']")
      .first();
    const isVisible = await contestLink.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(true, "No contests available to test");
      return;
    }

    await contestLink.click();
    await page.waitForLoadState("networkidle");
    const contestUrl = page.url();

    const submissionsTab = page.getByRole("tab", {
      name: /Submissions|제출/,
    });
    const tabExists = await submissionsTab.isVisible().catch(() => false);
    if (!tabExists) {
      test.skip(true, "Submissions tab not visible");
      return;
    }
    await submissionsTab.click();
    await page.waitForLoadState("networkidle");

    const participantLink = page
      .locator("a[href*='/participant/']")
      .first();
    const hasParticipants = await participantLink
      .isVisible()
      .catch(() => false);
    if (!hasParticipants) {
      test.skip(true, "No participants in this contest");
      return;
    }

    await participantLink.click();
    await page.waitForLoadState("networkidle");

    // Click back link
    const backLink = page.locator(
      "a[href*='/dashboard/contests/']"
    ).first();
    await backLink.click();
    await page.waitForLoadState("networkidle");

    // Should be back on the contest detail page
    expect(page.url()).toBe(contestUrl);
  });
});
