import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots metadata route", () => {
  it("publishes a sitemap and disallows private surfaces", () => {
    vi.stubEnv("AUTH_URL", "https://judgekit.example");

    const metadata = robots();

    expect(metadata.host).toBe("https://judgekit.example");
    expect(metadata.sitemap).toBe("https://judgekit.example/sitemap.xml");
    expect(metadata.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api",
        "/dashboard",
        "/workspace",
        "/control",
        "/login",
        "/signup",
        "/change-password",
        "/recruit",
        "/community/new",
      ],
    });
  });
});
