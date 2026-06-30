import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getResolvedSystemSettingsMock,
  dbSelectMock,
  dbFromMock,
  dbWhereMock,
  rawQueryOneMock,
} = vi.hoisted(() => ({
  getResolvedSystemSettingsMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbFromMock: vi.fn(),
  dbWhereMock: vi.fn(),
  rawQueryOneMock: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      common: {
        appName: "JudgeKit",
        appDescription: "Online judge",
        paginationPage: "Page {page}",
      },
      publicShell: {
        "nav.practice": "Practice",
        "practice.catalogTitle": "Public problem catalog",
        "practice.catalogDescription": "Browse public problems.",
      },
      rankings: {
        title: "Rankings",
        description: "User rankings by solved problems.",
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
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    query: {
      problems: {
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/db/schema", () => ({
  problems: {},
  submissions: {},
  users: {},
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: rawQueryOneMock,
  rawQueryAll: vi.fn(),
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    asc: vi.fn(),
    count: vi.fn(),
    eq: vi.fn(),
    sql: vi.fn(),
  };
});

describe("public SEO metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResolvedSystemSettingsMock.mockResolvedValue({
      siteTitle: "JudgeKit",
      siteDescription: "Online judge",
    });
    dbWhereMock.mockResolvedValue([{ total: 60 }]);
    dbFromMock.mockReturnValue({ where: dbWhereMock });
    dbSelectMock.mockReturnValue({ from: dbFromMock });
    rawQueryOneMock.mockResolvedValue({ total: 120 });
  });

  it("builds page-aware practice catalog metadata for page 2", async () => {
    const practicePage = await import("@/app/(public)/practice/page");
    const metadata = await practicePage.generateMetadata({
      searchParams: Promise.resolve({ page: "2" }),
    });

    expect(metadata.title).toBe("Public problem catalog · Page 2");
    expect(metadata.description).toContain("Page 2");
    expect(metadata.alternates?.canonical).toBe("/practice?page=2");
    expect(metadata.alternates?.languages?.ko).toBe("/practice?page=2&locale=ko");
  }, 30_000);

  it("clamps out-of-range practice metadata to the rendered last page", async () => {
    const practicePage = await import("@/app/(public)/practice/page");
    const metadata = await practicePage.generateMetadata({
      searchParams: Promise.resolve({ page: "9999" }),
    });

    expect(metadata.title).toBe("Public problem catalog · Page 2");
    expect(metadata.alternates?.canonical).toBe("/practice?page=2");
  });

  it("builds page-aware rankings metadata for page 3", async () => {
    rawQueryOneMock.mockResolvedValue({ total: 200 });

    const rankingsPage = await import("@/app/(public)/rankings/page");
    const metadata = await rankingsPage.generateMetadata({
      searchParams: Promise.resolve({ page: "3" }),
    });

    expect(metadata.title).toBe("Rankings · Page 3");
    expect(metadata.description).toContain("Page 3");
    expect(metadata.alternates?.canonical).toBe("/rankings?page=3");
    expect(metadata.alternates?.languages?.ko).toBe("/rankings?page=3&locale=ko");
  });

  it("clamps out-of-range rankings metadata to the rendered last page", async () => {
    rawQueryOneMock.mockResolvedValue({ total: 120 });

    const rankingsPage = await import("@/app/(public)/rankings/page");
    const metadata = await rankingsPage.generateMetadata({
      searchParams: Promise.resolve({ page: "9999" }),
    });

    expect(metadata.title).toBe("Rankings · Page 3");
    expect(metadata.alternates?.canonical).toBe("/rankings?page=3");
  });
});
