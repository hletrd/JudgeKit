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
  initialSiteIconUrl: string;
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
  initialEmailVerificationRequired: boolean;
  initialCommunityUpvoteEnabled: boolean;
  initialCommunityDownvoteEnabled: boolean;
  initialAutoCodeReviewEnabled: boolean;
  initialSmtpHost: string;
  initialSmtpPort: string;
  initialSmtpSecure: boolean;
  initialSmtpUser: string;
  initialSmtpPassMasked: string;
  initialSmtpFrom: string;
  initialSignupHcaptchaEnabled: boolean;
  initialHcaptchaSiteKey: string;
  initialHcaptchaSecretMasked: string;
  initialAllowAiAssistantInRestrictedModes: boolean;
  initialAllowStandaloneCompilerInRestrictedModes: boolean;
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
  initialSiteIconUrl,
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
  initialEmailVerificationRequired,
  initialCommunityUpvoteEnabled,
  initialCommunityDownvoteEnabled,
  initialAutoCodeReviewEnabled,
  initialSmtpHost,
  initialSmtpPort,
  initialSmtpSecure,
  initialSmtpUser,
  initialSmtpPassMasked,
  initialSmtpFrom,
  initialSignupHcaptchaEnabled,
  initialHcaptchaSiteKey,
  initialHcaptchaSecretMasked,
  initialDefaultLanguage,
  initialDefaultLocale,
  initialAllowAiAssistantInRestrictedModes,
  initialAllowStandaloneCompilerInRestrictedModes,
}: SystemSettingsFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");
  const [siteTitle, setSiteTitle] = useState(initialSiteTitle);
  const [siteDescription, setSiteDescription] = useState(initialSiteDescription);
  const [siteIconUrl, setSiteIconUrl] = useState(initialSiteIconUrl);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [platformMode, setPlatformMode] = useState<PlatformMode>(initialPlatformMode);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(initialAiAssistantEnabled);
  const [publicSignupEnabled, setPublicSignupEnabled] = useState(initialPublicSignupEnabled);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(initialEmailVerificationRequired);
  const [communityUpvoteEnabled, setCommunityUpvoteEnabled] = useState(initialCommunityUpvoteEnabled);
  const [communityDownvoteEnabled, setCommunityDownvoteEnabled] = useState(initialCommunityDownvoteEnabled);
  const [autoCodeReviewEnabled, setAutoCodeReviewEnabled] = useState(initialAutoCodeReviewEnabled);
  const [smtpHost, setSmtpHost] = useState(initialSmtpHost);
  const [smtpPort, setSmtpPort] = useState(initialSmtpPort);
  const [smtpSecure, setSmtpSecure] = useState(initialSmtpSecure);
  const [smtpUser, setSmtpUser] = useState(initialSmtpUser);
  const [smtpPass, setSmtpPass] = useState(initialSmtpPassMasked);
  const [smtpFrom, setSmtpFrom] = useState(initialSmtpFrom);
  const [signupHcaptchaEnabled, setSignupHcaptchaEnabled] = useState(initialSignupHcaptchaEnabled);
  const [hcaptchaSiteKey, setHcaptchaSiteKey] = useState(initialHcaptchaSiteKey);
  const [hcaptchaSecret, setHcaptchaSecret] = useState(initialHcaptchaSecretMasked);
  const [defaultLanguage, setDefaultLanguage] = useState(initialDefaultLanguage);
  const [defaultLocale, setDefaultLocale] = useState(initialDefaultLocale);
  const [allowAiAssistantInRestrictedModes, setAllowAiAssistantInRestrictedModes] = useState(
    initialAllowAiAssistantInRestrictedModes
  );
  const [allowStandaloneCompilerInRestrictedModes, setAllowStandaloneCompilerInRestrictedModes] = useState(
    initialAllowStandaloneCompilerInRestrictedModes
  );
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [timeZoneError, setTimeZoneError] = useState(false);
  const platformPolicy = useMemo(() => getPlatformModePolicy(platformMode), [platformMode]);
  // The mode forces AI off in restricted modes; the override re-enables control.
  const aiForcedOffByMode = platformPolicy.restrictAiByDefault && !allowAiAssistantInRestrictedModes;
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
      setTimeZoneError(true);
      toast.error(t("invalidTimeZone"));
      return;
    }

    setTimeZoneError(false);

    setIsLoading(true);

    try {
      const result = await updateSystemSettings({
        siteTitle,
        siteDescription,
        siteIconUrl,
        timeZone: normalizedTimeZone,
        platformMode,
        aiAssistantEnabled,
        allowAiAssistantInRestrictedModes,
        allowStandaloneCompilerInRestrictedModes,
        publicSignupEnabled,
        emailVerificationRequired,
        communityUpvoteEnabled,
        communityDownvoteEnabled,
        autoCodeReviewEnabled,
        smtpHost,
        smtpPort: smtpPort ? Number(smtpPort) : undefined,
        smtpSecure,
        smtpUser,
        ...(smtpPass !== initialSmtpPassMasked ? { smtpPass } : {}),
        smtpFrom,
        signupHcaptchaEnabled,
        hcaptchaSiteKey,
        // Only send secret if user actually changed it from the masked placeholder
        ...(hcaptchaSecret !== initialHcaptchaSecretMasked ? { hcaptchaSecret } : {}),
        defaultLanguage: normalizedDefaultLanguage || undefined,
        defaultLocale: (defaultLocale || undefined) as "en" | "ko" | undefined,
        currentPassword,
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
        <Label htmlFor="site-icon-url">{t("siteIconUrlLabel")}</Label>
        <Input
          id="site-icon-url"
          value={siteIconUrl}
          onChange={(event) => setSiteIconUrl(event.target.value)}
          placeholder={t("siteIconUrlPlaceholder")}
        />
        <p className="text-xs text-muted-foreground">
          {t("siteIconUrlHint")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="time-zone">{t("timeZone")}</Label>
        <Input
          id="time-zone"
          list="iana-timezones"
          value={timeZone}
          onChange={(event) => { setTimeZone(event.target.value); setTimeZoneError(false); }}
          placeholder={defaultTimeZone}
          aria-invalid={timeZoneError || undefined}
          aria-describedby={timeZoneError ? "time-zone-error" : undefined}
        />
        {timeZoneError && (
          <p id="time-zone-error" className="text-sm text-destructive" role="alert">
            {t("invalidTimeZone")}
          </p>
        )}
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
        {((platformPolicy.restrictAiByDefault && allowAiAssistantInRestrictedModes) ||
          (platformPolicy.restrictStandaloneCompiler && allowStandaloneCompilerInRestrictedModes)) && (
          // Prominent "overrides active" indicator (RPF cycle-1 UX2/AD3): the
          // plausible operator mistake is enabling an override for a workshop
          // and forgetting it before an exam — the muted operational list
          // below is too easy to skim past.
          <p
            role="status"
            className="rounded-md border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-xs font-medium text-yellow-700 dark:text-yellow-400"
          >
            {t("restrictedModeOverridesActive")}
          </p>
        )}
        <div className="space-y-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{t("platformModeOperationalTitle")}</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              {platformPolicy.restrictAiByDefault
                ? (allowAiAssistantInRestrictedModes ? t("platformModeAiOverridden") : t("platformModeAiRestricted"))
                : t("platformModeAiAvailable")}
            </li>
            <li>
              {platformPolicy.restrictStandaloneCompiler
                ? (allowStandaloneCompilerInRestrictedModes ? t("platformModeCompilerOverridden") : t("platformModeCompilerRestricted"))
                : t("platformModeCompilerAvailable")}
            </li>
            <li>{t("platformModeHighStakesNotice")}</li>
          </ul>
          {platformPolicy.restrictAiByDefault && (
            <div className="space-y-1 border-t pt-2">
              <label className="flex items-center gap-2 text-foreground">
                <Checkbox
                  id="allow-ai-in-restricted-modes"
                  checked={allowAiAssistantInRestrictedModes}
                  onCheckedChange={(checked) => setAllowAiAssistantInRestrictedModes(checked === true)}
                />
                <span>{t("allowAiAssistantInRestrictedModes")}</span>
              </label>
              <p>{t("allowAiAssistantInRestrictedModesHint")}</p>
            </div>
          )}
          {platformPolicy.restrictStandaloneCompiler && (
            <div className="space-y-1 border-t pt-2">
              <label className="flex items-center gap-2 text-foreground">
                <Checkbox
                  id="allow-compiler-in-restricted-modes"
                  checked={allowStandaloneCompilerInRestrictedModes}
                  onCheckedChange={(checked) => setAllowStandaloneCompilerInRestrictedModes(checked === true)}
                />
                <span>{t("allowStandaloneCompilerInRestrictedModes")}</span>
              </label>
              <p>{t("allowStandaloneCompilerInRestrictedModesHint")}</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-assistant-enabled">{t("aiAssistantTitle")}</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            id="ai-assistant-enabled"
            checked={aiAssistantEnabled}
            disabled={aiForcedOffByMode}
            onCheckedChange={(checked) => setAiAssistantEnabled(checked === true)}
          />
          <span>{t("aiAssistantEnabled")}</span>
        </label>
        <p className="text-xs text-muted-foreground">{t("aiAssistantEnabledHint")}</p>
        {aiForcedOffByMode && (
          <p className="text-xs text-amber-600 dark:text-amber-500">{t("aiAssistantRestrictedByModeNote")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="auto-code-review-enabled">{t("autoCodeReviewTitle")}</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            id="auto-code-review-enabled"
            checked={autoCodeReviewEnabled}
            onCheckedChange={(checked) => setAutoCodeReviewEnabled(checked === true)}
          />
          <span>{t("autoCodeReviewEnabled")}</span>
        </label>
        <p className="text-xs text-muted-foreground">{t("autoCodeReviewEnabledHint")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email-verification-required">{t("emailVerificationTitle")}</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            id="email-verification-required"
            checked={emailVerificationRequired}
            onCheckedChange={(checked) => setEmailVerificationRequired(checked === true)}
          />
          <span>{t("emailVerificationRequired")}</span>
        </label>
        <p className="text-xs text-muted-foreground">{t("emailVerificationRequiredHint")}</p>
      </div>

      <div className="space-y-2">
        <Label>{t("communityVotingTitle")}</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            id="community-upvote-enabled"
            checked={communityUpvoteEnabled}
            onCheckedChange={(checked) => setCommunityUpvoteEnabled(checked === true)}
          />
          <span>{t("communityUpvoteEnabled")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            id="community-downvote-enabled"
            checked={communityDownvoteEnabled}
            onCheckedChange={(checked) => setCommunityDownvoteEnabled(checked === true)}
          />
          <span>{t("communityDownvoteEnabled")}</span>
        </label>
        <p className="text-xs text-muted-foreground">{t("communityVotingHint")}</p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <Label className="text-base font-medium">{t("smtpTitle")}</Label>
        <p className="text-xs text-muted-foreground">{t("smtpHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="smtp-host" className="text-xs">{t("smtpHostLabel")}</Label>
            <Input id="smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="smtp-port" className="text-xs">{t("smtpPortLabel")}</Label>
            <Input id="smtp-port" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="smtp-user" className="text-xs">{t("smtpUserLabel")}</Label>
            <Input id="smtp-user" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="user@example.com" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="smtp-pass" className="text-xs">{t("smtpPassLabel")}</Label>
            <Input id="smtp-pass" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="smtp-from" className="text-xs">{t("smtpFromLabel")}</Label>
            <Input id="smtp-from" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="noreply@example.com" />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox id="smtp-secure" checked={smtpSecure} onCheckedChange={(c) => setSmtpSecure(c === true)} />
              {t("smtpSecureLabel")}
            </label>
          </div>
        </div>
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

      {signupHcaptchaEnabled && (
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
      )}

      <div className="space-y-2">
        <Label htmlFor="system-settings-current-password">
          {t("reconfirmLabel")}
        </Label>
        <Input
          id="system-settings-current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
        <p className="text-xs text-muted-foreground">{t("reconfirmHint")}</p>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
