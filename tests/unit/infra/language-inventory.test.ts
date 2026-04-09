import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function parseAllLangs(source: string) {
  const match = source.match(/ALL_LANGS="([^"]+)"/s);
  if (!match) {
    throw new Error("ALL_LANGS not found");
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

    const deployPreset = parseAllLangs(read("deploy-docker.sh"));
    const setupPreset = parseAllLangs(read("scripts/setup.sh"));

    expect(sourceImages.filter((image) => !deployPreset.has(image))).toEqual([]);
    expect(sourceImages.filter((image) => !setupPreset.has(image))).toEqual([]);
  });
});
