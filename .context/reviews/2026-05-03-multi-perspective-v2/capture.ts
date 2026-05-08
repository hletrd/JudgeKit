import { chromium, type Browser, type BrowserContext } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = "https://algo.xylolabs.com";
const OUT = "/Users/hletrd/flash-shared/judgekit/.context/reviews/2026-05-03-multi-perspective-v2/screenshots";
const REPORT = "/Users/hletrd/flash-shared/judgekit/.context/reviews/2026-05-03-multi-perspective-v2/raw-data.json";

fs.mkdirSync(OUT, { recursive: true });

interface Viewport {
  name: string;
  width: number;
  height: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  category: "mobile-portrait" | "mobile-landscape" | "tablet-portrait" | "tablet-landscape" | "desktop";
}

const VIEWPORTS: Viewport[] = [
  // Mobile portrait
  { name: "320x568", width: 320, height: 568, isMobile: true, hasTouch: true, category: "mobile-portrait" },
  { name: "375x667", width: 375, height: 667, isMobile: true, hasTouch: true, category: "mobile-portrait" },
  { name: "390x844", width: 390, height: 844, isMobile: true, hasTouch: true, category: "mobile-portrait" },
  { name: "414x896", width: 414, height: 896, isMobile: true, hasTouch: true, category: "mobile-portrait" },
  // Mobile landscape
  { name: "667x375", width: 667, height: 375, isMobile: true, hasTouch: true, category: "mobile-landscape" },
  { name: "844x390", width: 844, height: 390, isMobile: true, hasTouch: true, category: "mobile-landscape" },
  // Tablet portrait
  { name: "768x1024", width: 768, height: 1024, isMobile: false, hasTouch: true, category: "tablet-portrait" },
  { name: "820x1180", width: 820, height: 1180, isMobile: false, hasTouch: true, category: "tablet-portrait" },
  // Tablet landscape
  { name: "1024x768", width: 1024, height: 768, isMobile: false, hasTouch: true, category: "tablet-landscape" },
  { name: "1180x820", width: 1180, height: 820, isMobile: false, hasTouch: true, category: "tablet-landscape" },
  // Desktop
  { name: "1280x800", width: 1280, height: 800, category: "desktop" },
  { name: "1440x900", width: 1440, height: 900, category: "desktop" },
  { name: "1920x1080", width: 1920, height: 1080, category: "desktop" },
  { name: "2560x1440", width: 2560, height: 1440, category: "desktop" },
  { name: "3440x1440", width: 3440, height: 1440, category: "desktop" },
];

interface PageDef {
  path: string;
  label: string;
  slug: string;
  scrollExtra?: boolean;
}

const PAGES: PageDef[] = [
  { path: "/", label: "Landing", slug: "landing" },
  { path: "/signin", label: "Sign in", slug: "signin" },
  { path: "/practice", label: "Problem list (practice)", slug: "practice" },
  { path: "/contests", label: "Contests", slug: "contests" },
  { path: "/rankings", label: "Rankings", slug: "rankings" },
  { path: "/groups", label: "Groups", slug: "groups" },
  { path: "/playground", label: "Playground", slug: "playground" },
  { path: "/privacy", label: "Privacy", slug: "privacy" },
  { path: "/submissions", label: "Submissions feed", slug: "submissions" },
  { path: "/community", label: "Community", slug: "community" },
];

interface FindingPayload {
  vp: string;
  page: string;
  url: string;
  status?: number;
  finalUrl?: string;
  documentWidth: number;
  viewportWidth: number;
  hasHorizontalOverflow: boolean;
  bodyScrollHeight: number;
  bodyScrollWidth: number;
  hamburgerVisible?: boolean;
  navHeader?: { x: number; y: number; w: number; h: number; sticky?: boolean };
  smallText: { count: number; samples: string[] };
  smallTouchTargets: { count: number; samples: { tag: string; w: number; h: number; text: string }[] };
  overflowingElements: { selector: string; right: number; vw: number; text: string }[];
  fontFamily?: string;
  errors: string[];
  consoleErrors: string[];
  screenshot: string;
  loadMs: number;
}

