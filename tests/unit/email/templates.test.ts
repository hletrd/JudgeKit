import { describe, expect, it } from "vitest";
import {
  renderPasswordResetEmail,
  renderEmailVerificationEmail,
  renderRecruitingInvitationEmail,
  renderSiteEventEmail,
} from "@/lib/email/templates";

// Regression lock for the email HTML-escaping security control (cycle-1 F3 /
// TE-C1-1). A future refactor that drops escaping on any interpolated value
// would re-introduce HTML injection into outbound emails; these assertions
// fail loudly if that happens.

const XSS = `<script>alert('x')</script>`;
const SPECIALS = `<>&"'`;
const ESCAPED_SPECIALS = "&lt;&gt;&amp;&quot;&#39;";

describe("email templates — HTML escaping", () => {
  it("escapes a script payload and special chars in the recruiting invitation html", async () => {
    const { html, text, subject } = await renderRecruitingInvitationEmail({
      to: "candidate@example.com",
      candidateName: XSS,
      assessmentTitle: SPECIALS,
      accessUrl: "https://app.example.com/recruit/abc?a=1&b=2",
      expiresAt: null,
    });

    // html must NOT contain a live <script> tag from candidateName
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // assessmentTitle special chars escaped in the body
    expect(html).toContain(ESCAPED_SPECIALS);
    // ampersand in the URL escaped
    expect(html).toContain("a=1&amp;b=2");
    expect(html).not.toContain("a=1&b=2");

    // text body keeps the raw (unescaped) values — it is plaintext, not HTML
    expect(text).toContain(XSS);
    expect(text).toContain("a=1&b=2");

    // subject contains the (raw) assessment title
    expect(subject).toContain(SPECIALS);
  });

  it("omits the expiry line when expiresAt is null and includes it when set", async () => {
    const withoutExpiry = await renderRecruitingInvitationEmail({
      to: "candidate@example.com",
      candidateName: "Jane",
      assessmentTitle: "Backend Challenge",
      accessUrl: "https://app.example.com/recruit/tok",
      expiresAt: null,
    });
    expect(withoutExpiry.html).not.toContain("expires on");
    expect(withoutExpiry.text).not.toContain("expires on");

    const withExpiry = await renderRecruitingInvitationEmail({
      to: "candidate@example.com",
      candidateName: "Jane",
      assessmentTitle: "Backend Challenge",
      accessUrl: "https://app.example.com/recruit/tok",
      expiresAt: new Date("2030-01-15T23:59:59Z"),
    });
    expect(withExpiry.html).toContain("2030-01-15");
    expect(withExpiry.text).toContain("2030-01-15");
  });

  it("escapes the URL in the password reset html but keeps it raw in text", async () => {
    const { html, text } = await renderPasswordResetEmail({
      to: "user@example.com",
      resetUrl: "https://app.example.com/reset-password?token=a&x=<b>",
      expiresInMinutes: 60,
    });
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("token=a&amp;x=");
    expect(text).toContain("token=a&x=<b>");
  });

  it("escapes the URL in the email verification html", async () => {
    const { html, text } = await renderEmailVerificationEmail({
      to: "user@example.com",
      verificationUrl: "https://app.example.com/verify-email?token=a&y=<z>",
      expiresInMinutes: 24 * 60,
    });
    expect(html).not.toContain("<z>");
    expect(html).toContain("&lt;z&gt;");
    expect(html).toContain("token=a&amp;y=");
    expect(text).toContain("token=a&y=<z>");
  });

  it("escapes title, eventType and details in the site event html", async () => {
    const { html, text, subject } = await renderSiteEventEmail({
      to: "ops@example.com",
      eventType: `deploy<&>`,
      title: XSS,
      details: `line1 <img src=x onerror=alert(1)>`,
      severity: "critical",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).toContain("deploy&lt;&amp;&gt;");
    // text keeps raw values; subject reflects severity + raw title
    expect(text).toContain("line1 <img src=x onerror=alert(1)>");
    expect(subject).toContain("[CRITICAL]");
  });
});
