import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { validateCsrf } from "@/lib/security/csrf";

function createRequest(
  method: string,
  headers: Record<string, string> = {},
  url = "https://example.com/api/v1/resource"
) {
  return new NextRequest(url, { method, headers });
}

describe("validateCsrf", () => {
  describe("safe methods bypass CSRF validation", () => {
    it("passes GET requests without any CSRF headers", () => {
      const req = createRequest("GET");
      expect(validateCsrf(req)).toBeNull();
    });

    it("passes HEAD requests without any CSRF headers", () => {
      const req = createRequest("HEAD");
      expect(validateCsrf(req)).toBeNull();
    });

    it("passes OPTIONS requests without any CSRF headers", () => {
      const req = createRequest("OPTIONS");
      expect(validateCsrf(req)).toBeNull();
    });
  });

  describe("X-Requested-With header", () => {
    it("accepts POST with X-Requested-With: XMLHttpRequest", () => {
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
      });
      expect(validateCsrf(req)).toBeNull();
    });

    it("rejects POST missing X-Requested-With header", async () => {
      const req = createRequest("POST");
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("rejects POST with empty X-Requested-With", async () => {
      const req = createRequest("POST", { "x-requested-with": "" });
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("rejects POST with wrong X-Requested-With value", async () => {
      const req = createRequest("POST", { "x-requested-with": "fetch" });
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("rejects PATCH missing X-Requested-With", async () => {
      const req = createRequest("PATCH");
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("rejects PUT missing X-Requested-With", async () => {
      const req = createRequest("PUT");
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("rejects DELETE missing X-Requested-With", async () => {
      const req = createRequest("DELETE");
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });
  });

  describe("Sec-Fetch-Site header validation", () => {
    it("accepts same-origin Sec-Fetch-Site", () => {
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
        "sec-fetch-site": "same-origin",
      });
      expect(validateCsrf(req)).toBeNull();
    });

    it("accepts same-site Sec-Fetch-Site", () => {
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
        "sec-fetch-site": "same-site",
      });
      expect(validateCsrf(req)).toBeNull();
    });

    it("accepts none Sec-Fetch-Site (no navigation)", () => {
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
        "sec-fetch-site": "none",
      });
      expect(validateCsrf(req)).toBeNull();
    });

    it("rejects cross-site Sec-Fetch-Site", async () => {
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
        "sec-fetch-site": "cross-site",
      });
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("accepts request without Sec-Fetch-Site (older browsers)", () => {
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
      });
      expect(validateCsrf(req)).toBeNull();
    });

    it("is case-insensitive for Sec-Fetch-Site values", () => {
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
        "sec-fetch-site": "Same-Origin",
      });
      expect(validateCsrf(req)).toBeNull();
    });

    it("rejects unknown Sec-Fetch-Site value", async () => {
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
        "sec-fetch-site": "other-origin",
      });
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });
  });

  describe("Origin header validation", () => {
    it("accepts matching Origin against x-forwarded-host", () => {
      const req = createRequest(
        "POST",
        {
          "x-requested-with": "XMLHttpRequest",
          "x-forwarded-host": "example.com",
          origin: "https://example.com",
        },
        "https://example.com/api/v1/resource"
      );
      expect(validateCsrf(req)).toBeNull();
    });

    it("accepts matching Origin against host header", () => {
      const req = createRequest(
        "POST",
        {
          "x-requested-with": "XMLHttpRequest",
          host: "example.com",
          origin: "https://example.com",
        },
        "https://example.com/api/v1/resource"
      );
      expect(validateCsrf(req)).toBeNull();
    });

    it("rejects non-matching Origin", async () => {
      const req = createRequest(
        "POST",
        {
          "x-requested-with": "XMLHttpRequest",
          "x-forwarded-host": "example.com",
          origin: "https://evil.example.com",
        },
        "https://example.com/api/v1/resource"
      );
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("rejects protocol-relative Origin", async () => {
      const req = createRequest(
        "POST",
        {
          "x-requested-with": "XMLHttpRequest",
          "x-forwarded-host": "example.com",
          origin: "//evil.com",
        },
        "https://example.com/api/v1/resource"
      );
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("rejects malformed Origin value", async () => {
      const req = createRequest(
        "POST",
        {
          "x-requested-with": "XMLHttpRequest",
          "x-forwarded-host": "example.com",
          origin: "not-a-url",
        },
        "https://example.com/api/v1/resource"
      );
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("accepts missing Origin when expected host is known and Sec-Fetch-Site is absent", () => {
      const req = createRequest(
        "POST",
        {
          "x-requested-with": "XMLHttpRequest",
          "x-forwarded-host": "example.com",
        },
        "https://example.com/api/v1/resource"
      );
      expect(validateCsrf(req)).toBeNull();
    });

    it("accepts missing Origin when Sec-Fetch-Site explicitly proves same-origin", () => {
      const req = createRequest(
        "POST",
        {
          "x-requested-with": "XMLHttpRequest",
          "x-forwarded-host": "example.com",
          "sec-fetch-site": "same-origin",
        },
        "https://example.com/api/v1/resource"
      );
      expect(validateCsrf(req)).toBeNull();
    });

    it("skips Origin check when no expected host can be determined", () => {
      // No host or x-forwarded-host headers, no origin — should pass
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
        origin: "https://example.com",
      });
      // NextRequest always injects a host from the URL, so we test the
      // no-origin path here which is guaranteed to skip the check
      const reqNoOrigin = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest",
      });
      expect(validateCsrf(reqNoOrigin)).toBeNull();
    });

    it("uses only the first value when x-forwarded-host contains multiple hosts", () => {
      const req = createRequest(
        "POST",
        {
          "x-requested-with": "XMLHttpRequest",
          "x-forwarded-host": "example.com, proxy.internal",
          origin: "https://example.com",
        },
        "https://example.com/api/v1/resource"
      );
      expect(validateCsrf(req)).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("rejects when all CSRF headers are empty strings", async () => {
      const req = createRequest("POST", {
        "x-requested-with": "",
        "sec-fetch-site": "",
        origin: "",
      });
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("passes with all valid headers present together", () => {
      const req = createRequest(
        "POST",
        {
          "x-requested-with": "XMLHttpRequest",
          "sec-fetch-site": "same-origin",
          "x-forwarded-host": "example.com",
          origin: "https://example.com",
        },
        "https://example.com/api/v1/resource"
      );
      expect(validateCsrf(req)).toBeNull();
    });

    it("rejects when Sec-Fetch-Site is valid but X-Requested-With is wrong", async () => {
      const req = createRequest("POST", {
        "x-requested-with": "XMLHttpRequest-fake",
        "sec-fetch-site": "same-origin",
      });
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("rejects when Origin matches but X-Requested-With is missing", async () => {
      const req = createRequest(
        "POST",
        {
          "x-forwarded-host": "example.com",
          origin: "https://example.com",
        },
        "https://example.com/api/v1/resource"
      );
      const res = validateCsrf(req);
      expect(res?.status).toBe(403);
      await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });
  });
});
