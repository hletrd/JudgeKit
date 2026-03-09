import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { getJudgeLanguageDefinition } from "@/lib/judge/languages";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const languages = await db
      .select()
      .from(languageConfigs)
      .where(eq(languageConfigs.isEnabled, true));

    return NextResponse.json({
      data: languages.flatMap((language) => {
        const definition = getJudgeLanguageDefinition(language.language);

        if (!definition) {
          return [];
        }

        return [{
          id: language.id,
          language: definition.language,
          displayName: definition.displayName,
          standard: definition.standard,
          extension: definition.extension,
        }];
      }),
    });
  } catch (error) {
    console.error("GET /api/v1/languages error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}
