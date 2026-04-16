import { describe, expect, it } from "vitest";
import { getCodeSurfaceLanguage } from "@/lib/code/language-map";

describe("getCodeSurfaceLanguage", () => {
  it("maps Java and Kotlin judge languages to editor modes", () => {
    expect(getCodeSurfaceLanguage("java")).toBe("java");
    expect(getCodeSurfaceLanguage("kotlin")).toBe("kotlin");
  });

  it("falls back to plaintext for unknown languages", () => {
    expect(getCodeSurfaceLanguage("unknown-language")).toBe("plaintext");
  });

  it("keeps output-only judge languages on plaintext highlighting", () => {
    expect(getCodeSurfaceLanguage("plaintext")).toBe("plaintext");
    expect(getCodeSurfaceLanguage("verilog")).toBe("plaintext");
    expect(getCodeSurfaceLanguage("systemverilog")).toBe("plaintext");
    expect(getCodeSurfaceLanguage("vhdl")).toBe("plaintext");
  });
});
