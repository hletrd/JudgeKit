import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXECUTE_PATH = "src/lib/compiler/execute.ts";

describe("cleanupOrphanedContainers docker ps parsing", () => {
  it("uses JSON format instead of tab-delimited format", () => {
    const source = readFileSync(join(process.cwd(), EXECUTE_PATH), "utf8");
    // Must use --format '{{json .}}' for robust parsing
    expect(source).toContain("{{json .}}");
    // Must NOT use the old tab-delimited format
    expect(source).not.toContain("{{.Names}}\\t{{.Status}}\\t{{.CreatedAt}}");
  });

  it("parses each line as JSON with error handling", () => {
    const source = readFileSync(join(process.cwd(), EXECUTE_PATH), "utf8");
    // Must have JSON.parse in the line processing loop
    expect(source).toContain("JSON.parse(line)");
    // Must skip unparseable lines
    expect(source).toContain("Skipping unparseable line");
  });

  it("extracts Names, Status, and CreatedAt from parsed JSON", () => {
    const source = readFileSync(join(process.cwd(), EXECUTE_PATH), "utf8");
    // Must access JSON properties by name
    expect(source).toContain('parsed?.Names');
    expect(source).toContain('parsed?.Status');
    expect(source).toContain('parsed?.CreatedAt');
  });
});
