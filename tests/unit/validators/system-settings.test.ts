import { describe, expect, it } from "vitest";
import { systemSettingsSchema } from "@/lib/validators/system-settings";

describe("systemSettingsSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = systemSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid siteTitle", () => {
    const result = systemSettingsSchema.safeParse({ siteTitle: "My Judge" });
    expect(result.success).toBe(true);
    expect(result.data?.siteTitle).toBe("My Judge");
  });

  it("trims siteTitle via normalizeOptionalString", () => {
    const parsed = systemSettingsSchema.parse({ siteTitle: "  My Judge  " });
    expect(parsed.siteTitle).toBe("My Judge");
  });

  it("converts blank siteTitle to undefined", () => {
    const parsed = systemSettingsSchema.parse({ siteTitle: "   " });
    expect(parsed.siteTitle).toBeUndefined();
  });

  it("converts empty siteTitle to undefined", () => {
    const parsed = systemSettingsSchema.parse({ siteTitle: "" });
    expect(parsed.siteTitle).toBeUndefined();
  });

  it("rejects siteTitle longer than 100 characters", () => {
    const result = systemSettingsSchema.safeParse({ siteTitle: "a".repeat(101) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("siteTitleTooLong");
  });

  it("accepts siteTitle at exactly 100 characters", () => {
    const result = systemSettingsSchema.safeParse({ siteTitle: "a".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("accepts valid siteDescription", () => {
    const result = systemSettingsSchema.safeParse({ siteDescription: "A platform for competitive programming." });
    expect(result.success).toBe(true);
  });

  it("trims siteDescription via normalizeOptionalString", () => {
    const parsed = systemSettingsSchema.parse({ siteDescription: "  Some description  " });
    expect(parsed.siteDescription).toBe("Some description");
  });

  it("converts blank siteDescription to undefined", () => {
    const parsed = systemSettingsSchema.parse({ siteDescription: "   " });
    expect(parsed.siteDescription).toBeUndefined();
  });

  it("rejects siteDescription longer than 255 characters", () => {
    const result = systemSettingsSchema.safeParse({ siteDescription: "a".repeat(256) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("siteDescriptionTooLong");
  });

  it("accepts siteDescription at exactly 255 characters", () => {
    const result = systemSettingsSchema.safeParse({ siteDescription: "a".repeat(255) });
    expect(result.success).toBe(true);
  });

  it("accepts valid IANA timezone", () => {
    const result = systemSettingsSchema.safeParse({ timeZone: "America/New_York" });
    expect(result.success).toBe(true);
    expect(result.data?.timeZone).toBe("America/New_York");
  });

  it("accepts UTC timezone", () => {
    const result = systemSettingsSchema.safeParse({ timeZone: "UTC" });
    expect(result.success).toBe(true);
  });

  it("accepts Asia/Seoul timezone", () => {
    const result = systemSettingsSchema.safeParse({ timeZone: "Asia/Seoul" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid timezone string", () => {
    const result = systemSettingsSchema.safeParse({ timeZone: "Not/A/Real/Timezone" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidTimeZone");
  });

  it("rejects clearly invalid timezone", () => {
    const result = systemSettingsSchema.safeParse({ timeZone: "foobar" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidTimeZone");
  });

  it("rejects timezone longer than 100 characters", () => {
    const result = systemSettingsSchema.safeParse({ timeZone: "a".repeat(101) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidTimeZone");
  });

  it("converts blank timeZone to undefined", () => {
    const parsed = systemSettingsSchema.parse({ timeZone: "   " });
    expect(parsed.timeZone).toBeUndefined();
  });

  it("accepts all fields populated", () => {
    const result = systemSettingsSchema.safeParse({
      siteTitle: "JudgeKit",
      siteDescription: "An online judge system",
      timeZone: "Europe/London",
    });
    expect(result.success).toBe(true);
  });

  it("accepts omitted fields returning undefined", () => {
    const parsed = systemSettingsSchema.parse({});
    expect(parsed.siteTitle).toBeUndefined();
    expect(parsed.siteDescription).toBeUndefined();
    expect(parsed.timeZone).toBeUndefined();
  });
});
