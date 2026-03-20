"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateSystemSettings } from "@/lib/actions/system-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConfiguredSettings } from "@/lib/system-settings-config";

type FieldDef = {
  key: keyof ConfiguredSettings;
};

type ConfigSettingsFormProps = {
  fields: FieldDef[];
  initialValues: Partial<Record<keyof ConfiguredSettings, number | null>>;
  defaults: ConfiguredSettings;
};

export function ConfigSettingsForm({
  fields,
  initialValues,
  defaults,
}: ConfigSettingsFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) {
      const stored = initialValues[f.key];
      v[f.key] = stored != null ? String(stored) : "";
    }
    return v;
  });
  const [isLoading, setIsLoading] = useState(false);

  function handleChange(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function handleClear(key: string) {
    setValues((prev) => ({ ...prev, [key]: "" }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const payload: Record<string, number | null> = {};
      for (const f of fields) {
        const raw = values[f.key];
        if (raw === "" || raw === undefined) {
          payload[f.key] = null;
        } else {
          const parsed = parseInt(raw, 10);
          if (!Number.isFinite(parsed)) {
            toast.error(t("mustBeInteger"));
            setIsLoading(false);
            return;
          }
          payload[f.key] = parsed;
        }
      }

      const result = await updateSystemSettings(payload);

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
      {fields.map((f) => (
        <div key={f.key} className="space-y-2">
          <Label htmlFor={`cfg-${f.key}`}>{t(f.key)}</Label>
          <div className="flex gap-2">
            <Input
              id={`cfg-${f.key}`}
              type="number"
              value={values[f.key] ?? ""}
              onChange={(e) => handleChange(f.key, e.target.value)}
              placeholder={String(defaults[f.key])}
              className="font-mono"
            />
            {values[f.key] !== "" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleClear(f.key)}
                className="shrink-0 text-xs"
              >
                {t("clearToDefault")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(`${f.key}Hint`, { default: String(defaults[f.key]) })}
          </p>
        </div>
      ))}
      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
