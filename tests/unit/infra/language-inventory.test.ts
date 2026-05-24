import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function parseLangList(source: string, varName: string) {
  const re = new RegExp(`${varName}="([^"]+)"`, "s");
  const match = source.match(re);
  if (!match) {
    throw new Error(`${varName} not found`);
  }
  return new Set(match[1].split(/\s+/).filter(Boolean));
}

describe("language inventory automation", () => {
  it("keeps deploy/setup 'all' presets in sync with source-referenced docker images", () => {
    const languageSource = read("src/lib/judge/languages.ts");
    const sourceImages = Array.from(
      new Set(
        Array.from(languageSource.matchAll(/dockerImage:\s*"([^"]+)"/g), ([, image]) =>
          image.replace(":latest", "").replace(/^judge-/, "")
        )
      )
    );

    const deployScript = read("deploy-docker.sh");
    const deployPreset = parseLangList(deployScript, "ALL_LANGS");
    // ARM_PROHIBITIVE_LANGS are language Dockerfiles we still ship but
    // intentionally exclude from the default `all` preset because they
    // compile their entire toolchain from source on aarch64 and nobody
    // submits in them on production. Treat their absence from ALL_LANGS
    // as expected for this consistency check; LANGUAGE_FILTER=everything
    // (resolve_languages "everything") still rebuilds the full set.
    const armProhibitive = parseLangList(deployScript, "ARM_PROHIBITIVE_LANGS");
    const deployFull = new Set([...deployPreset, ...armProhibitive]);

    const setupPreset = parseLangList(read("scripts/setup.sh"), "ALL_LANGS");
    const setupFull = setupPreset; // setup.sh has no exclusion split

    expect(sourceImages.filter((image) => !deployFull.has(image))).toEqual([]);
    expect(sourceImages.filter((image) => !setupFull.has(image))).toEqual([]);
  });
});
