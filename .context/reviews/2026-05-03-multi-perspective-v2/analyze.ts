import * as fs from "node:fs";

const raw = JSON.parse(
  fs.readFileSync(
    "/Users/hletrd/flash-shared/judgekit/.context/reviews/2026-05-03-multi-perspective-v2/raw-data.json",
    "utf8"
  )
);
const problemData = JSON.parse(
  fs.readFileSync(
    "/Users/hletrd/flash-shared/judgekit/.context/reviews/2026-05-03-multi-perspective-v2/problem-data.json",
    "utf8"
  )
);

const findings = raw.findings as any[];

// 1. Pages with horizontal overflow
console.log("=== Horizontal overflow ===");
const overflows = findings.filter((f) => f.hasHorizontalOverflow);
overflows.forEach((f) => {
  console.log(
    `  ${f.vp.padEnd(10)} ${f.page.padEnd(20)} doc=${f.documentWidth}px > vp=${f.viewportWidth}px (delta ${f.documentWidth - f.viewportWidth})`
  );
  if (f.overflowingElements?.length) {
    f.overflowingElements.slice(0, 3).forEach((e: any) => {
      console.log(`     -> ${e.selector} right=${e.right} text="${e.text}"`);
    });
  }
});

// 2. Pages that errored
console.log("\n=== Errors ===");
findings
  .filter((f) => f.errors?.length || f.consoleErrors?.length || (f.status && f.status >= 400))
  .forEach((f) => {
    console.log(`  ${f.vp.padEnd(10)} ${f.page.padEnd(20)} status=${f.status} errors=${f.errors.length} console=${f.consoleErrors.length}`);
    f.errors.slice(0, 2).forEach((e: string) => console.log(`     ! ${e}`));
    f.consoleErrors.slice(0, 2).forEach((e: string) => console.log(`     c ${e}`));
  });

// 3. Touch target audit (mobile/tablet only)
console.log("\n=== Touch targets < 44px ===");
const touchVps = ["320x568", "375x667", "390x844", "414x896", "667x375", "844x390", "768x1024", "820x1180", "1024x768", "1180x820"];
findings
  .filter((f) => touchVps.includes(f.vp) && f.smallTouchTargets?.count > 0)
  .forEach((f) => {
    console.log(`  ${f.vp.padEnd(10)} ${f.page.padEnd(20)} count=${f.smallTouchTargets.count}`);
    f.smallTouchTargets.samples.slice(0, 3).forEach((s: any) => {
      console.log(`     <${s.tag}> ${s.w}x${s.h}px text="${s.text}"`);
    });
  });

// 4. Small text scan
console.log("\n=== Small text < 12px ===");
findings
  .filter((f) => f.smallText?.count > 0)
  .slice(0, 30)
  .forEach((f) => {
    console.log(`  ${f.vp.padEnd(10)} ${f.page.padEnd(20)} count=${f.smallText.count}`);
    f.smallText.samples.slice(0, 2).forEach((s: string) => console.log(`     ${s}`));
  });

// 5. Hamburger visibility per viewport
console.log("\n=== Hamburger visibility (sampled by landing) ===");
const landingByVp = findings.filter((f) => f.page === "Landing");
landingByVp.forEach((f) => {
  console.log(`  ${f.vp.padEnd(10)} hamburger=${f.hamburgerVisible} headerSticky=${f.navHeader?.sticky} headerH=${f.navHeader?.h}px`);
});

// 6. Vertical resize results
console.log("\n=== Vertical resize ===");
(raw.vresize as any[]).forEach((r) => {
  console.log(`  ${r.scenario.padEnd(40)} headerSticky=${r.metrics.headerSticky} headerH=${r.metrics.headerH} vpH=${r.metrics.vpH} sticky#=${r.metrics.stickyCount} submit=${r.metrics.submitVisible} ("${r.metrics.submitText}")`);
});

// 7. Breakpoint sweep
console.log("\n=== Breakpoint sweep on /submissions ===");
(raw.sweep as any[]).forEach((r) => {
  console.log(`  ${String(r.width).padStart(5)}px  layout=${r.layout.padEnd(7)} nav=${r.navMode}`);
});

// 8. Problem page
console.log("\n=== Problem detail page ===");
problemData.forEach((r: any) => {
  if (r.ok) {
    console.log(`  ${r.vp.padEnd(10)} overflow=${r.metrics.hasOverflow} doc=${r.metrics.docW} vp=${r.metrics.vpW} hasMath=${r.metrics.hasMath} h1="${r.metrics.mainHeading}"`);
    if (r.metrics.overflowingEls?.length) {
      r.metrics.overflowingEls.slice(0, 3).forEach((e: any) => {
        console.log(`     -> <${e.tag}> right=${e.right} cls="${e.cls.slice(0, 50)}" txt="${e.txt}"`);
      });
    }
  } else {
    console.log(`  ${r.vp.padEnd(10)} ERROR ${r.error}`);
  }
});

// 9. Summary table by vp x page
console.log("\n=== Summary by viewport x page ===");
const vps = Array.from(new Set(findings.map((f) => f.vp)));
const pages = Array.from(new Set(findings.map((f) => f.page)));
console.log(`  VP\\Page         | ${pages.map((p) => p.slice(0, 6).padEnd(6)).join("|")}`);
vps.forEach((v) => {
  const cells = pages.map((p) => {
    const f = findings.find((x) => x.vp === v && x.page === p);
    if (!f) return "?".padEnd(6);
    if (f.errors?.length) return "ERR".padEnd(6);
    if (f.hasHorizontalOverflow) return "OFLW".padEnd(6);
    if (f.smallTouchTargets?.count > 5) return "TCH".padEnd(6);
    return "OK".padEnd(6);
  });
  console.log(`  ${v.padEnd(15)} | ${cells.join("|")}`);
});
