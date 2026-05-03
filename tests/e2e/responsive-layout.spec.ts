/**
 * Responsive layout test suite — mobile / tablet / desktop viewports.
 *
 * Runs against the local Playwright webserver (or PLAYWRIGHT_BASE_URL).
 * Tests public pages across three viewport sizes, checking for layout
 * breakage, horizontal overflow, element visibility, touch target sizes,
 * and viewport-height issues on mobile.
 *
 * Run:
 *   npx playwright test responsive-layout
 *   PLAYWRIGHT_BASE_URL=https://algo.xylolabs.com npx playwright test responsive-layout
 */
import { devices, type Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
const isRemoteRun = (() => {
  if (!baseUrl) return false;
  try {
    const parsed = new URL(baseUrl);
    return parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
})();

// ---------------------------------------------------------------------------
// Viewport definitions
// ---------------------------------------------------------------------------

const VIEWPORTS = {
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, name: "Mobile (iPhone 13)" },
  // iPad Pro 11 portrait (834x1194) sits below the lg: 1024px breakpoint and now
  // collapses to hamburger mode like a wide phone — the intentional behaviour after
  // the md: → lg: nav switch. Use landscape orientation here so the tablet bucket
  // exercises the desktop-nav code path (matching real-world tablet-as-laptop use).
  tablet: { width: 1194, height: 834, isMobile: false, hasTouch: true, name: "Tablet (iPad Pro 11 landscape)" },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, name: "Desktop (1440×900)" },
} as const;

type ViewportKey = keyof typeof VIEWPORTS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: Math.ceil(window.visualViewport?.width ?? window.innerWidth),
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

async function expectNoDuplicateChrome(page: Page) {
  const headers = await page.locator("header").count();
  expect(headers).toBeLessThanOrEqual(1);
  const footers = await page.locator("footer").count();
  expect(footers).toBeLessThanOrEqual(1);
}

