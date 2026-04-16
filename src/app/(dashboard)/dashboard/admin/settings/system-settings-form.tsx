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
import { DEFAULT_PLATFORM_MODE, PLATFORM_MODE_VALUES, getPlatformModePolicy } from "@/lib/platform-mode";
import type { PlatformMode } from "@/types";

type SystemSettingsFormProps = {
  initialSiteTitle: string;
  initialSiteDescription: string;
  initialTimeZone: string;
  initialPlatformMode: PlatformMode;
  initialDefaultLanguage: string;
  initialDefaultLocale: string;
  defaultSiteTitle: string;
  defaultSiteDescription: string;
  defaultTimeZone: string;
  currentSiteTitle: string;
  currentSiteDescription: string;
  currentTimeZone: string;
  currentPlatformMode: PlatformMode;
  initialAiAssistantEnabled: boolean;
  initialPublicSignupEnabled: boolean;
  initialSignupHcaptchaEnabled: boolean;
  signupHcaptchaAvailable: boolean;
  initialHcaptchaSiteKey: string;
  initialHcaptchaSecretMasked: string;
};

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

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
  initialPublicSignupEnabled,
  initialSignupHcaptchaEnabled,
  signupHcaptchaAvailable,
  initialHcaptchaSiteKey,
  initialHcaptchaSecretMasked,
  initialDefaultLanguage,
  initialDefaultLocale,
}: SystemSettingsFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");
  const [siteTitle, setSiteTitle] = useState(initialSiteTitle);
  const [siteDescription, setSiteDescription] = useState(initialSiteDescription);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [platformMode, setPlatformMode] = useState<PlatformMode>(initialPlatformMode);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(initialAiAssistantEnabled);
  const [publicSignupEnabled, setPublicSignupEnabled] = useState(initialPublicSignupEnabled);
  const [signupHcaptchaEnabled, setSignupHcaptchaEnabled] = useState(initialSignupHcaptchaEnabled);
  const [hcaptchaSiteKey, setHcaptchaSiteKey] = useState(initialHcaptchaSiteKey);
  const [hcaptchaSecret, setHcaptchaSecret] = useState(initialHcaptchaSecretMasked);
  const [defaultLanguage, setDefaultLanguage] = useState(initialDefaultLanguage);
  const [defaultLocale, setDefaultLocale] = useState(initialDefaultLocale);
  const [isLoading, setIsLoading] = useState(false);
  const platformPolicy = useMemo(() => getPlatformModePolicy(platformMode), [platformMode]);
  const ianaTimeZones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }, []);
  const defaultLocaleLabels = useMemo(
    (): Record<string, string> => ({
      _auto: t("defaultLocaleAuto"),
      en: tCommon("english"),
      ko: tCommon("korean"),
    }),
    [t, tCommon]
  );
  const defaultLocaleLabel = defaultLocaleLabels[defaultLocale || "_auto"] || defaultLocale || "_auto";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedTimeZone = timeZone.trim();
    const normalizedDefaultLanguage = defaultLanguage.trim();

    if (normalizedTimeZone && !isValidTimeZone(normalizedTimeZone)) {
      toast.error(t("invalidTimeZone"));
      return;
    }

    setIsLoading(true);

    try {
      const result = await updateSystemSettings({
        siteTitle,
        siteDescription,
        timeZone: normalizedTimeZone,
        platformMode,
        aiAssistantEnabled,
        publicSignupEnabled,
        signupHcaptchaEnabled,
        hcaptchaSiteKey,
        // Only send secret if user actually changed it from the masked placeholder
        ...(hcaptchaSecret !== initialHcaptchaSecretMasked ? { hcaptchaSecret } : {}),
        defaultLanguage: normalizedDefaultLanguage || undefined,
        defaultLocale: (defaultLocale || undefined) as "en" | "ko" | undefined,
      });

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
        <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{t("platformModeOperationalTitle")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              {platformPolicy.restrictAiByDefault
                ? t("platformModeAiRestricted")
                : t("platformModeAiAvailable")}
            </li>
            <li>
              {platformPolicy.restrictStandaloneCompiler
                ? t("platformModeCompilerRestricted")
                : t("platformModeCompilerAvailable")}
            </li>
            <li>{t("platformModeHighStakesNotice")}</li>
          </ul>
        </div>
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

      <div className="space-y-2">
        <Label htmlFor="default-language">{t("defaultLanguage")}</Label>
        <Input
          id="default-language"
          value={defaultLanguage}
          onChange={(e) => setDefaultLanguage(e.target.value)}
          placeholder={t("defaultLanguagePlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("defaultLanguageHint")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="default-locale">{t("defaultLocale")}</Label>
        <Select value={defaultLocale || "_auto"} onValueChange={(value) => setDefaultLocale(value === "_auto" || !value ? "" : String(value))}>
          <SelectTrigger id="default-locale">
            <SelectValue>{defaultLocaleLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_auto" label={t("defaultLocaleAuto")}>
              {t("defaultLocaleAuto")}
            </SelectItem>
            <SelectItem value="en" label={tCommon("english")}>
              {tCommon("english")}
            </SelectItem>
            <SelectItem value="ko" label={tCommon("korean")}>
              {tCommon("korean")}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("defaultLocaleHint")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="public-signup-enabled">{t("publicSignupTitle")}</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            id="public-signup-enabled"
            checked={publicSignupEnabled}
            onCheckedChange={(checked) => setPublicSignupEnabled(checked === true)}
          />
          <span>{t("publicSignupEnabled")}</span>
        </label>
        <p className="text-xs text-muted-foreground">{t("publicSignupEnabledHint")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-hcaptcha-enabled">{t("signupHcaptchaTitle")}</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            id="signup-hcaptcha-enabled"
            checked={signupHcaptchaEnabled}
            onCheckedChange={(checked) => setSignupHcaptchaEnabled(checked === true)}
          />
          <span>{t("signupHcaptchaEnabled")}</span>
        </label>
        <p className="text-xs text-muted-foreground">
          {t("signupHcaptchaEnabledHint")}
        </p>
      </div>

      <div className="space-y-2 pl-4 border-l-2 border-muted">
        <div className="space-y-2">
          <Label htmlFor="hcaptcha-site-key">{t("hcaptchaSiteKeyLabel")}</Label>
          <Input
            id="hcaptcha-site-key"
            value={hcaptchaSiteKey}
            onChange={(event) => setHcaptchaSiteKey(event.target.value)}
            placeholder={t("hcaptchaSiteKeyPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("hcaptchaSiteKeyHint")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hcaptcha-secret">{t("hcaptchaSecretLabel")}</Label>
          <Input
            id="hcaptcha-secret"
            type="password"
            value={hcaptchaSecret}
            onChange={(event) => setHcaptchaSecret(event.target.value)}
            placeholder={t("hcaptchaSecretPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("hcaptchaSecretHint")}
          </p>
        </div>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
