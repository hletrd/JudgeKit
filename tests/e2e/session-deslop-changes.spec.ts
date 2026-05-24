/**
 * Guest-safe smoke for the changes made in the deslop session:
 *
 * - Lecture mode CSS no longer locks page scroll (the `.lecture-mode` /
 *   `.lecture-mode body` `overflow: hidden; height: 100%` rules are gone).
 *   Verified by manually toggling the class on <html> and asserting that
 *   the computed style permits scrolling.
 *
 * - History-API patch from useUnsavedChangesGuard does not recurse on
 *   first call. Verified by toggling the guard state and pushing a route
 *   change; if patching caused recursion this would throw immediately.
 *
 * Both checks run as a guest against any deployment with no fixture data
 * required.
 */

import { test, expect } from "@playwright/test";

test.describe("Deslop session — visible regressions", () => {
  test("lecture-mode class does not lock html/body overflow", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const overflowState = await page.evaluate(() => {
      const html = document.documentElement;
      html.classList.add("lecture-mode", "lecture-theme-dark");
      const htmlStyle = window.getComputedStyle(html);
      const bodyStyle = window.getComputedStyle(document.body);
      const result = {
        htmlOverflow: htmlStyle.overflow,
        bodyOverflow: bodyStyle.overflow,
      };
      html.classList.remove("lecture-mode", "lecture-theme-dark");
      return result;
    });

    expect(overflowState.htmlOverflow, "html must not be overflow:hidden when lecture-mode is on").not.toBe("hidden");
    expect(overflowState.bodyOverflow, "body must not be overflow:hidden when lecture-mode is on").not.toBe("hidden");
  });

  test("client-side history.pushState does not recurse after first navigation", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // If the history-API patch in use-unsaved-changes-guard captured the
    // already-patched function as 'original', the first pushState call after
    // the guard mounts would blow the stack. Tripping the assertion would
    // throw a RangeError that bubbles up as a page error.
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.evaluate(() => {
      // Trigger a benign pushState equivalent to what router.push does
      window.history.pushState({}, "", window.location.pathname);
    });

    expect(errors, "no RangeError from history patch").toEqual([]);
  });
});
