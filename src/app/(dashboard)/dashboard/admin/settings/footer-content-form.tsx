"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateSystemSettings } from "@/lib/actions/system-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusIcon, TrashIcon } from "lucide-react";

type FooterLink = { label: string; url: string };
type FooterLocaleContent = {
  copyrightText?: string;
  links?: FooterLink[];
};
type FooterContent = Record<string, FooterLocaleContent>;

interface FooterContentFormProps {
  initialContent: FooterContent | null;
}

const LOCALES = ["en", "ko"] as const;

function getCopyrightText(content: FooterLocaleContent | undefined): string {
  return content?.copyrightText ?? "";
}

function getLinks(content: FooterLocaleContent | undefined): FooterLink[] {
  return content?.links ?? [];
}

export function FooterContentForm({ initialContent }: FooterContentFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");

  const [content, setContent] = useState<FooterContent>(initialContent ?? {});
  const [activeLocale, setActiveLocale] = useState<string>("en");
  const [isLoading, setIsLoading] = useState(false);

  function updateCopyrightText(locale: string, value: string) {
    setContent((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], copyrightText: value || undefined },
    }));
  }

  function updateLink(locale: string, index: number, field: keyof FooterLink, value: string) {
    setContent((prev) => {
      const localeData = prev[locale] ?? {};
      const links = [...(localeData.links ?? [])];
      links[index] = { ...links[index], [field]: value };
      return { ...prev, [locale]: { ...localeData, links } };
    });
  }

  function addLink(locale: string) {
    setContent((prev) => {
      const localeData = prev[locale] ?? {};
      return { ...prev, [locale]: { ...localeData, links: [...(localeData.links ?? []), { label: "", url: "" }] } };
    });
  }

  function removeLink(locale: string, index: number) {
    setContent((prev) => {
      const localeData = prev[locale] ?? {};
      const links = (localeData.links ?? []).filter((_, i) => i !== index);
      return { ...prev, [locale]: { ...localeData, links } };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const cleaned: FooterContent = {};
      for (const loc of Object.keys(content)) {
        const entry = content[loc];
        if (entry && (entry.copyrightText || (entry.links && entry.links.length > 0))) {
          cleaned[loc] = {
            ...entry,
            links: entry.links?.filter((l) => l.label && l.url),
          };
        }
      }

      const result = await updateSystemSettings({
        footerContent: Object.keys(cleaned).length > 0 ? cleaned : null,
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
      <Tabs value={activeLocale} onValueChange={setActiveLocale}>
        <TabsList>
          {LOCALES.map((loc) => (
            <TabsTrigger key={loc} value={loc}>
              {t(`footerLocaleTab${loc.charAt(0).toUpperCase()}${loc.slice(1)}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {LOCALES.map((loc) => {
          const current = content[loc];
          const links = getLinks(current);
          return (
            <TabsContent key={loc} value={loc} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>{t("footerCopyrightText")}</Label>
                <Input
                  value={getCopyrightText(current)}
                  onChange={(e) => updateCopyrightText(loc, e.target.value)}
                  placeholder={`© ${new Date().getFullYear()} JudgeKit. All rights reserved.`}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("footerLinks")}</Label>
                {links.map((link, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={link.label}
                      onChange={(e) => updateLink(loc, i, "label", e.target.value)}
                      placeholder={t("footerLinkLabel")}
                      className="flex-1"
                    />
                    <Input
                      value={link.url}
                      onChange={(e) => updateLink(loc, i, "url", e.target.value)}
                      placeholder={t("footerLinkUrl")}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLink(loc, i)}
                      aria-label={t("footerRemoveLink")}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addLink(loc)}
                >
                  <PlusIcon className="mr-1 size-4" />
                  {t("footerAddLink")}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
