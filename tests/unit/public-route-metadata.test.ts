import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      common: {
        appName: "JudgeKit",
        appDescription: "Online judge",
      },
      submissions: {
        title: "Submissions",
        mySubmissions: "View your personal submissions and results.",
      },
    };

    return translations[namespace]?.[key] ?? key;
  },
  getLocale: async () => "en",
}));

vi.mock("@/lib/system-settings", () => ({
  getResolvedSystemSettings: vi.fn(async () => ({
    siteTitle: "JudgeKit",
    siteDescription: "Online judge",
  })),
  getResolvedSystemTimeZone: vi.fn(async () => "UTC"),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    query: {
      submissions: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/db/schema", () => ({
  submissions: {},
  problems: {},
  users: {},
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn(),
    and: vi.fn(),
    count: vi.fn(),
    desc: vi.fn(),
    like: vi.fn(),
    or: vi.fn(),
  };
});

describe("public personal-route metadata", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("marks the submissions index as noindex", async () => {
    const submissionsPage = await import("@/app/(public)/submissions/page");
    const metadata = await submissionsPage.generateMetadata();

    expect(metadata.title).toBe("Submissions");
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("marks submission detail pages as noindex", async () => {
    const submissionDetailPage = await import("@/app/(public)/submissions/[id]/page");
    const metadata = await submissionDetailPage.generateMetadata();

    expect(metadata.title).toBe("Submissions");
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
    });
  });
});
