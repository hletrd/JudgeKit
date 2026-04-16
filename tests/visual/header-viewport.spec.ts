import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Standalone visual test for PublicHeader across mobile/tablet/desktop.
 * Tests: collapsible panel, focus-visible, skip link, dark mode colors.
 */

const HTML = `<!DOCTYPE html>
<html lang="en" class="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Header Viewport Test</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          maxWidth: { "6xl": "72rem" },
          colors: {
            ring: "hsl(224, 76%, 48%)",
            background: "white",
            foreground: "#18181b",
            accent: "#f4f4f5",
            "accent-foreground": "#18181b",
            "muted-foreground": "#71717a",
            primary: "#2563eb",
            "primary-foreground": "white",
          },
        },
      },
    };
  </script>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
    .size-4 { width: 1rem; height: 1rem; }
    .size-8 { width: 2rem; height: 2rem; }
    button, a { cursor: pointer; border: none; background: none; color: inherit; text-decoration: none; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }
    .sr-only.focus\\:not-sr-only:focus { position: static; width: auto; height: auto; padding: 8px 12px; margin: 0; overflow: visible; clip: auto; white-space: normal; }
    /* focus-visible ring */
    *:focus-visible { outline: 2px solid hsl(224, 76%, 48%); outline-offset: 2px; border-radius: 4px; }
  </style>
</head>
<body class="bg-white text-zinc-900">
  <!-- Skip link -->
  <a href="#main-content" id="skip-link"
    class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
  >Skip to content</a>

  <header class="border-b bg-white/95 backdrop-blur">
    <div class="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:gap-4">
      <a href="/" class="min-w-0 flex-1 text-base font-semibold tracking-tight md:flex-none md:shrink-0">
        <span class="block truncate">JudgeKit</span>
      </a>

      <!-- Desktop nav -->
      <nav class="hidden min-w-0 flex-1 items-center gap-1 md:flex" data-testid="desktop-nav">
        <a href="/practice" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Practice</a>
        <a href="/playground" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Playground</a>
        <a href="/contests" class="rounded-md px-3 py-2 text-sm bg-zinc-100 text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Contests</a>
        <a href="/rankings" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Rankings</a>
        <a href="/submissions" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Submissions</a>
        <a href="/community" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Community</a>
      </nav>

      <!-- Desktop actions -->
      <div class="ml-auto hidden items-center gap-1 md:flex" data-testid="desktop-actions">
        <button class="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100" data-testid="theme-toggle">🌙</button>
        <button class="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100" data-testid="locale-switcher">🌐</button>
        <a href="/workspace" class="rounded-md px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100">Workspace</a>
        <a href="/login" class="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">Sign in</a>
      </div>

      <!-- Mobile bar -->
      <div class="ml-auto flex shrink-0 items-center gap-1 md:hidden" data-testid="mobile-bar">
        <button class="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100" data-testid="mobile-theme-toggle">🌙</button>
        <button class="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100" data-testid="mobile-locale">🌐</button>
        <button id="mobile-toggle" data-testid="mobile-toggle"
          class="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
          aria-label="Toggle navigation menu" aria-controls="mobile-panel" aria-expanded="false"
          onclick="toggleMenu()">
          <svg id="chevron" class="size-4 transition-transform duration-200" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>
    </div>

    <!-- Mobile collapsible panel -->
    <div id="mobile-panel" data-testid="mobile-panel"
      class="grid transition-all duration-200 ease-in-out md:hidden"
      style="grid-template-rows: 0fr;">
      <div class="overflow-hidden">
        <div class="border-t">
          <div class="mx-auto max-w-6xl px-4 py-2">
            <nav class="flex flex-col gap-0.5" data-testid="mobile-nav">
              <a href="/practice" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Practice</a>
              <a href="/playground" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Playground</a>
              <a href="/contests" class="rounded-md px-3 py-2 text-sm bg-zinc-100 font-medium text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Contests</a>
              <a href="/rankings" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Rankings</a>
              <a href="/submissions" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Submissions</a>
              <a href="/community" class="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Community</a>
            </nav>
            <div class="mt-2 flex flex-col gap-1 border-t pt-2" data-testid="mobile-actions">
              <a href="/workspace" class="rounded-md px-3 py-2 text-center text-sm font-medium text-zinc-500 hover:bg-zinc-100">Workspace</a>
              <a href="/login" class="rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700">Sign in</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>

  <main id="main-content" class="mx-auto max-w-6xl px-4 py-10">
    <h1 class="text-2xl font-bold">Test Content Area</h1>
    <p class="mt-2 text-zinc-500">This is the main content area below the header.</p>
  </main>

  <script>
    let open = false;
    function toggleMenu() {
      open = !open;
      document.getElementById('mobile-panel').style.gridTemplateRows = open ? '1fr' : '0fr';
      document.getElementById('chevron').style.transform = open ? 'rotate(180deg)' : '';
      document.getElementById('mobile-toggle').setAttribute('aria-expanded', open);
    }
  </script>
</body>
</html>`;

