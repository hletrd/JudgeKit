"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateSystemSettings } from "@/lib/actions/system-settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_PLATFORM_MODE, PLATFORM_MODE_VALUES } from "@/lib/platform-mode";
import type { PlatformMode } from "@/types";

type SystemSettingsFormProps = {
  initialSiteTitle: string;
  initialSiteDescription: string;
  initialTimeZone: string;
  initialPlatformMode: PlatformMode;
  defaultSiteTitle: string;
  defaultSiteDescription: string;
  defaultTimeZone: string;
  currentSiteTitle: string;
  currentSiteDescription: string;
  currentTimeZone: string;
  currentPlatformMode: PlatformMode;
  initialAiAssistantEnabled: boolean;
};

export function SystemSettingsForm({
  initialSiteTitle,
  initialSiteDescription,
  initialTimeZone,
  initialPlatformMode,
  defaultSiteTitle,
  defaultSiteDescription,
  defaultTimeZone,
  currentSiteTitle,
  currentSiteDescription,
  currentTimeZone,
  currentPlatformMode,
  initialAiAssistantEnabled,
}: SystemSettingsFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");
  const [siteTitle, setSiteTitle] = useState(initialSiteTitle);
  const [siteDescription, setSiteDescription] = useState(initialSiteDescription);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [platformMode, setPlatformMode] = useState<PlatformMode>(initialPlatformMode);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(initialAiAssistantEnabled);
  const [isLoading, setIsLoading] = useState(false);
  const ianaTimeZones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (timeZone && ianaTimeZones.length > 0 && !ianaTimeZones.includes(timeZone)) {
      toast.error(t("invalidTimeZone"));
      return;
    }

    setIsLoading(true);

    try {
      const result = await updateSystemSettings({ siteTitle, siteDescription, timeZone, platformMode, aiAssistantEnabled });

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
          list="iana-timezones"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          placeholder={defaultTimeZone}
        />
        {ianaTimeZones.length > 0 && (
          <datalist id="iana-timezones">
            {ianaTimeZones.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        )}
        <p className="text-xs text-muted-foreground">
          {t("timeZoneHint", { current: currentTimeZone })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="platform-mode">{t("platformMode")}</Label>
        <Select value={platformMode} onValueChange={(value) => setPlatformMode(value as PlatformMode)}>
          <SelectTrigger id="platform-mode">
            <SelectValue>{t(`platformModeOptions.${platformMode}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_MODE_VALUES.map((mode) => (
              <SelectItem key={mode} value={mode} label={t(`platformModeOptions.${mode}`)}>
                {t(`platformModeOptions.${mode}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t("platformModeHint", {
            current: t(`platformModeOptions.${currentPlatformMode ?? DEFAULT_PLATFORM_MODE}`),
          })}
        </p>
        <p className="text-xs text-muted-foreground">{t(`platformModeDescriptions.${platformMode}`)}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-assistant-enabled">{t("aiAssistantTitle")}</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            id="ai-assistant-enabled"
            checked={aiAssistantEnabled}
            onCheckedChange={(checked) => setAiAssistantEnabled(checked === true)}
          />
          <span>{t("aiAssistantEnabled")}</span>
        </label>
        <p className="text-xs text-muted-foreground">{t("aiAssistantEnabledHint")}</p>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
