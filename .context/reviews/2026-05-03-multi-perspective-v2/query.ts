import * as fs from "node:fs";
const raw = JSON.parse(fs.readFileSync("raw-data.json", "utf8"));
const findings = raw.findings as any[];

console.log("== TOTAL FINDINGS:", findings.length);

console.log("\n== Pages with horizontal overflow:");
const overflows = findings.filter((f: any) => f.hasHorizontalOverflow);
console.log("count:", overflows.length);
overflows.slice(0, 30).forEach((f: any) => {
  console.log(`  ${f.vp.padEnd(10)} ${f.page.padEnd(22)} doc=${f.documentWidth} vp=${f.viewportWidth} delta=${f.documentWidth - f.viewportWidth}`);
  f.overflowingElements.slice(0, 2).forEach((e: any) => console.log(`     -> ${e.selector} right=${e.right} txt="${e.text}"`));
});

console.log("\n== Hamburger by viewport on Landing:");
findings.filter((f: any) => f.page === "Landing").forEach((f: any) => {
  console.log(`  ${f.vp.padEnd(10)} hamburger=${f.hamburgerVisible} status=${f.status}`);
});

console.log("\n== Touch targets per page (mobile only):");
const mobVps = ["320x568", "375x667", "390x844", "414x896", "667x375", "844x390"];
findings.filter((f: any) => mobVps.includes(f.vp) && f.smallTouchTargets?.count > 0).forEach((f: any) => {
  console.log(`  ${f.vp.padEnd(10)} ${f.page.padEnd(22)} count=${f.smallTouchTargets.count}`);
  f.smallTouchTargets.samples.slice(0, 4).forEach((s: any) => console.log(`     <${s.tag}> ${s.w}x${s.h} "${s.text}"`));
});

console.log("\n== Small text count by page+vp (filtered to >0):");
findings.filter((f: any) => f.smallText?.count > 0).forEach((f: any) => {
  console.log(`  ${f.vp.padEnd(10)} ${f.page.padEnd(22)} smallText=${f.smallText.count}`);
  f.smallText.samples.slice(0, 2).forEach((s: any) => console.log(`     ${s}`));
});

console.log("\n== Vertical resize:");
(raw.vresize as any[]).forEach((r: any) => {
  console.log(`  ${r.scenario.padEnd(40)} headerSticky=${r.metrics.headerSticky} headerH=${r.metrics.headerH}px sticky#=${r.metrics.stickyCount} stickyTags=[${r.metrics.stickyTags?.join(",")}] submitVisible=${r.metrics.submitVisible}`);
});

console.log("\n== Breakpoint sweep on /submissions:");
(raw.sweep as any[]).forEach((r: any) => {
  console.log(`  ${String(r.width).padStart(5)}px  layout=${r.layout.padEnd(7)} nav=${r.navMode}`);
});

