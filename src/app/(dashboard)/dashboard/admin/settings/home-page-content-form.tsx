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

type CardContent = { title?: string; description?: string };
type LocaleContent = {
  eyebrow?: string;
  title?: string;
  description?: string;
  cards?: {
    practice?: CardContent;
    playground?: CardContent;
    contests?: CardContent;
    community?: CardContent;
  };
};

type HomePageContent = Record<string, LocaleContent>;

interface HomePageContentFormProps {
  initialContent: HomePageContent | null;
  defaultContent: { en: LocaleContent; ko: LocaleContent };
}

const CARD_KEYS = ["practice", "playground", "contests", "community"] as const;
const LOCALES = ["en", "ko"] as const;

function getVal(content: LocaleContent | undefined, field: keyof LocaleContent): string {
  return (content?.[field] as string) ?? "";
}

function getCardVal(content: LocaleContent | undefined, card: string, field: keyof CardContent): string {
  return (content?.cards?.[card as keyof typeof content.cards]?.[field]) ?? "";
}

export function HomePageContentForm({ initialContent, defaultContent }: HomePageContentFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");

  const [content, setContent] = useState<HomePageContent>(initialContent ?? {});
  const [activeLocale, setActiveLocale] = useState<string>("en");
  const [isLoading, setIsLoading] = useState(false);

  function updateField(locale: string, field: keyof LocaleContent, value: string) {
    setContent(prev => ({
      ...prev,
      [locale]: { ...prev[locale], [field]: value || undefined },
    }));
  }

  function updateCardField(locale: string, card: string, field: keyof CardContent, value: string) {
    setContent(prev => {
      const localeData = prev[locale] ?? {};
      const cards = localeData.cards ?? {};
      return {
        ...prev,
        [locale]: {
          ...localeData,
          cards: {
            ...cards,
            [card]: { ...cards[card as keyof typeof cards], [field]: value || undefined },
          },
        },
      };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    try {
      // Clean up: remove empty locale entries
      const cleaned: HomePageContent = {};
      for (const loc of Object.keys(content)) {
        const entry = content[loc];
        if (entry && Object.values(entry).some(v => v !== undefined)) {
          cleaned[loc] = entry;
        }
      }

      const result = await updateSystemSettings({
        homePageContent: Object.keys(cleaned).length > 0 ? cleaned : null,
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
          {LOCALES.map(loc => (
            <TabsTrigger key={loc} value={loc}>
              {t(`homepageLocaleTab${loc.charAt(0).toUpperCase()}${loc.slice(1)}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {LOCALES.map(loc => {
          const defaults = defaultContent[loc];
          const current = content[loc];
          return (
            <TabsContent key={loc} value={loc} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>{t("homepageEyebrow")}</Label>
                <Input
                  value={getVal(current, "eyebrow")}
                  onChange={e => updateField(loc, "eyebrow", e.target.value)}
                  placeholder={defaults.eyebrow}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("homepageTitle")}</Label>
                <Input
                  value={getVal(current, "title")}
                  onChange={e => updateField(loc, "title", e.target.value)}
                  placeholder={defaults.title}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("homepageDescription")}</Label>
                <Input
                  value={getVal(current, "description")}
                  onChange={e => updateField(loc, "description", e.target.value)}
                  placeholder={defaults.description}
                />
              </div>

              <h3 className="pt-4 text-sm font-semibold">{t("homepageCards")}</h3>
              {CARD_KEYS.map(card => (
                <div key={card} className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t(`homepageCard${card.charAt(0).toUpperCase()}${card.slice(1)}`)}
                  </p>
                  <div className="space-y-2">
                    <Input
                      value={getCardVal(current, card, "title")}
                      onChange={e => updateCardField(loc, card, "title", e.target.value)}
                      placeholder={getCardVal(defaults, card, "title")}
                    />
                    <Input
                      value={getCardVal(current, card, "description")}
                      onChange={e => updateCardField(loc, card, "description", e.target.value)}
                      placeholder={getCardVal(defaults, card, "description")}
                    />
                  </div>
                </div>
              ))}
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
