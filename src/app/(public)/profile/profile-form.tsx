"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { updateProfile } from "@/lib/actions/update-profile";
import { useRouter } from "next/navigation";
import { EDITOR_FONT_SIZES, EDITOR_FONT_FAMILIES, DEFAULT_EDITOR_FONT_SIZE, DEFAULT_EDITOR_FONT_FAMILY } from "@/lib/code/editor-fonts";

type LanguageOption = {
  value: string;
  label: string;
};

export default function ProfileForm({
  initialName,
  initialClassName,
  initialPreferredLanguage,
  initialPreferredTheme,
  initialShareAcceptedSolutions,
  initialAcceptedSolutionsAnonymous,
  initialEditorFontSize,
  initialEditorFontFamily,
  languages,
  canEditClassName,
}: {
  initialName: string;
  initialClassName: string;
  initialPreferredLanguage: string;
  initialPreferredTheme: string;
  initialShareAcceptedSolutions: boolean;
  initialAcceptedSolutionsAnonymous: boolean;
  initialEditorFontSize: string;
  initialEditorFontFamily: string;
  languages: LanguageOption[];
  canEditClassName: boolean;
}) {
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { setTheme } = useTheme();

  const [name, setName] = useState(initialName);
  const [className, setClassName] = useState(initialClassName);
  const [preferredLanguage, setPreferredLanguage] = useState(initialPreferredLanguage);
  const languageLabelMap = Object.fromEntries(languages.map((l) => [l.value, l.label]));
  const [preferredTheme, setPreferredTheme] = useState(initialPreferredTheme || "system");
  const [shareAcceptedSolutions, setShareAcceptedSolutions] = useState(initialShareAcceptedSolutions);
  const [acceptedSolutionsAnonymous, setAcceptedSolutionsAnonymous] = useState(initialAcceptedSolutionsAnonymous);
  const [editorFontSize, setEditorFontSize] = useState(initialEditorFontSize || String(DEFAULT_EDITOR_FONT_SIZE));
  const [editorFontFamily, setEditorFontFamily] = useState(initialEditorFontFamily || DEFAULT_EDITOR_FONT_FAMILY);
  const [isLoading, setIsLoading] = useState(false);

  const themeLabels: Record<string, string> = { light: t("themeLight"), dark: t("themeDark"), system: t("themeSystem") };
  const fontFamilyLabel = EDITOR_FONT_FAMILIES.find((f) => f.id === editorFontFamily)?.name || t("editorFontDefault");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await updateProfile({
        name,
        className: canEditClassName ? className : undefined,
        preferredLanguage: preferredLanguage || undefined,
        preferredTheme: (preferredTheme as "light" | "dark" | "system") || undefined,
        shareAcceptedSolutions,
        acceptedSolutionsAnonymous,
        editorFontSize: editorFontSize || undefined,
        editorFontFamily: editorFontFamily || undefined,
      });
      if (result.success) {
        if (preferredTheme) {
          setTheme(preferredTheme);
        }
        toast.success(t("updateSuccess"));
        router.refresh();
      } else {
        toast.error(t(result.error ?? "updateError"));
      }
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          required
        />
      </div>
      {canEditClassName && (
        <div className="space-y-2">
          <Label htmlFor="className">{t("className")}</Label>
          <Input
            id="className"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder={t("classNamePlaceholder")}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="preferredLanguage">{t("preferredLanguage")}</Label>
        <Select value={preferredLanguage} onValueChange={(v) => setPreferredLanguage(v ?? "")}>
          <SelectTrigger id="preferredLanguage">
            <SelectValue placeholder={t("preferredLanguagePlaceholder")}>{languageLabelMap[preferredLanguage] || preferredLanguage || t("preferredLanguagePlaceholder")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.value} value={lang.value} label={lang.label}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="preferredTheme">{t("preferredTheme")}</Label>
        <Select value={preferredTheme} onValueChange={(v) => setPreferredTheme(v ?? "")}>
          <SelectTrigger id="preferredTheme">
            <SelectValue placeholder={t("preferredThemePlaceholder")}>{themeLabels[preferredTheme] || preferredTheme}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light" label={t("themeLight")}>{t("themeLight")}</SelectItem>
            <SelectItem value="dark" label={t("themeDark")}>{t("themeDark")}</SelectItem>
            <SelectItem value="system" label={t("themeSystem")}>{t("themeSystem")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="shareAcceptedSolutions"
            checked={shareAcceptedSolutions}
            onCheckedChange={setShareAcceptedSolutions}
          />
          <div className="space-y-1">
            <Label htmlFor="shareAcceptedSolutions">{t("shareAcceptedSolutions")}</Label>
            <p className="text-sm text-muted-foreground">{t("shareAcceptedSolutionsDesc")}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="acceptedSolutionsAnonymous"
            checked={acceptedSolutionsAnonymous}
            onCheckedChange={setAcceptedSolutionsAnonymous}
            disabled={!shareAcceptedSolutions}
          />
          <div className="space-y-1">
            <Label htmlFor="acceptedSolutionsAnonymous">{t("acceptedSolutionsAnonymous")}</Label>
            <p className="text-sm text-muted-foreground">{t("acceptedSolutionsAnonymousDesc")}</p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="editorFontSize">{t("editorFontSize")}</Label>
        <Select value={editorFontSize} onValueChange={(v) => setEditorFontSize(v ?? String(DEFAULT_EDITOR_FONT_SIZE))}>
          <SelectTrigger id="editorFontSize">
            <SelectValue placeholder={t("editorFontSizePlaceholder")}>{editorFontSize}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EDITOR_FONT_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)} label={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="editorFontFamily">{t("editorFontFamily")}</Label>
        <Select value={editorFontFamily} onValueChange={(v) => setEditorFontFamily(v ?? DEFAULT_EDITOR_FONT_FAMILY)}>
          <SelectTrigger id="editorFontFamily">
            <SelectValue placeholder={t("editorFontFamilyPlaceholder")}>{fontFamilyLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EDITOR_FONT_FAMILIES.map((font) => (
              <SelectItem key={font.id} value={font.id} label={font.id === "system" ? t("editorFontDefault") : font.name}>
                {font.id === "system" ? t("editorFontDefault") : font.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
