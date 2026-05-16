import { describe, expect, it } from "vitest";
import {
  getCodeSurfaceLanguage,
  getHighlightJsLanguage,
} from "@/lib/code/language-map";

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

  it("normalizes case so common aliases map correctly", () => {
    expect(getCodeSurfaceLanguage("Java")).toBe("java");
    expect(getCodeSurfaceLanguage("PYTHON")).toBe("python");
    expect(getCodeSurfaceLanguage("CPP20")).toBe("cpp");
  });

  it("treats null/undefined as plaintext", () => {
    expect(getCodeSurfaceLanguage(null)).toBe("plaintext");
    expect(getCodeSurfaceLanguage(undefined)).toBe("plaintext");
  });

  it("recognizes the C-family aliases the timeline panel previously listed", () => {
    expect(getCodeSurfaceLanguage("c")).toBe("c");
    expect(getCodeSurfaceLanguage("c11")).toBe("c");
    expect(getCodeSurfaceLanguage("c89")).toBe("c");
    expect(getCodeSurfaceLanguage("c99")).toBe("c");
    expect(getCodeSurfaceLanguage("cpp")).toBe("cpp");
    expect(getCodeSurfaceLanguage("cpp17")).toBe("cpp");
  });

  it("recognizes node, ruby, scala, perl, php, swift, lua, bash, haskell, ocaml, csharp aliases", () => {
    expect(getCodeSurfaceLanguage("node")).toBe("javascript");
    expect(getCodeSurfaceLanguage("ruby")).toBe("ruby");
    expect(getCodeSurfaceLanguage("scala")).toBe("scala");
    expect(getCodeSurfaceLanguage("perl")).toBe("perl");
    expect(getCodeSurfaceLanguage("php")).toBe("php");
    expect(getCodeSurfaceLanguage("swift")).toBe("swift");
    expect(getCodeSurfaceLanguage("lua")).toBe("lua");
    expect(getCodeSurfaceLanguage("bash")).toBe("bash");
    expect(getCodeSurfaceLanguage("haskell")).toBe("haskell");
    expect(getCodeSurfaceLanguage("ocaml")).toBe("ocaml");
    expect(getCodeSurfaceLanguage("csharp")).toBe("csharp");
  });
});

describe("getHighlightJsLanguage", () => {
  it("returns the canonical mapping for known languages", () => {
    expect(getHighlightJsLanguage("python")).toBe("python");
    expect(getHighlightJsLanguage("java")).toBe("java");
    expect(getHighlightJsLanguage("rust")).toBe("rust");
    expect(getHighlightJsLanguage("node")).toBe("javascript");
  });

  it("normalizes case (matches the legacy LANGUAGE_TO_HLJS contract)", () => {
    expect(getHighlightJsLanguage("Python")).toBe("python");
    expect(getHighlightJsLanguage("CPP20")).toBe("cpp");
  });

  it("returns undefined for plaintext-mapped languages so highlight.js auto-detects", () => {
    expect(getHighlightJsLanguage("verilog")).toBeUndefined();
    expect(getHighlightJsLanguage("systemverilog")).toBeUndefined();
    expect(getHighlightJsLanguage("vhdl")).toBeUndefined();
    expect(getHighlightJsLanguage("plaintext")).toBeUndefined();
  });

  it("returns undefined for unknown languages so highlight.js auto-detects", () => {
    expect(getHighlightJsLanguage("klingon")).toBeUndefined();
    expect(getHighlightJsLanguage("")).toBeUndefined();
  });

  it("returns undefined for null/undefined input", () => {
    expect(getHighlightJsLanguage(null)).toBeUndefined();
    expect(getHighlightJsLanguage(undefined)).toBeUndefined();
  });
});
