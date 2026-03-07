"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateSystemSettings } from "@/lib/actions/system-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SystemSettingsFormProps = {
  initialSiteTitle: string;
  initialSiteDescription: string;
  initialTimeZone: string;
  defaultSiteTitle: string;
  defaultSiteDescription: string;
  defaultTimeZone: string;
  currentSiteTitle: string;
  currentSiteDescription: string;
  currentTimeZone: string;
};

export function SystemSettingsForm({
  initialSiteTitle,
  initialSiteDescription,
  initialTimeZone,
  defaultSiteTitle,
  defaultSiteDescription,
  defaultTimeZone,
  currentSiteTitle,
  currentSiteDescription,
  currentTimeZone,
}: SystemSettingsFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");
  const [siteTitle, setSiteTitle] = useState(initialSiteTitle);
  const [siteDescription, setSiteDescription] = useState(initialSiteDescription);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const result = await updateSystemSettings({ siteTitle, siteDescription, timeZone });

      if (!result.success) {
        toast.error(t(result.error ?? "updateError"));
        return;
      }

      toast.success(t("updateSuccess"));
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="site-title">{t("siteTitle")}</Label>
        <Input
          id="site-title"
          value={siteTitle}
          onChange={(event) => setSiteTitle(event.target.value)}
          placeholder={defaultSiteTitle}
        />
        <p className="text-xs text-muted-foreground">
          {t("siteTitleHint", { current: currentSiteTitle })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="site-description">{t("siteDescription")}</Label>
        <Textarea
          id="site-description"
          value={siteDescription}
          onChange={(event) => setSiteDescription(event.target.value)}
          placeholder={defaultSiteDescription}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          {t("siteDescriptionHint", { current: currentSiteDescription })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="time-zone">{t("timeZone")}</Label>
        <Input
          id="time-zone"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          placeholder={defaultTimeZone}
        />
        <p className="text-xs text-muted-foreground">
          {t("timeZoneHint", { current: currentTimeZone })}
        </p>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
