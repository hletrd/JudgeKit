import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";

export async function generateMetadata() {
  const tState = await getTranslations("dashboardState");
  return {
    title: tState("notFoundTitle"),
    ...NO_INDEX_METADATA,
  };
}

export default async function PublicNotFound() {
  const [tCommon, tShell, tState, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("publicShell"),
    getTranslations("dashboardState"),
    getLocale(),
  ]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">404</p>
      <h1 className={`text-3xl font-semibold${locale !== "ko" ? " tracking-tight" : ""} sm:text-4xl`}>
        {tState("notFoundTitle")}
      </h1>
      <p className="max-w-md text-base leading-7 text-muted-foreground">
        {tState("notFoundDescription")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href={buildLocalePath("/", locale)}>
          <Button>{tCommon("back")}</Button>
        </Link>
        <Link href={buildLocalePath("/practice", locale)}>
          <Button variant="outline">{tShell("nav.practice")}</Button>
        </Link>
      </div>
    </div>
  );
}
