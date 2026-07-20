"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateSystemSettings } from "@/lib/actions/system-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  WARM_POOL_MAX_PER_IMAGE,
  languageToImage,
  type WarmPoolConfig,
} from "@/lib/judge/warm-pool";

export interface WarmPoolLanguageOption {
  language: string;
  displayName: string;
}

interface WarmPoolFormProps {
  initialConfig: WarmPoolConfig;
  languages: WarmPoolLanguageOption[];
}

// Pre-fill a sensible starting point when a language is first checked on;
// the admin can still type any value from 0 to WARM_POOL_MAX_PER_IMAGE.
const DEFAULT_WARM_COUNT = 2;

function parseCount(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(WARM_POOL_MAX_PER_IMAGE, Math.max(0, Math.floor(value)));
}

export function WarmPoolForm({ initialConfig, languages }: WarmPoolFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [counts, setCounts] = useState<Record<string, number>>(initialConfig.languages ?? {});
  // Holds the literal text of a count input while it's mid-edit (e.g. "" right
  // after backspacing, or a not-yet-finished number). `counts` above stays the
  // last *valid* value so the checkbox/disabled state never flaps just because
  // the field is transiently empty; the draft is reconciled into `counts` once
  // it parses, and discarded (reverting the display) on blur if it never does.
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  function setCount(language: string, value: number) {
    setCounts((prev) => ({ ...prev, [language]: value }));
  }

  function clearDraft(language: string) {
    setDraftCounts((prev) => {
      if (!(language in prev)) return prev;
      const next = { ...prev };
      delete next[language];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    try {
      // Only persist languages the admin actually configured a positive
      // count for, so the stored blob only lists languages kept warm.
      const cleaned: Record<string, number> = {};
      for (const [language, count] of Object.entries(counts)) {
        if (count > 0) cleaned[language] = count;
      }

      const result = await updateSystemSettings({
        warmPool: { enabled, languages: cleaned },
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
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked === true)}
          />
          <span>{t("warmPoolEnabled")}</span>
        </label>
        <p className="text-xs text-muted-foreground">{t("warmPoolEnabledHint")}</p>
      </div>

      {languages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("warmPoolNoLanguages")}</p>
      ) : (
        <div className="space-y-2">
          {languages.map((option) => {
            const image = languageToImage(option.language);
            const count = counts[option.language] ?? 0;
            return (
              <div
                key={option.language}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={count > 0}
                    disabled={!enabled}
                    onCheckedChange={(checked) => {
                      clearDraft(option.language);
                      setCount(option.language, checked === true ? DEFAULT_WARM_COUNT : 0);
                    }}
                  />
                  <span className="min-w-32 text-sm font-medium">{option.displayName}</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  max={WARM_POOL_MAX_PER_IMAGE}
                  className="w-20"
                  aria-label={t("warmPoolCountLabelFor", { language: option.displayName })}
                  disabled={!enabled || count === 0}
                  value={draftCounts[option.language] ?? count}
                  onChange={(event) => {
                    const raw = event.target.value;
                    // Empty or not-yet-a-number input is a valid transient
                    // state: keep it on screen instead of collapsing it to 0
                    // (which would uncheck and disable the field mid-edit).
                    if (raw.trim() === "" || !Number.isFinite(Number(raw))) {
                      setDraftCounts((prev) => ({ ...prev, [option.language]: raw }));
                      return;
                    }
                    clearDraft(option.language);
                    setCount(option.language, parseCount(raw));
                  }}
                  onBlur={() => clearDraft(option.language)}
                />
                {image ? <Badge variant="outline">{image}</Badge> : null}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("warmPoolSharedImageHint")}</p>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
