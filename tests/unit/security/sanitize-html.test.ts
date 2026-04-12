import { describe, expect, it } from "vitest";
import { sanitizeHtml, sanitizeMarkdown } from "@/lib/security/sanitize-html";

describe("sanitizeHtml", () => {
  it("preserves basic formatting content", () => {
    const sanitized = sanitizeHtml(
      '<p><strong>Bold</strong> <a href="https://example.com" rel="noreferrer">link</a></p>'
    );

    expect(sanitized).toContain("<strong>Bold</strong>");
    expect(sanitized).toContain('href="https://example.com"');
  });

  it("strips interactive elements and inline event handlers", () => {
    const sanitized = sanitizeHtml(
      '<form><input value="x" /><button onclick="alert(1)">Go</button><p onclick="alert(2)">Safe</p></form>'
    );

    expect(sanitized).not.toContain("<form");
    expect(sanitized).not.toContain("<input");
    expect(sanitized).not.toContain("<button");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).toContain("<p>Safe</p>");
  });

  it("removes generic wrapper tags and class-based styling hooks from legacy html", () => {
    const sanitized = sanitizeHtml(
      '<div class="outer"><span class="inner">Hello <strong>world</strong></span></div>'
    );

    expect(sanitized).toContain("Hello <strong>world</strong>");
    expect(sanitized).not.toContain("<div");
    expect(sanitized).not.toContain("<span");
    expect(sanitized).not.toContain("class=");
  });

  it("still preserves table markup while stripping legacy class attributes", () => {
    const sanitized = sanitizeHtml(
      '<table class="fancy"><tr><td class="cell">42</td></tr></table>'
    );

    expect(sanitized).toContain("<table>");
    expect(sanitized).toContain("<td>42</td>");
    expect(sanitized).not.toContain("class=");
  });
});

describe("OWASP XSS evasion vectors", () => {
  // 1. Event handler injection
  it("strips onerror event handler from img tag", () => {
    const sanitized = sanitizeHtml('<img src=x onerror=alert(1)>');
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("alert(1)");
    expect(sanitized).not.toContain('src="x"');
  });

  it("keeps root-relative image sources for first-party assets", () => {
    const sanitized = sanitizeHtml('<img src="/api/v1/files/file-1" alt="diagram">');
    expect(sanitized).toContain('src="/api/v1/files/file-1"');
  });

  it("strips external image sources from legacy html descriptions", () => {
    const sanitized = sanitizeHtml('<img src="https://tracker.example/pixel.png" alt="pixel">');
    expect(sanitized).not.toContain("tracker.example");
    expect(sanitized).not.toContain('src="https://tracker.example/pixel.png"');
  });

  // 2. SVG-based XSS
  it("strips SVG onload handler", () => {
    const sanitized = sanitizeHtml('<svg onload=alert(1)>');
    expect(sanitized).not.toContain("<svg");
    expect(sanitized).not.toContain("onload");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 3. JavaScript URI in anchor href
  it("strips javascript: URI from anchor href", () => {
    const sanitized = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 4. Data URI with embedded script
  it("strips data: URI from anchor href", () => {
    const sanitized = sanitizeHtml(
      '<a href="data:text/html,<script>alert(1)</script>">click</a>'
    );
    expect(sanitized).not.toContain("data:text/html");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 5. Style-based injection with javascript: URL
  it("strips style attribute containing javascript: URL", () => {
    const sanitized = sanitizeHtml(
      '<div style="background:url(javascript:alert(1))">'
    );
    expect(sanitized).not.toContain("style=");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 6. Nested HTML entity encoding in event handler
  it("strips onerror with HTML-entity-encoded payload", () => {
    const sanitized = sanitizeHtml('<img src=x onerror="&#97;lert(1)">');
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("alert(1)");
    expect(sanitized).not.toContain("&#97;");
  });

  // 7. Null byte injection inside tag name
  it("strips script tag containing null byte in tag name", () => {
    // DOMPurify removes the malformed <scr\0ipt> element; the inner text may
    // survive as an inert text node but is never wrapped in an executable
    // <script> element, so no code can run.
    const sanitized = sanitizeHtml("<scr\0ipt>alert(1)</script>");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("<SCRIPT");
  });

  // 8. Tag name obfuscation via uppercase
  it("strips uppercase SCRIPT tag", () => {
    const sanitized = sanitizeHtml("<SCRIPT>alert(1)</SCRIPT>");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("<SCRIPT");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 9. Attribute injection via backtick delimiter
  it("strips onclick attribute delimited by backticks", () => {
    const sanitized = sanitizeHtml("<div onclick=`alert(1)`>");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 10. CSS expression() injection
  it("strips style attribute containing CSS expression()", () => {
    const sanitized = sanitizeHtml(
      '<div style="width:expression(alert(1))">'
    );
    expect(sanitized).not.toContain("style=");
    expect(sanitized).not.toContain("expression(");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 11. Incomplete / self-closing script tag with data: src
  it("strips script tag with data: src", () => {
    const sanitized = sanitizeHtml("<script/src=data:,alert(1)>");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 12. Base tag injection
  it("strips base tag", () => {
    const sanitized = sanitizeHtml('<base href="http://evil.com/">');
    expect(sanitized).not.toContain("<base");
    expect(sanitized).not.toContain("evil.com");
  });

  // 13. Meta refresh with javascript: URL
  it("strips meta http-equiv refresh tag", () => {
    const sanitized = sanitizeHtml(
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'
    );
    expect(sanitized).not.toContain("<meta");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 14. Object/embed with javascript: data URI
  it("strips object tag with javascript: data attribute", () => {
    const sanitized = sanitizeHtml('<object data="javascript:alert(1)">');
    expect(sanitized).not.toContain("<object");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("alert(1)");
  });

  // 15. Form action with javascript: URI
  it("strips form with javascript: action and submit input", () => {
    const sanitized = sanitizeHtml(
      '<form action="javascript:alert(1)"><input type=submit>'
    );
    expect(sanitized).not.toContain("<form");
    expect(sanitized).not.toContain("<input");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("alert(1)");
  });
});

describe("sanitizeMarkdown", () => {
  it("strips null bytes from text", () => {
    expect(sanitizeMarkdown("hello\x00world")).toBe("helloworld");
  });

  it("strips other control characters but preserves newline, tab, and carriage return", () => {
    expect(sanitizeMarkdown("line1\nline2\tindented\r\nline3")).toBe(
      "line1\nline2\tindented\r\nline3"
    );
    expect(sanitizeMarkdown("before\x07bell\x0Bvertical\x0Cformfeed\x1Eafter")).toBe(
      "beforebellverticalformfeedafter"
    );
  });

  it("preserves normal text unchanged", () => {
    const text = "Hello, world! This is normal text.";
    expect(sanitizeMarkdown(text)).toBe(text);
  });

  it("handles empty string", () => {
    expect(sanitizeMarkdown("")).toBe("");
  });

  it("preserves markdown formatting (bold, links, code blocks)", () => {
    const markdown = "**bold** and [a link](https://example.com)\n```\ncode\n```";
    expect(sanitizeMarkdown(markdown)).toBe(markdown);
  });

  it("strips multiple different control characters at once", () => {
    const input = "a\x00b\x01c\x08d\x0Be\x0Cf\x1Fg\x7Fh";
    expect(sanitizeMarkdown(input)).toBe("abcdefgh");
  });
});
