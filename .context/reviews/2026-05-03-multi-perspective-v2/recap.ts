import { chromium } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = "https://algo.xylolabs.com";
const OUT = "/Users/hletrd/flash-shared/judgekit/.context/reviews/2026-05-03-multi-perspective-v2/screenshots";

interface VP {
  name: string;
  w: number;
  h: number;
  mobile: boolean;
}

const VPS: VP[] = [
  { name: "320x568", w: 320, h: 568, mobile: true },
  { name: "375x667", w: 375, h: 667, mobile: true },
  { name: "390x844", w: 390, h: 844, mobile: true },
  { name: "414x896", w: 414, h: 896, mobile: true },
  { name: "667x375", w: 667, h: 375, mobile: true },
  { name: "844x390", w: 844, h: 390, mobile: true },
  { name: "768x1024", w: 768, h: 1024, mobile: false },
  { name: "820x1180", w: 820, h: 1180, mobile: false },
  { name: "1024x768", w: 1024, h: 768, mobile: false },
  { name: "1180x820", w: 1180, h: 820, mobile: false },
  { name: "1280x800", w: 1280, h: 800, mobile: false },
  { name: "1440x900", w: 1440, h: 900, mobile: false },
  { name: "1920x1080", w: 1920, h: 1080, mobile: false },
  { name: "2560x1440", w: 2560, h: 1440, mobile: false },
  { name: "3440x1440", w: 3440, h: 1440, mobile: false },
];

// pages that didn't capture cleanly first time
const PAGES = [
  { path: "/login", slug: "login" },
  { path: "/languages", slug: "languages" },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const out: any[] = [];
  for (const vp of VPS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      deviceScaleFactor: vp.mobile ? 2 : 1,
      userAgent: vp.mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
    });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + p.path, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2200);
        try {
          await page.waitForLoadState("networkidle", { timeout: 6000 });
        } catch {}
        await page.evaluate(async () => {
          const totalScroll = document.documentElement.scrollHeight;
          const step = Math.max(200, Math.floor(window.innerHeight / 2));
          for (let y = 0; y < totalScroll; y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 80));
          }
          window.scrollTo(0, 0);
        });
        const m = await page.evaluate(() => {
          const docW = document.documentElement.scrollWidth;
          const vpW = Math.ceil(window.visualViewport?.width ?? window.innerWidth);
          const overflow = docW - vpW > 1;
          const inputs = Array.from(document.querySelectorAll("input"));
          const inputDetails = inputs.map((i) => {
            const r = i.getBoundingClientRect();
            return { type: i.type, w: Math.round(r.width), h: Math.round(r.height), name: i.name };
          });
          const buttons = Array.from(document.querySelectorAll("button, a[role='button']"));
          const smallBtns = buttons
            .map((b) => {
              const r = (b as HTMLElement).getBoundingClientRect();
              return { w: Math.round(r.width), h: Math.round(r.height), text: ((b as HTMLElement).innerText || "").slice(0, 30) };
            })
            .filter((b) => b.w > 0 && b.h > 0 && (b.w < 44 || b.h < 44));
          return {
            docW,
            vpW,
            hasOverflow: overflow,
            inputDetails: inputDetails.slice(0, 6),
            smallBtns: smallBtns.slice(0, 8),
            heading: document.querySelector("h1, h2")?.textContent?.slice(0, 60),
          };
        });
        const ss = `${vp.name}-${p.slug}.png`;
        await page.screenshot({ path: path.join(OUT, ss), fullPage: true, animations: "disabled" });
        console.log(`[${vp.name} ${p.slug}] OK overflow=${m.hasOverflow} h="${m.heading}"`);
        out.push({ vp: vp.name, slug: p.slug, ok: true, ss, ...m });
      } catch (e: any) {
        console.error(`[${vp.name} ${p.slug}] ${e.message?.slice(0, 200)}`);
        out.push({ vp: vp.name, slug: p.slug, ok: false, error: e.message?.slice(0, 200) });
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(
    "/Users/hletrd/flash-shared/judgekit/.context/reviews/2026-05-03-multi-perspective-v2/recap-data.json",
    JSON.stringify(out, null, 2)
  );
  console.log("Done.");
})();
