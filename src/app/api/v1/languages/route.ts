import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const languages = await db
      .select()
      .from(languageConfigs)
      .where(eq(languageConfigs.isEnabled, true));

    return NextResponse.json({ data: languages });
  } catch (error) {
    console.error("GET /api/v1/languages error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
