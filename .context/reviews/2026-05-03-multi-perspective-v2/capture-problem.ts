import { chromium } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = "https://algo.xylolabs.com";
const PROBLEM_URL = `${BASE}/practice/problems/_s-pSbJdSL-nCu_qZf8s5`;
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
  { name: "768x1024", w: 768, h: 1024, mobile: false },
  { name: "1024x768", w: 1024, h: 768, mobile: false },
  { name: "1280x800", w: 1280, h: 800, mobile: false },
  { name: "1440x900", w: 1440, h: 900, mobile: false },
  { name: "1920x1080", w: 1920, h: 1080, mobile: false },
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
    const p = await ctx.newPage();
    let metrics: any = null;
    try {
      await p.goto(PROBLEM_URL, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await p.waitForTimeout(2500);
      try {
        await p.waitForLoadState("networkidle", { timeout: 6000 });
      } catch {}
      // scroll
      await p.evaluate(async () => {
        const totalScroll = document.documentElement.scrollHeight;
        const step = Math.max(200, Math.floor(window.innerHeight / 2));
        for (let y = 0; y < totalScroll; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 80));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 200));
      });
      metrics = await p.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const vpW = Math.ceil(window.visualViewport?.width ?? window.innerWidth);
        const overflow = docW - vpW > 1;
        const overflowingEls: any[] = [];
        if (overflow) {
          document.querySelectorAll("body *").forEach((el) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            if (r.right > vpW + 1 && r.width > 0 && r.width < 9999 && overflowingEls.length < 6) {
              overflowingEls.push({
                tag: el.tagName.toLowerCase(),
                cls: ((el as HTMLElement).className || "").toString().slice(0, 80),
                right: Math.round(r.right),
                w: Math.round(r.width),
                txt: ((el as HTMLElement).innerText || "").slice(0, 30),
              });
            }
          });
        }
        const codeBlocks = document.querySelectorAll("pre, code");
        const wideCodeBlocks = Array.from(codeBlocks).filter((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > vpW;
        }).length;
        const tables = document.querySelectorAll("table");
        const wideTables = Array.from(tables).filter((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > vpW;
        }).length;
        return {
          docW,
          vpW,
          hasOverflow: overflow,
          overflowingEls,
          wideCodeBlocks,
          wideTables,
          hasMonaco: !!document.querySelector(".monaco-editor"),
          hasCodeMirror: !!document.querySelector(".cm-editor, .CodeMirror"),
          hasMath: !!document.querySelector(".katex, .MathJax, mjx-container"),
          mainHeading: document.querySelector("h1")?.innerText?.slice(0, 80),
        };
      });
      const ss = `problem-${vp.name}.png`;
      await p.screenshot({ path: path.join(OUT, ss), fullPage: true, animations: "disabled" });
      out.push({ vp: vp.name, ok: true, ss, metrics });
      console.log(`[${vp.name}] OK overflow=${metrics.hasOverflow} wideCode=${metrics.wideCodeBlocks}`);
    } catch (e: any) {
      console.error(`[${vp.name}] ${e.message?.slice(0, 200)}`);
      out.push({ vp: vp.name, ok: false, error: e.message?.slice(0, 200) });
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(
    "/Users/hletrd/flash-shared/judgekit/.context/reviews/2026-05-03-multi-perspective-v2/problem-data.json",
    JSON.stringify(out, null, 2)
  );
  console.log("Done.");
})();
