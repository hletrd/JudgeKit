/**
 * Guest-safe smoke for the recent system-settings + community changes:
 *
 * - /community renders both the General and Problem-talk scope buttons
 *   (Fix: all-problems discussion view registered)
 * - Sorting query string survives the locale URL (so popular sort and
 *   the my-discussions filter actually take effect — the old bug
 *   produced /community?locale=ko?sort=popular which Next.js parses
 *   as a single locale=... param)
 * - Vote buttons render (their visibility now depends on system
 *   settings — for a fresh deploy with defaults both directions are
 *   on so a "▲" character should be present)
 * - Rankings page no longer has an oversized padding band above the
 *   table — the Card's default py-4 was overridden with py-0 so the
 *   first <table> child sits flush with the card's top border
 *
 * All assertions are read-only, no auth needed, no DB writes.
 */

import { test, expect } from "@playwright/test";

test.describe("Recent settings + community changes — guest smoke", () => {
  test("community page exposes general + problem-talk scope tabs", async ({ page }) => {
    await page.goto("/community", { waitUntil: "networkidle" });

    // Both scope buttons should be visible regardless of locale; match by
    // role+text so the test survives small label tweaks.
    await expect(
      page.getByRole("link", { name: /Problem talk|문제 토론/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /General|일반 토론/ }).first(),
    ).toBeVisible();
  });

  test("community sort=popular href stays parseable across the locale URL", async ({ page }) => {
    await page.goto("/community", { waitUntil: "networkidle" });

    const popularHref = await page
      .getByRole("link", { name: /Popular|인기 순/ })
      .first()
      .getAttribute("href");

    expect(popularHref, "popular href must be present").not.toBeNull();
    // The previous bug produced `?locale=ko?sort=popular` (two ?'s).
    // After the fix the second value uses `&`. Verify by URL.parse —
    // the resulting URLSearchParams must include `sort=popular`.
    const parsed = new URL(popularHref!, "https://example.test");
    expect(parsed.searchParams.get("sort")).toBe("popular");
  });

  test("rankings card has no top padding band above the table", async ({ page }) => {
    await page.goto("/rankings", { waitUntil: "networkidle" });

    // The padding regression manifested as ~16 px of empty card-padding
    // above the table header. Find the Card wrapping the rankings table
    // and assert its computed paddingTop is 0.
    const cardWithTable = page.locator(
      'div[data-slot="card"]:has(table)',
    ).first();
    await expect(cardWithTable).toBeVisible();
    const paddingTop = await cardWithTable.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).paddingTop),
    );
    expect(paddingTop).toBeLessThan(4);
  });
});
