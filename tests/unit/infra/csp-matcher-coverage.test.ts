import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * CSP nonce-matcher route coverage guard (RPF cycle-1 AGG-7 / A1 / S2 / T3).
 *
 * The runtime nonce CSP is only applied to requests that match
 * `config.matcher` in `src/proxy.ts`; everything else falls to the strict
 * static fallback CSP in `next.config.ts` (`script-src 'self'`), which blocks
 * Next.js streaming inline scripts and breaks hydration with console CSP
 * violations. Two regressions of this class have shipped (SEC-21-3, then the
 * 6035ca83 four-route patch) because the matcher is an enumerated allowlist
 * split across two files with no guard.
 *
 * This test closes the CLASS: every top-level page-route segment under
 * `src/app` (route groups stripped) must map into a matcher entry. Adding a
 * page route without a matcher entry fails this test at commit time.
 *
 * KNOWN, ACCEPTED EXCEPTION (do not "fix" by adding a catch-all without
 * measuring middleware cost on static/asset paths): unmatched paths — i.e.
 * the root not-found page rendered for URLs like /asdf — still fall to the
 * static fallback CSP. The 404 content renders; only its hydration scripts
 * are blocked. That is a deliberate trade-off documented in the cycle-1
 * aggregate review.
 */

function collectTopLevelPageSegments(appDir: string): Set<string> {
  const segments = new Set<string>();

  function walk(dir: string, topSegment: string | null) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        // Route groups "(name)" do not contribute a URL segment.
        const isGroup = entry.startsWith("(") && entry.endsWith(")");
        const next = topSegment ?? (isGroup ? null : entry);
        walk(full, next);
      } else if (entry === "page.tsx" || entry === "page.ts") {
        segments.add(topSegment ?? "/");
      }
    }
  }

  walk(appDir, null);
  return segments;
}

function parseMatcherEntries(proxySource: string): string[] {
  const matcherBlock = proxySource.match(/matcher:\s*\[([\s\S]*?)\]/);
  expect(matcherBlock, "config.matcher array not found in src/proxy.ts").toBeTruthy();
  const entries = [...matcherBlock![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  expect(entries.length).toBeGreaterThan(0);
  return entries;
}

function isCovered(segment: string, matcherEntries: string[]): boolean {
  if (segment === "/") return matcherEntries.includes("/");
  return matcherEntries.some(
    (entry) =>
      entry === `/${segment}` ||
      entry === `/${segment}/:path*` ||
      entry.startsWith(`/${segment}/`)
  );
}

describe("CSP nonce matcher covers every top-level page route", () => {
  const proxySource = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf8");
  const matcherEntries = parseMatcherEntries(proxySource);
  const segments = collectTopLevelPageSegments(join(process.cwd(), "src", "app"));

  it("found a plausible number of page segments (sanity)", () => {
    // If this drops near zero the walker broke and the coverage assertion
    // below would vacuously pass.
    expect(segments.size).toBeGreaterThanOrEqual(15);
  });

  it("every top-level page segment maps into config.matcher", () => {
    const uncovered = [...segments].filter((seg) => !isCovered(seg, matcherEntries));
    expect(
      uncovered,
      `Page route segment(s) missing from src/proxy.ts config.matcher — these pages ` +
        `would fall to the strict static fallback CSP (script-src 'self') and fail to ` +
        `hydrate: ${uncovered.join(", ")}. Add "/<segment>/:path*" to the matcher.`
    ).toEqual([]);
  });
});
