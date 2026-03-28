import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://oj-internal.maum.ai';
const USERNAME = process.env.E2E_USERNAME || 'admin';
const PASSWORD = process.env.E2E_PASSWORD || 'mcl1234~';

test('capture all contest page errors', async ({ page }) => {
  const errors: { url: string; msg: string }[] = [];
  page.on('console', m => {
    if (m.type() === 'error') errors.push({ url: page.url(), msg: m.text().slice(0, 500) });
  });
  page.on('pageerror', e => {
    errors.push({ url: page.url(), msg: `PAGE_ERROR: ${e.message.slice(0, 500)}` });
  });

  // Login
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/(dashboard|change-password)/, { timeout: 15000 });
  console.log('Logged in:', page.url());

  // Contest list
  await page.goto(`${BASE_URL}/dashboard/contests`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log(`After list page: ${errors.length} errors`);

  // Discover contest links
  const contestLinks = await page.$$eval(
    'a[href*="/dashboard/contests/"]',
    els => [...new Set(
      els.map(el => el.getAttribute('href'))
        .filter(h => h && !h.endsWith('/contests') && !h.includes('create') && !h.includes('join'))
    )]
  );
  console.log(`Found ${contestLinks.length} contest links:`, contestLinks.slice(0, 5));

  // Visit each contest detail page
  for (const link of contestLinks.slice(0, 3)) {
    const url = link!.startsWith('http') ? link! : `${BASE_URL}${link}`;
    console.log(`\n--- ${link} ---`);
    const before = errors.length;

    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);

    const body = await page.textContent('body');
    if (body?.includes('Application error')) {
      console.log('  *** APPLICATION ERROR PAGE ***');
    }

    // Click every tab
    const tabs = await page.$$('[data-slot="tabs-trigger"]');
    for (const tab of tabs) {
      const label = (await tab.textContent())?.trim();
      console.log(`  Tab: "${label}"`);
      try {
        await tab.click();
        await page.waitForTimeout(2000);
      } catch {}
    }
    console.log(`  Errors on this page: ${errors.length - before}`);
  }

  // Print unique errors
  console.log('\n========== ALL UNIQUE ERRORS ==========');
  console.log(`Total errors: ${errors.length}`);
  const seen = new Set<string>();
  for (const e of errors) {
    const key = e.msg.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`\n[${e.url}]\n  ${e.msg}`);
  }

  expect(errors.length).toBe(0);
});