const findings: FindingPayload[] = [];

async function captureOnePage(ctx: BrowserContext, vp: Viewport, p: PageDef): Promise<void> {
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on("pageerror", (err) => errors.push(err.message.slice(0, 200)));

  const url = BASE + p.path;
  const start = Date.now();
  let status: number | undefined;
  let finalUrl: string | undefined;
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    status = resp?.status();
    finalUrl = page.url();
    // give CSS / fonts / hydration a moment
    await page.waitForTimeout(2000);
    try {
      await page.waitForLoadState("networkidle", { timeout: 8000 });
    } catch {
      /* tolerate */
    }
  } catch (e: any) {
    errors.push(`navigation: ${e.message?.slice(0, 200)}`);
  }
  const loadMs = Date.now() - start;

  // Dismiss any cookie / consent banner if present (heuristic)
  try {
    const acceptBtns = page.locator(
      "button:has-text('Accept'), button:has-text('동의'), button:has-text('확인')"
    );
    const c = await acceptBtns.count();
    if (c > 0) await acceptBtns.first().click({ timeout: 2000 }).catch(() => {});
  } catch {}

  // Scroll top->bottom for lazy content
  try {
    await page.evaluate(async () => {
      const totalScroll = document.documentElement.scrollHeight;
      const step = Math.max(200, Math.floor(window.innerHeight / 2));
      for (let y = 0; y < totalScroll; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 200));
    });
  } catch {}

  let metrics: Omit<FindingPayload, "vp" | "page" | "url" | "screenshot" | "loadMs" | "errors" | "consoleErrors"> = {
    documentWidth: 0,
    viewportWidth: 0,
    hasHorizontalOverflow: false,
    bodyScrollHeight: 0,
    bodyScrollWidth: 0,
    smallText: { count: 0, samples: [] },
    smallTouchTargets: { count: 0, samples: [] },
    overflowingElements: [],
  };

  try {
    metrics = await page.evaluate(() => {
      const docW = document.documentElement.scrollWidth;
      const vpW = Math.ceil(window.visualViewport?.width ?? window.innerWidth);
      const overflow = docW - vpW > 1;

      // header info
      const header = document.querySelector("header");
      const hb = header?.getBoundingClientRect();
      const headerStyle = header ? getComputedStyle(header) : null;
      const navHeader = hb
        ? {
            x: Math.round(hb.x),
            y: Math.round(hb.y),
            w: Math.round(hb.width),
            h: Math.round(hb.height),
            sticky:
              headerStyle?.position === "fixed" ||
              headerStyle?.position === "sticky",
          }
        : undefined;

      const hamburger = document.querySelector(
        "[aria-label*='toggle' i], [aria-label*='menu' i], button[aria-controls], button[aria-expanded]"
      ) as HTMLElement | null;
      const hamburgerVisible = hamburger
        ? hamburger.offsetWidth > 0 && hamburger.offsetHeight > 0
        : false;

      // small text scan
      const smallText: { count: number; samples: string[] } = { count: 0, samples: [] };
      const allText = document.querySelectorAll("p, span, a, li, td, th, label, button, input, h1, h2, h3, h4, h5, h6, div");
      const seen = new Set<string>();
      allText.forEach((el) => {
        const txt = (el as HTMLElement).innerText?.trim();
        if (!txt || txt.length < 2 || txt.length > 100) return;
        const fs = parseFloat(getComputedStyle(el as HTMLElement).fontSize);
        if (fs && fs < 12) {
          smallText.count++;
          if (smallText.samples.length < 6 && !seen.has(txt)) {
            smallText.samples.push(`${fs.toFixed(1)}px: ${txt.slice(0, 60)}`);
            seen.add(txt);
          }
        }
      });

      // touch target audit (only on touch)
      const isTouch = window.matchMedia?.("(pointer: coarse)").matches;
      const smallTouch: { count: number; samples: { tag: string; w: number; h: number; text: string }[] } = {
        count: 0,
        samples: [],
      };
      const interactive = document.querySelectorAll(
        "button, a, input[type='button'], input[type='submit'], [role='button'], select, summary"
      );
      interactive.forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.width < 44 && r.height < 44) {
          smallTouch.count++;
          if (smallTouch.samples.length < 8) {
            smallTouch.samples.push({
              tag: el.tagName.toLowerCase(),
              w: Math.round(r.width),
              h: Math.round(r.height),
              text: ((el as HTMLElement).innerText || el.getAttribute("aria-label") || "").slice(0, 40),
            });
          }
        }
      });

      // find elements that overflow viewport horizontally
      const overflowing: { selector: string; right: number; vw: number; text: string }[] = [];
      if (overflow) {
        const all = document.querySelectorAll("body *");
        all.forEach((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          if (r.right > vpW + 1 && r.width > 0 && r.width < 9999) {
            const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
            const cls =
              typeof (el as HTMLElement).className === "string"
                ? `.${((el as HTMLElement).className as string).trim().split(/\s+/).slice(0, 2).join(".")}`
                : "";
            const sel = `${el.tagName.toLowerCase()}${id}${cls}`;
            if (overflowing.length < 8) {
              overflowing.push({
                selector: sel.slice(0, 80),
                right: Math.round(r.right),
                vw: vpW,
                text: ((el as HTMLElement).innerText || "").slice(0, 30),
              });
            }
          }
        });
      }

      const fontFamily = getComputedStyle(document.body).fontFamily;

      return {
        documentWidth: docW,
        viewportWidth: vpW,
        hasHorizontalOverflow: overflow,
        bodyScrollHeight: document.body.scrollHeight,
        bodyScrollWidth: document.body.scrollWidth,
        hamburgerVisible,
        navHeader,
        smallText,
        smallTouchTargets: smallTouch,
        overflowingElements: overflowing,
        fontFamily,
      };
    });
  } catch (e: any) {
    errors.push(`metrics: ${e.message?.slice(0, 200)}`);
  }

  const screenshotName = `${vp.name}-${p.slug}.png`;
  const screenshotPath = path.join(OUT, screenshotName);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
  } catch (e: any) {
    errors.push(`screenshot: ${e.message?.slice(0, 200)}`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch {}
  }

  findings.push({
    vp: vp.name,
    page: p.label,
    url: p.path,
    status,
    finalUrl,
    loadMs,
    screenshot: screenshotName,
    errors,
    consoleErrors,
    ...metrics,
  });

  await page.close();
}

