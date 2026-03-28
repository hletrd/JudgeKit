const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 500));
  });
  page.on('pageerror', e => errors.push('PAGE_ERROR: ' + e.message.slice(0, 500)));

  // Login
  console.log('Logging in...');
  await page.goto('http://oj-internal.maum.ai/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('mcl1234~');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
    page.locator('button[type=submit]').click(),
  ]);
  await page.waitForTimeout(3000);
  console.log('After login:', page.url());

  if (page.url().includes('/login')) {
    // Try direct nav with cookie
    await page.goto('http://oj-internal.maum.ai/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('After direct nav:', page.url());
    if (page.url().includes('/login')) {
      console.log('Login failed');
      await browser.close();
      return;
    }
  }

  // Contest list
  console.log('\n=== /dashboard/contests ===');
  errors.length = 0;
  await page.goto('http://oj-internal.maum.ai/dashboard/contests', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('List page errors:', errors.length);

  const links = await page.$$eval('a[href*="/dashboard/contests/"]', els =>
    [...new Set(els.map(e => e.getAttribute('href')).filter(h => h && !h.endsWith('/contests') && !h.includes('create') && !h.includes('join')))]
  );
  console.log('Contest links:', links.slice(0, 5));

  // Visit contests
  for (const link of links.slice(0, 3)) {
    console.log('\n=== ' + link + ' ===');
    const before = errors.length;
    await page.goto('http://oj-internal.maum.ai' + link, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const body = await page.textContent('body').catch(() => '');
    if (body?.includes('Application error')) console.log('  *** APPLICATION ERROR ***');

    // Click tabs
    const tabs = await page.$$('[data-slot="tabs-trigger"]');
    for (const tab of tabs) {
      const label = (await tab.textContent())?.trim();
      console.log('  Tab:', label);
      await tab.click().catch(() => {});
      await page.waitForTimeout(3000);
    }
    console.log('  New errors:', errors.length - before);
  }

  // Print unique errors
  console.log('\n========== ALL UNIQUE ERRORS ==========');
  console.log('Total:', errors.length);
  const seen = new Set();
  for (const e of errors) {
    const key = e.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log('\n' + e);
  }

  await browser.close();
})();
