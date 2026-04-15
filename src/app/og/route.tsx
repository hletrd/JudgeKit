import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = {
  width: 1200,
  height: 630,
};

function text(value: string | null, fallback: string, maxLength: number) {
  const normalized = value?.trim() || fallback;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}…` : normalized;
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
  const locale = searchParams.get("locale") === "ko" ? "한국어" : "English";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #7c3aed 100%)",
          color: "white",
          padding: "56px",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
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
            background: "rgba(15,23,42,0.20)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
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
                <div style={{ fontSize: "22px", opacity: 0.84 }}>{siteTitle}</div>
                <div style={{ fontSize: "42px", fontWeight: 700 }}>{section}</div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 18px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.14)",
                fontSize: "24px",
                fontWeight: 600,
              }}
            >
              {locale}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ fontSize: "68px", fontWeight: 800, lineHeight: 1.08 }}>{title}</div>
            <div style={{ fontSize: "30px", lineHeight: 1.35, opacity: 0.92 }}>{description}</div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "24px", opacity: 0.84 }}>judgekit</div>
            <div style={{ fontSize: "24px", opacity: 0.84 }}>Practice • Contests • Community</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