async function expectNoFixedOverlap(page: Page) {
  const mainContent = page.locator("main").first();
  if (!(await mainContent.isVisible())) return;
  const mainBox = await mainContent.boundingBox();
  if (!mainBox) return;
  const header = page.locator("header").first();
  if (await header.isVisible()) {
    const headerBox = await header.boundingBox();
    if (headerBox) {
      expect(mainBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Public pages to test
// ---------------------------------------------------------------------------

const PUBLIC_PAGES = [
  { path: "/", heading: /JudgeKit|Write code|구조|코딩/, label: "Homepage" },
  { path: "/practice", heading: /Public problem catalog|공개 문제 카탈로그|Practice|연습/, label: "Practice" },
  { path: "/playground", heading: /Public playground|공개 플레이그라운드|Playground|실행/, label: "Playground" },
  { path: "/rankings", heading: /Rankings|랭킹/, label: "Rankings" },
  { path: "/community", heading: /Community board|커뮤니티 게시판|Community|커뮤니티/, label: "Community" },
  { path: "/submissions", heading: /Submissions|제출|All submissions|모든 제출/, label: "Submissions" },
  { path: "/languages", heading: /Languages|언어|Judge Environments|컴파일/, label: "Languages" },
];

// ---------------------------------------------------------------------------
// Core viewport test — runs per viewport per page
// ---------------------------------------------------------------------------

for (const [key, vp] of Object.entries(VIEWPORTS)) {
  const isMobile = key === "mobile";
  const isTablet = key === "tablet";
  const isDesktop = key === "desktop";

  for (const { path, heading, label } of PUBLIC_PAGES) {
    test(`${vp.name} / ${label}: no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoHorizontalOverflow(page);
    });

    test(`${vp.name} / ${label}: page heading visible`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    });

    test(`${vp.name} / ${label}: no duplicate header/footer`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoDuplicateChrome(page);
    });

    test(`${vp.name} / ${label}: no fixed element overlap`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoFixedOverlap(page);
    });
  }
}

// ---------------------------------------------------------------------------
// Mobile-specific tests
// ---------------------------------------------------------------------------

test.describe("Mobile-specific layout checks", () => {
  const vp = VIEWPORTS.mobile;

  test("mobile: navigation hamburger toggle works", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/", { waitUntil: "networkidle" });
    const header = page.locator("header").first();
    const toggle = header.getByRole("button", { name: /toggle navigation menu/i });

    if (await toggle.isVisible()) {
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expectNoHorizontalOverflow(page);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("mobile: nav links are touch-friendly (44px min)", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/", { waitUntil: "networkidle" });
    const header = page.locator("header").first();
    const toggle = header.getByRole("button", { name: /toggle navigation menu/i });

    if (await toggle.isVisible()) {
      await toggle.click();
      const navLinks = header.locator("nav a:visible");
      const count = await navLinks.count();
      for (let i = 0; i < count; i++) {
        const box = await navLinks.nth(i).boundingBox();
        if (!box) continue;
        expect(
          box.height >= 44 || box.width >= 44,
          `Nav link too small for touch: ${Math.round(box.width)}×${Math.round(box.height)}px`
        ).toBeTruthy();
      }
    }
  });

  test("mobile: submissions page is usable without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/submissions", { waitUntil: "networkidle" });
    // Wait for content to hydrate past skeleton loading
    await page.waitForTimeout(2000);
    // The page should render without horizontal overflow regardless of layout mode
    await expectNoHorizontalOverflow(page);
    // There should be visible content (table, cards, or empty state message)
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasCards = await page.locator("[role='list']").isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no submissions|제출 없음|empty/i).isVisible().catch(() => false);
    const hasCardSlot = await page.locator("[data-slot='card-content']").first().isVisible().catch(() => false);
    expect(hasTable || hasCards || hasEmpty || hasCardSlot, "Page should render some content").toBeTruthy();
  });

  test("mobile: rankings page is usable without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/rankings", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expectNoHorizontalOverflow(page);
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasCards = await page.locator("[role='list']").isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no rankings|랭킹 없음|empty/i).isVisible().catch(() => false);
    expect(hasTable || hasCards || hasEmpty, "Page should render some content").toBeTruthy();
  });

  test("mobile: content fits in viewport for short pages", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/privacy", { waitUntil: "networkidle" });
    const heading = page.getByRole("heading", { name: /Privacy|개인정보/ }).first();
    if (await heading.isVisible()) {
      const box = await heading.boundingBox();
      expect(box?.y ?? 0).toBeLessThan(vp.height);
    }
  });

  test("mobile: viewport height change (address bar) doesn't break layout", async ({ page }) => {
    // Full height (address bar hidden)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expectNoHorizontalOverflow(page);
    await expect(page.locator("header").first()).toBeVisible();

    // Short viewport (address bar visible)
    await page.setViewportSize({ width: 390, height: 600 });
    await expectNoHorizontalOverflow(page);
    await expect(page.locator("header").first()).toBeVisible();

    // Very short viewport (landscape with address bar)
    await page.setViewportSize({ width: 390, height: 400 });
    await expectNoHorizontalOverflow(page);

    // Restore
    await page.setViewportSize({ width: 390, height: 844 });
  });
});

// ---------------------------------------------------------------------------
// Tablet-specific tests
// ---------------------------------------------------------------------------

test.describe("Tablet-specific layout checks", () => {
  const vp = VIEWPORTS.tablet;

  test("tablet: navigation visible without hamburger", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/", { waitUntil: "networkidle" });
    const header = page.locator("header").first();
    const navLinks = header.locator("nav a:visible");
    const count = await navLinks.count();
    expect(count, "Desktop nav links should be visible on tablet").toBeGreaterThan(0);
  });

  test("tablet: submissions page renders without overflow", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/submissions", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expectNoHorizontalOverflow(page);
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasCards = await page.locator("[role='list']").isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no submissions|제출 없음|empty/i).isVisible().catch(() => false);
    const hasCardSlot = await page.locator("[data-slot='card-content']").first().isVisible().catch(() => false);
    expect(hasTable || hasCards || hasEmpty || hasCardSlot, "Page should render some content").toBeTruthy();
  });

  test("tablet: rankings page renders without overflow", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/rankings", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expectNoHorizontalOverflow(page);
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasCards = await page.locator("[role='list']").isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no rankings|랭킹 없음|empty/i).isVisible().catch(() => false);
    expect(hasTable || hasCards || hasEmpty, "Page should render some content").toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Desktop-specific tests
// ---------------------------------------------------------------------------

test.describe("Desktop-specific layout checks", () => {
  const vp = VIEWPORTS.desktop;

  test("desktop: no hamburger menu", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/", { waitUntil: "networkidle" });
    const header = page.locator("header").first();
    const toggle = header.getByRole("button", { name: /toggle navigation menu/i });
    const toggleVisible = await toggle.isVisible().catch(() => false);
    expect(toggleVisible, "Hamburger menu should not be visible on desktop").toBeFalsy();
  });

  test("desktop: submissions page renders without overflow", async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/submissions", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await expectNoHorizontalOverflow(page);
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasCards = await page.locator("[role='list']").isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no submissions|제출 없음|empty/i).isVisible().catch(() => false);
    const hasCardSlot = await page.locator("[data-slot='card-content']").first().isVisible().catch(() => false);
    expect(hasTable || hasCards || hasEmpty || hasCardSlot, "Page should render some content").toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 404 page rendering across viewports
// ---------------------------------------------------------------------------

test.describe("404 page rendering", () => {
  const shouldSkip404 = isRemoteRun; // Double-chrome bug fixed in code (09e6c035) but not yet deployed

  for (const [key, vp] of Object.entries(VIEWPORTS)) {
    test(`${vp.name}: 404 page has no duplicate chrome`, async ({ page }) => {
      test.skip(shouldSkip404, "404 double-chrome fix not yet deployed to production");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/practice/problems/nonexistent-page-404-test", { waitUntil: "networkidle" });
      await expectNoDuplicateChrome(page);
      await expectNoHorizontalOverflow(page);
    });
  }
});

// ---------------------------------------------------------------------------
// Footer consistency across viewports
// ---------------------------------------------------------------------------

test.describe("Footer consistency", () => {
  for (const [key, vp] of Object.entries(VIEWPORTS)) {
    test(`${vp.name}: footer visible and not duplicated`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/", { waitUntil: "networkidle" });
      const footer = page.locator("footer").first();
      if (await footer.isVisible()) {
        const footerCount = await page.locator("footer").count();
        expect(footerCount).toBeLessThanOrEqual(1);
        // Footer should contain privacy link
        const privacyLink = footer.locator("a[href*='/privacy']").first();
        if (await privacyLink.isVisible()) {
          expect(await privacyLink.getAttribute("href")).toContain("/privacy");
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Cross-viewport consistency
// ---------------------------------------------------------------------------

test.describe("Cross-viewport content consistency", () => {
  const PAGES_TO_CHECK = ["/", "/practice", "/rankings", "/submissions"];

  for (const path of PAGES_TO_CHECK) {
    test(`${path}: mobile and desktop render same page title`, async ({ browser }) => {
      // Mobile
      const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mobilePage = await mobileCtx.newPage();
      await mobilePage.goto(path, { waitUntil: "networkidle" });
      const mobileTitle = await mobilePage.title();

      // Desktop
      const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const desktopPage = await desktopCtx.newPage();
      await desktopPage.goto(path, { waitUntil: "networkidle" });
      const desktopTitle = await desktopPage.title();

      expect(mobileTitle).toBe(desktopTitle);

      await mobileCtx.close();
      await desktopCtx.close();
    });
  }
});
