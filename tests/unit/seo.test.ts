import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NO_INDEX_METADATA,
  buildAbsoluteUrl,
  buildPublicMetadata,
  buildSeoKeywords,
  summarizeTextForMetadata,
} from "@/lib/seo";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("summarizeTextForMetadata", () => {
  it("strips markdown and html before truncating", () => {
    const summary = summarizeTextForMetadata(
      "# Title\n\nThis is **bold** text with a [link](https://example.com) and <em>HTML</em> tags.",
      80,
    );

    expect(summary).toBe("Title This is bold text with a link and HTML tags.");
  });

  it("truncates on a word boundary when text is long", () => {
    const summary = summarizeTextForMetadata(
      "JudgeKit helps students solve programming problems, join contests, and discuss solutions with peers.",
      60,
    );

    expect(summary).toBe("JudgeKit helps students solve programming problems, join…");
  });
});

describe("buildSeoKeywords", () => {
  it("includes site-specific and extra keywords without duplicates", () => {
    const keywords = buildSeoKeywords("JudgeKit", ["online judge", "coding contests"]);

    expect(keywords).toContain("JudgeKit");
    expect(keywords).toContain("JudgeKit online judge");
    expect(keywords).toContain("coding contests");
    expect(keywords.filter((keyword) => keyword === "online judge")).toHaveLength(1);
  });
});

describe("buildAbsoluteUrl", () => {
  it("uses AUTH_URL when configured", () => {
    vi.stubEnv("AUTH_URL", "https://judgekit.example");

    expect(buildAbsoluteUrl("/practice")).toBe("https://judgekit.example/practice");
  });

  it("falls back to localhost when AUTH_URL is missing", () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");

    expect(buildAbsoluteUrl("contests")).toBe("http://localhost:3000/contests");
  });
});

describe("buildPublicMetadata", () => {
  it("builds canonical, open graph, and twitter metadata for public pages", () => {
    vi.stubEnv("AUTH_URL", "https://judgekit.example");

    const metadata = buildPublicMetadata({
      title: "Public problem catalog",
      description: "Browse public programming problems.",
      path: "/practice",
      siteTitle: "JudgeKit",
      keywords: ["algorithm practice"],
    });

    expect(metadata.alternates?.canonical).toBe("/practice");
    expect(metadata.openGraph).toMatchObject({
      title: "Public problem catalog",
      description: "Browse public programming problems.",
      url: "https://judgekit.example/practice",
      siteName: "JudgeKit",
      type: "website",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary",
      title: "Public problem catalog",
      description: "Browse public programming problems.",
    });
    expect(metadata.keywords).toContain("algorithm practice");
  });
});

describe("NO_INDEX_METADATA", () => {
  it("marks routes as non-indexable", () => {
    expect(NO_INDEX_METADATA.robots).toMatchObject({
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    });
  });
});
