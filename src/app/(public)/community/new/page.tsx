import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { DiscussionThreadForm } from "@/components/discussions/discussion-thread-form";
import { NO_INDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NO_INDEX_METADATA;

export default async function CommunityNewPage() {
  const [t, session] = await Promise.all([
    getTranslations("publicShell"),
    auth(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("community.newThreadTitle")}</h1>
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
        signInHref="/login?callbackUrl=%2Fcommunity%2Fnew"
      />
    </div>
  );
}