async function runForViewport(browser: Browser, vp: Viewport): Promise<void> {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    deviceScaleFactor: vp.isMobile ? 2 : 1,
    userAgent: vp.isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
    ignoreHTTPSErrors: true,
  });
  for (const p of PAGES) {
    try {
      await captureOnePage(ctx, vp, p);
    } catch (e: any) {
      console.error(`[${vp.name} ${p.slug}] ${e.message?.slice(0, 200)}`);
      findings.push({
        vp: vp.name,
        page: p.label,
        url: p.path,
        loadMs: 0,
        screenshot: "",
        errors: [`outer: ${e.message?.slice(0, 200)}`],
        consoleErrors: [],
        documentWidth: 0,
        viewportWidth: 0,
        hasHorizontalOverflow: false,
        bodyScrollHeight: 0,
        bodyScrollWidth: 0,
        smallText: { count: 0, samples: [] },
        smallTouchTargets: { count: 0, samples: [] },
        overflowingElements: [],
      });
    }
  }
  await ctx.close();
}

// vertical resize tests on the homepage AND the playground (which has the editor)
async function runVerticalResize(browser: Browser): Promise<{
  scenario: string;
  metrics: any;
  screenshot: string;
}[]> {
  const results: { scenario: string; metrics: any; screenshot: string }[] = [];
  const targets = [
    { path: "/", slug: "landing" },
    { path: "/playground", slug: "playground" },
    { path: "/practice", slug: "practice" },
  ];
  const heights = [
    { name: "390x844-full", w: 390, h: 844 },
    { name: "390x600-addressbar", w: 390, h: 600 },
    { name: "390x400-keyboard", w: 390, h: 400 },
  ];

  for (const t of targets) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + t.path, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.waitForTimeout(2500);
      try {
        await page.waitForLoadState("networkidle", { timeout: 6000 });
      } catch {}
    } catch (e: any) {
      console.error(`vresize ${t.slug} nav: ${e.message?.slice(0, 200)}`);
    }
    for (const h of heights) {
      await page.setViewportSize({ width: h.w, height: h.h });
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => {
        const header = document.querySelector("header");
        const footer = document.querySelector("footer");
        const stickyEls = Array.from(document.querySelectorAll("*")).filter((el) => {
          const cs = getComputedStyle(el);
          return cs.position === "sticky" || cs.position === "fixed";
        });
        const submitBtn = Array.from(document.querySelectorAll("button, a")).find(
          (el) => /submit|제출|채점|run/i.test((el as HTMLElement).innerText)
        ) as HTMLElement | undefined;
        const submitRect = submitBtn?.getBoundingClientRect();
        const docH = document.documentElement.scrollHeight;
        const vpH = window.innerHeight;
        return {
          docH,
          vpH,
          headerH: header?.getBoundingClientRect().height || 0,
          headerSticky: header
            ? ["fixed", "sticky"].includes(getComputedStyle(header).position)
            : false,
          footerH: footer?.getBoundingClientRect().height || 0,
          stickyCount: stickyEls.length,
          stickyTags: stickyEls.slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${(typeof (e as HTMLElement).className === "string" ? (e as HTMLElement).className : "").toString().trim().split(/\s+/).slice(0, 1).join(".")}`),
          submitVisible: submitRect
            ? submitRect.bottom > 0 && submitRect.top < vpH
            : null,
          submitText: submitBtn?.innerText?.slice(0, 20) || null,
        };
      });
      const ssName = `vresize-${t.slug}-${h.name}.png`;
      try {
        await page.screenshot({
          path: path.join(OUT, ssName),
          fullPage: false,
        });
      } catch {}
      results.push({ scenario: `${t.slug} @ ${h.name}`, metrics: m, screenshot: ssName });
    }
    await ctx.close();
  }
  return results;
}

// horizontal resize sweep — capture exact breakpoints
async function runBreakpointSweep(browser: Browser): Promise<
  { width: number; layout: string; navMode: string; cardMode: boolean; screenshot: string }[]
> {
  const widths = [320, 375, 414, 600, 640, 700, 768, 800, 900, 1000, 1024, 1100, 1200, 1280, 1440, 1920];
  const out: { width: number; layout: string; navMode: string; cardMode: boolean; screenshot: string }[] = [];
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/submissions", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);
  } catch (e: any) {
    console.error(`sweep nav: ${e.message?.slice(0, 200)}`);
  }
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const desktopTable = document.querySelector(".hidden.md\\:block, table.hidden, [class*='hidden md:'], div.hidden") as HTMLElement | null;
      const tableEl = document.querySelector("table");
      const tableVisible = tableEl
        ? !!(tableEl.offsetWidth && tableEl.offsetHeight)
        : false;
      const hamburger = document.querySelector(
        "[aria-label*='toggle' i], button[aria-controls], button[aria-expanded]"
      ) as HTMLElement | null;
      const hamburgerVisible = hamburger ? hamburger.offsetWidth > 0 : false;
      const visibleNavLinks = Array.from(
        document.querySelectorAll("header nav a")
      ).filter((a) => (a as HTMLElement).offsetWidth > 0).length;
      const cards = document.querySelectorAll(".md\\:hidden li, .md\\:hidden article, .md\\:hidden [role='listitem']").length;
      return {
        tableVisible,
        hamburgerVisible,
        navLinks: visibleNavLinks,
        cards,
        docW: document.documentElement.scrollWidth,
      };
    });
    const ss = `sweep-${w}.png`;
    try {
      await page.screenshot({ path: path.join(OUT, ss), fullPage: false });
    } catch {}
    out.push({
      width: w,
      layout: m.tableVisible ? "table" : m.cards > 0 ? "cards" : "unknown",
      navMode: m.hamburgerVisible ? "hamburger" : `nav (${m.navLinks} links)`,
      cardMode: m.cards > 0,
      screenshot: ss,
    });
  }
  await ctx.close();
  return out;
}

async function pickAndCaptureProblem(browser: Browser): Promise<
  { vp: string; screenshot: string; url: string; metrics: any }[]
> {
  // first find a problem URL from /practice on desktop
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  let problemUrl: string | null = null;
  try {
    await page.goto(BASE + "/practice", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);
    const links = await page.$$eval("a[href*='/practice/']", (els) =>
      els
        .map((el) => (el as HTMLAnchorElement).getAttribute("href"))
        .filter((h): h is string => !!h)
        .filter((h) => /\/practice\/[^/]+\/?(?:$|\?)/.test(h) && !/(page=|\?|sort)/i.test(h))
    );
    const cand = links.find((l) => l !== "/practice" && l !== "/practice/");
    if (cand) problemUrl = cand.startsWith("http") ? cand : BASE + cand;
  } catch (e: any) {
    console.error(`problem-pick: ${e.message?.slice(0, 200)}`);
  }
  await ctx.close();

  if (!problemUrl) {
    console.warn("No problem URL discovered; skipping problem detail capture.");
    return [];
  }
  console.log(`Picked problem URL: ${problemUrl}`);

  const out: { vp: string; screenshot: string; url: string; metrics: any }[] = [];
  for (const vp of [
    { name: "320x568", w: 320, h: 568, mobile: true },
    { name: "390x844", w: 390, h: 844, mobile: true },
    { name: "768x1024", w: 768, h: 1024, mobile: false },
    { name: "1024x768", w: 1024, h: 768, mobile: false },
    { name: "1440x900", w: 1440, h: 900, mobile: false },
    { name: "1920x1080", w: 1920, h: 1080, mobile: false },
  ]) {
    const c = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      deviceScaleFactor: vp.mobile ? 2 : 1,
    });
    const p2 = await c.newPage();
    try {
      await p2.goto(problemUrl!, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await p2.waitForTimeout(2500);
      try {
        await p2.waitForLoadState("networkidle", { timeout: 6000 });
      } catch {}
      const m = await p2.evaluate(() => {
        return {
          docW: document.documentElement.scrollWidth,
          vpW: Math.ceil(window.visualViewport?.width ?? window.innerWidth),
          hasOverflow: document.documentElement.scrollWidth - window.innerWidth > 1,
          hasMonaco: !!document.querySelector(".monaco-editor"),
          hasCodeMirror: !!document.querySelector(".cm-editor, .CodeMirror"),
          hasTabs: !!document.querySelector("[role='tablist']"),
        };
      });
      const ss = `problem-${vp.name}.png`;
      await p2.screenshot({ path: path.join(OUT, ss), fullPage: true, animations: "disabled" });
      out.push({ vp: vp.name, screenshot: ss, url: problemUrl, metrics: m });
    } catch (e: any) {
      console.error(`problem ${vp.name}: ${e.message?.slice(0, 200)}`);
    }
    await c.close();
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  console.log(`Running ${VIEWPORTS.length} viewports x ${PAGES.length} pages`);

  // run viewports in groups of 3 to keep parallelism reasonable
  const concurrency = 3;
  for (let i = 0; i < VIEWPORTS.length; i += concurrency) {
    const batch = VIEWPORTS.slice(i, i + concurrency);
    console.log(`Batch: ${batch.map((b) => b.name).join(", ")}`);
    await Promise.all(batch.map((vp) => runForViewport(browser, vp)));
  }

  console.log("Vertical resize scenarios...");
  const vresize = await runVerticalResize(browser);
  console.log("Breakpoint sweep...");
  const sweep = await runBreakpointSweep(browser);
  console.log("Problem-detail page across viewports...");
  const problem = await pickAndCaptureProblem(browser);

  await browser.close();

  fs.writeFileSync(
    REPORT,
    JSON.stringify({ findings, vresize, sweep, problem }, null, 2)
  );
  console.log(`Wrote ${findings.length} findings to ${REPORT}`);
})();
