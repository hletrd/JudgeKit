import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const contentType = "image/png";
export const revalidate = 86400;
export const size = {
  width: 1200,
  height: 630,
};

function text(value: string | null, fallback: string, maxLength: number) {
  const normalized = value?.trim() || fallback;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}…` : normalized;
}

// Per CLAUDE.md: Korean glyphs must render at the font's default letter-spacing.
// OG title/site strings come from arbitrary user content (problem/contest names),
// so the page's `locale` param doesn't reliably reflect the glyph language —
// detect Hangul per-string and drop any custom tracking when present.
function hasHangul(value: string): boolean {
  return /[ᄀ-ᇿ㄰-㆏가-힣]/.test(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = text(searchParams.get("title"), "JudgeKit", 120);
  const description = text(
    searchParams.get("description"),
    "Online judge for programming assignments, contests, and practice.",
    180,
  );
  const siteTitle = text(searchParams.get("siteTitle"), "JudgeKit", 60);
  const section = text(searchParams.get("section"), "Online Judge", 40);
  const badge = text(searchParams.get("badge"), "", 40);
  const meta = text(searchParams.get("meta"), "", 80);
  const footer = text(searchParams.get("footer"), "Practice • Contests • Community", 80);
  const locale = searchParams.get("locale") === "ko" ? "한국어" : "English";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, #0b1220 0%, #1d4ed8 52%, #7c3aed 100%)",
          color: "white",
          padding: "56px",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-100px",
            width: "320px",
            height: "320px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.10)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-140px",
            left: "-80px",
            width: "280px",
            height: "280px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: "32px",
            padding: "48px",
            background: "linear-gradient(180deg, rgba(11,18,32,0.58), rgba(11,18,32,0.32))",
            boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "0 auto auto 0",
              width: "100%",
              height: "6px",
              background: "linear-gradient(90deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04))",
              borderTopLeftRadius: "32px",
              borderTopRightRadius: "32px",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px", maxWidth: "70%" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "72px",
                  height: "72px",
                  borderRadius: "20px",
                  background: "rgba(255,255,255,0.14)",
                  fontSize: "30px",
                  fontWeight: 700,
                }}
              >
                &lt;/&gt;
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "18px", opacity: 0.8, letterSpacing: hasHangul(siteTitle) ? "normal" : "0.08em", textTransform: "uppercase" }}>
                  {siteTitle}
                </div>
                <div style={{ fontSize: "40px", fontWeight: 750, lineHeight: 1.1 }}>{section}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {badge ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 18px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.12)",
                    fontSize: "20px",
                    fontWeight: 600,
                  }}
                >
                  {badge}
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 18px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.16)",
                  fontSize: "22px",
                  fontWeight: 600,
                }}
              >
                {locale}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            {meta ? (
              <div
                style={{
                  display: "flex",
                  width: "fit-content",
                  alignItems: "center",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.08)",
                  padding: "10px 16px",
                  fontSize: "22px",
                  opacity: 0.9,
                }}
              >
                {meta}
              </div>
            ) : null}
            <div style={{ fontSize: "66px", fontWeight: 800, lineHeight: 1.04, letterSpacing: hasHangul(title) ? "normal" : "-0.03em" }}>{title}</div>
            <div style={{ maxWidth: "92%", fontSize: "29px", lineHeight: 1.34, opacity: 0.93 }}>{description}</div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: "20px",
              borderTop: "1px solid rgba(255,255,255,0.14)",
              paddingTop: "24px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "22px", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Online judge
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700 }}>{siteTitle}</div>
            </div>
            <div style={{ fontSize: "22px", opacity: 0.84, textAlign: "right", maxWidth: "48%" }}>{footer}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