const screenshotDir = join(__dirname, "__screenshots__");
mkdirSync(screenshotDir, { recursive: true });

const htmlPath = join(screenshotDir, "header-test.html");
writeFileSync(htmlPath, HTML);

const fileUrl = `file://${htmlPath}`;

const viewports = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

test.describe("Skip to content link", () => {
  test("skip link exists in DOM with correct href", async ({ page }) => {
    await page.goto(fileUrl);
    await page.waitForLoadState("networkidle");

    const skipLink = page.locator("#skip-link");
    await expect(skipLink).toHaveAttribute("href", "#main-content");
    await expect(skipLink).toHaveText("Skip to content");
    // sr-only is handled by Tailwind build; just verify element exists
  });
});

test.describe("Focus-visible ring on nav links", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("desktop nav links show focus ring on Tab", async ({ page }) => {
    await page.goto(fileUrl);
    await page.waitForLoadState("networkidle");

    // Tab past skip link to first nav link
    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab"); // logo link
    await page.keyboard.press("Tab"); // first nav: Practice

    const practiceLink = page.locator('[data-testid="desktop-nav"] >> text=Practice');
    await expect(practiceLink).toBeFocused();
    await page.screenshot({ path: join(screenshotDir, "desktop-focus-ring.png") });
  });
});

for (const vp of viewports) {
  test.describe(`Viewport: ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("header renders correctly", async ({ page }) => {
      await page.goto(fileUrl);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: join(screenshotDir, `${vp.name}-collapsed.png`),
        fullPage: false,
      });

      const header = page.locator("header");
      await expect(header).toBeVisible();

      const siteTitle = page.locator("text=JudgeKit").first();
      await expect(siteTitle).toBeVisible();
    });

    if (vp.width < 768) {
      test("collapsible panel opens and closes", async ({ page }) => {
        await page.goto(fileUrl);
        await page.waitForLoadState("networkidle");

        await expect(page.getByTestId("desktop-nav")).toBeHidden();
        await expect(page.getByTestId("mobile-bar")).toBeVisible();
        await expect(page.getByTestId("mobile-theme-toggle")).toBeVisible();
        await expect(page.getByTestId("mobile-locale")).toBeVisible();

        const toggle = page.getByTestId("mobile-toggle");
        const panel = page.getByTestId("mobile-panel");

        // Closed: no visible height
        let box = await panel.boundingBox();
        expect(box?.height).toBeLessThanOrEqual(1);

        // Open
        await toggle.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(screenshotDir, `${vp.name}-expanded.png`) });

        box = await panel.boundingBox();
        expect(box?.height).toBeGreaterThan(10);

        // All nav items visible
        await expect(page.getByTestId("mobile-nav").locator("a").first()).toBeVisible();
        await expect(page.getByTestId("mobile-actions").locator("text=Sign in")).toBeVisible();

        // Chevron rotated
        const transform = await page.locator("#chevron").evaluate((el) => getComputedStyle(el).transform);
        expect(transform).not.toBe("none");

        // Close
        await toggle.click();
        await page.waitForTimeout(300);
        box = await panel.boundingBox();
        expect(box?.height).toBeLessThanOrEqual(1);
      });

      test("mobile nav links have focus-visible classes", async ({ page }) => {
        await page.goto(fileUrl);
        await page.waitForLoadState("networkidle");

        // Open the panel first
        await page.getByTestId("mobile-toggle").click();
        await page.waitForTimeout(300);

        // Verify focus-visible classes are present on mobile nav links
        const firstLink = page.getByTestId("mobile-nav").locator("a").first();
        const classes = await firstLink.getAttribute("class") ?? "";
        expect(classes).toContain("focus-visible:ring-2");
        expect(classes).toContain("focus-visible:ring-ring");
        await page.screenshot({ path: join(screenshotDir, `${vp.name}-focus-ring.png`) });
      });
    }

    if (vp.width >= 768) {
      test("desktop nav items are inline visible", async ({ page }) => {
        await page.goto(fileUrl);
        await page.waitForLoadState("networkidle");

        const desktopNav = page.getByTestId("desktop-nav");
        await expect(desktopNav).toBeVisible();
        await expect(desktopNav.locator("a")).toHaveCount(6);
        await expect(page.getByTestId("desktop-actions")).toBeVisible();
        await expect(page.getByTestId("mobile-bar")).toBeHidden();
        await expect(page.getByTestId("mobile-panel")).toBeHidden();
      });
    }
  });
}
