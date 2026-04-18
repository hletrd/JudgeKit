import { test } from "@playwright/test";

test("full contest navigation test", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    console.log("PAGE ERROR:", err.message.slice(0, 200));
    errors.push(err.message);
  });

  await page.goto("/login");
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) throw new Error('E2E_USERNAME and E2E_PASSWORD env vars required');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  // Sidebar -> contests list
  await page.locator('a[href="/dashboard/contests"]').first().click();
  await page.waitForURL("**/dashboard/contests**", { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  console.log(`sidebar->contests: ${errors.length} errors`);

  // Contests list -> create
  const create = page.locator('a[href="/dashboard/contests/create"]');
  if (await create.isVisible({ timeout: 3000 }).catch(() => false)) {
    const e1 = errors.length;
    await create.click();
    await page.waitForURL("**/dashboard/contests/create**", { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    console.log(`list->create: ${errors.length - e1} errors, url=${page.url()}`);
  }

  // Create -> sidebar problems (from contest page)
  const prob = page.locator('a[href="/dashboard/problems"]').first();
  if (await prob.isVisible({ timeout: 3000 }).catch(() => false)) {
    const e2 = errors.length;
    await prob.click();
    await page.waitForURL("**/dashboard/problems**", { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    console.log(`create->problems: ${errors.length - e2} errors, url=${page.url()}`);
  }

  // Go back to contests via sidebar
  await page.locator('a[href="/dashboard/contests"]').first().click();
  await page.waitForURL("**/dashboard/contests**", { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  // Click a real contest
  const detail = page.locator('a[href*="/dashboard/contests/"]:not([href*="create"]):not([href*="join"])').first();
  if (await detail.isVisible({ timeout: 3000 }).catch(() => false)) {
    const e3 = errors.length;
    await detail.click();
    await page.waitForURL(/\/dashboard\/contests\/[^/]+/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    console.log(`list->detail: ${errors.length - e3} errors, url=${page.url()}`);

    // From detail -> sidebar dashboard
    const dash = page.locator('a[href="/dashboard"]').first();
    if (await dash.isVisible({ timeout: 2000 }).catch(() => false)) {
      const e4 = errors.length;
      await dash.click();
      await page.waitForURL("**/dashboard**", { timeout: 10000 });
      await page.waitForLoadState("networkidle");
      console.log(`detail->dashboard: ${errors.length - e4} errors, url=${page.url()}`);
    }
  }

  console.log(`\nTOTAL: ${errors.length} errors`);
});
