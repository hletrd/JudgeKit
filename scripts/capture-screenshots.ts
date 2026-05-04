import { chromium } from "playwright";

const BASE = "https://algo.xylolabs.com";
const OUT = "/tmp/judgekit-screenshots";

const tablet = { width: 768, height: 1024 };
const desktop = { width: 1440, height: 900 };

const tabletPages = ["/", "/rankings", "/submissions", "/practice"];
const desktopPages = ["/", "/rankings", "/submissions", "/practice", "/privacy"];

async function run() {
  const browser = await chromium.launch({ headless: true });

  // TABLET viewport
  const tCtx = await browser.newContext({ viewport: tablet, deviceScaleFactor: 2 });
  const tPage = await tCtx.newPage();
  for (const path of tabletPages) {
    const url = BASE + path;
    console.log(`[TABLET] Navigating to ${url}`);
    try {
      await tPage.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await tPage.waitForTimeout(1500); // let animations settle
      const file = `${OUT}/tablet-${path.replace(/\//g, "root") || "root"}.png`;
      await tPage.screenshot({ path: file, fullPage: true });
      console.log(`  -> Saved ${file}`);
    } catch (e: unknown) {
      console.error(`  [ERROR] ${url}: ${e instanceof Error ? e.message : String(e)}`);
      // Try a partial screenshot anyway
      try {
        await tPage.waitForTimeout(3000);
        const file = `${OUT}/tablet-${path.replace(/\//g, "root") || "root"}-retry.png`;
        await tPage.screenshot({ path: file, fullPage: true });
        console.log(`  -> Retry saved ${file}`);
      } catch {}
    }
  }
  await tCtx.close();

  // DESKTOP viewport
  const dCtx = await browser.newContext({ viewport: desktop, deviceScaleFactor: 2 });
  const dPage = await dCtx.newPage();
  for (const path of desktopPages) {
    const url = BASE + path;
    console.log(`[DESKTOP] Navigating to ${url}`);
    try {
      await dPage.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await dPage.waitForTimeout(1500);
      const file = `${OUT}/desktop-${path.replace(/\//g, "root") || "root"}.png`;
      await dPage.screenshot({ path: file, fullPage: true });
      console.log(`  -> Saved ${file}`);
    } catch (e: unknown) {
      console.error(`  [ERROR] ${url}: ${e instanceof Error ? e.message : String(e)}`);
      try {
        await dPage.waitForTimeout(3000);
        const file = `${OUT}/desktop-${path.replace(/\//g, "root") || "root"}-retry.png`;
        await dPage.screenshot({ path: file, fullPage: true });
        console.log(`  -> Retry saved ${file}`);
      } catch {}
    }
  }
  await dCtx.close();

  await browser.close();
  console.log("Done!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
