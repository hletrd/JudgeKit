import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  problemFindFirstMock,
  getResolvedSystemSettingsMock,
  getPublicContestByIdMock,
  getDiscussionThreadByIdMock,
} = vi.hoisted(() => ({
  problemFindFirstMock: vi.fn(),
  getResolvedSystemSettingsMock: vi.fn(),
  getPublicContestByIdMock: vi.fn(),
  getDiscussionThreadByIdMock: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      common: {
        appName: "JudgeKit",
        appDescription: "Online judge",
      },
      problems: {
        title: "Problems",
        "table.difficulty": "Difficulty",
      },
      publicShell: {
        "nav.contests": "Contests",
        "nav.community": "Community",
        "community.scopeGeneral": "General discussion",
        "community.scopeProblem": "Problem discussion",
        "community.replyCount": "{count} replies",
        "contests.status.open": "Open",
        "contests.modeScheduled": "Scheduled",
        "contests.modeWindowed": "Windowed",
        "contests.scoringModelIcpc": "ICPC",
        "contests.scoringModelIoi": "IOI",
        "contests.problemCount": "{count} problems",
        "contests.publicProblemCount": "{count} public problems",
      },
    };

    return (key: string, values?: Record<string, string | number>) => {
      let template = translations[namespace]?.[key] ?? key;
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          template = template.replace(`{${name}}`, String(value));
        }
      }
      return template;
    };
  },
}));

vi.mock("@/lib/system-settings", () => ({
  getResolvedSystemSettings: getResolvedSystemSettingsMock,
  getResolvedSystemTimeZone: vi.fn(async () => "UTC"),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: {
        findFirst: problemFindFirstMock,
      },
    },
    select: vi.fn(),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  problems: {},
  submissions: {},
  problemTags: {},
  tags: {},
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn(),
    and: vi.fn(),
    count: vi.fn(),
    inArray: vi.fn(),
    sql: vi.fn((strings?: TemplateStringsArray) => strings?.join("")),
  };
});

vi.mock("@/lib/assignments/public-contests", () => ({
  getPublicContestById: getPublicContestByIdMock,
}));

vi.mock("@/lib/discussions/data", () => ({
  getDiscussionThreadById: getDiscussionThreadByIdMock,
  canReadProblemDiscussion: vi.fn(async () => true),
  listProblemDiscussionThreads: vi.fn(async () => []),
  listProblemEditorials: vi.fn(async () => []),
}));

vi.mock("@/lib/discussions/permissions", () => ({
  canModerateDiscussions: vi.fn(async () => false),
}));

describe("public detail page SEO metadata", () => {
  const METADATA_TEST_TIMEOUT_MS = 30_000;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getResolvedSystemSettingsMock.mockResolvedValue({
      siteTitle: "JudgeKit",
      siteDescription: "Online judge",
    });
  });

  it("enriches public problem metadata with tags and execution constraints", async () => {
    problemFindFirstMock.mockResolvedValue({
      title: "A + B",
      description: "Add two numbers.",
      visibility: "public",
      sequenceNumber: 12,
      difficulty: 1.23,
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      author: { name: "Alice" },
      problemTags: [
        { tag: { name: "dp" } },
        { tag: { name: "graphs" } },
      ],
    });

    const page = await import("@/app/(public)/practice/problems/[id]/page");
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: "problem-1" }) });

    expect(metadata.keywords).toEqual(expect.arrayContaining(["dp", "graphs", "Alice"]));
    expect((metadata.openGraph as { type?: string } | undefined)?.type).toBe("article");

    const image = Array.isArray(metadata.openGraph?.images)
      ? metadata.openGraph?.images[0]
      : metadata.openGraph?.images;
    const imageUrl = typeof image === "string"
      ? image
      : image instanceof URL
        ? image.toString()
        : String(image?.url);
    const url = new URL(imageUrl);

    expect(url.searchParams.get("badge")).toBe("#12");
    expect(url.searchParams.get("meta")).toContain("Difficulty 1.23");
    expect(url.searchParams.get("meta")).toContain("2000 ms");
    expect(url.searchParams.get("footer")).toBe("dp • graphs");
  }, METADATA_TEST_TIMEOUT_MS);

  it("enriches public contest metadata with status, mode, and problem counts", async () => {
    getPublicContestByIdMock.mockResolvedValue({
      id: "contest-1",
      title: "Spring Contest",
      description: "A public contest.",
      groupName: "Algo Group",
      examMode: "scheduled",
      scoringModel: "icpc",
      status: "open",
      problemCount: 5,
      publicProblemCount: 3,
    });

    const page = await import("@/app/(public)/contests/[id]/page");
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: "contest-1" }) });

    expect(metadata.keywords).toEqual(expect.arrayContaining(["Algo Group", "ICPC scoring"]));

    const image = Array.isArray(metadata.openGraph?.images)
      ? metadata.openGraph?.images[0]
      : metadata.openGraph?.images;
    const imageUrl = typeof image === "string"
      ? image
      : image instanceof URL
        ? image.toString()
        : String(image?.url);
    const url = new URL(imageUrl);

    expect(url.searchParams.get("badge")).toBe("Open");
    expect(url.searchParams.get("meta")).toBe("Algo Group • Scheduled • ICPC");
    expect(url.searchParams.get("footer")).toBe("5 problems • 3 public problems");
  }, METADATA_TEST_TIMEOUT_MS);

  it("enriches community thread metadata with reply context and problem footer", async () => {
    getDiscussionThreadByIdMock.mockResolvedValue({
      id: "thread-1",
      title: "How to solve A + B",
      content: "Start with reading two integers.",
      scopeType: "problem",
      posts: [{ id: "p1" }, { id: "p2" }],
      author: { name: "Bob" },
      problem: { visibility: "public", title: "A + B" },
    });

    const page = await import("@/app/(public)/community/threads/[id]/page");
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: "thread-1" }) });

    expect((metadata.openGraph as { type?: string } | undefined)?.type).toBe("article");

    const image = Array.isArray(metadata.openGraph?.images)
      ? metadata.openGraph?.images[0]
      : metadata.openGraph?.images;
    const imageUrl = typeof image === "string"
      ? image
      : image instanceof URL
        ? image.toString()
        : String(image?.url);
    const url = new URL(imageUrl);

    expect(url.searchParams.get("badge")).toBe("Problem discussion");
    expect(url.searchParams.get("meta")).toBe("Bob · 2 replies");
    expect(url.searchParams.get("footer")).toBe("A + B");
  }, METADATA_TEST_TIMEOUT_MS);
});
