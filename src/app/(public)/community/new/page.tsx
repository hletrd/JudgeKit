import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { DiscussionThreadForm } from "@/components/discussions/discussion-thread-form";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NO_INDEX_METADATA;

export default async function CommunityNewPage() {
  const [t, session, locale] = await Promise.all([
    getTranslations("publicShell"),
    auth(),
    getLocale(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-2xl font-semibold${locale !== "ko" ? " tracking-tight" : ""}`}>{t("community.newThreadTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("community.newThreadDescription")}</p>
      </div>
      <DiscussionThreadForm
        scopeType="general"
        titleLabel={t("community.form.titleLabel")}
        contentLabel={t("community.form.contentLabel")}
        submitLabel={t("community.form.submitLabel")}
        successLabel={t("community.form.success")}
        signInLabel={t("community.form.signIn")}
        canPost={Boolean(session?.user)}
        signInHref={buildLocalePath(`/login?callbackUrl=${encodeURIComponent(buildLocalePath("/community/new", locale))}`, locale)}
      />
    </div>
  );
}
