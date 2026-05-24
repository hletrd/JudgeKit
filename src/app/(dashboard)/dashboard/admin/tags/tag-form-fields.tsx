"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COLOR_PALETTE = [
  "#EF4444", "#F97316", "#F59E0B", "#10B981",
  "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#6B7280",
];

export type TagFormValue = {
  name: string;
  color: string | null;
  hexInput: string;
};

type TagFormFieldsProps = {
  value: TagFormValue;
  onChange: (next: TagFormValue) => void;
  nameInputId: string;
};

export function TagFormFields({ value, onChange, nameInputId }: TagFormFieldsProps) {
  const t = useTranslations("admin.tags");
  const tCommon = useTranslations("common");

  function selectColor(c: string) {
    onChange({ ...value, color: c, hexInput: c });
  }

  function clearColor() {
    onChange({ ...value, color: null, hexInput: "" });
  }

  function setHex(hex: string) {
    const isValid = /^#[0-9A-Fa-f]{6}$/.test(hex);
    onChange({ ...value, hexInput: hex, color: isValid ? hex : value.color });
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={nameInputId}>{t("table.name")}</Label>
        <Input
          id={nameInputId}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>{t("color")} ({tCommon("optional")})</Label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className="size-7 rounded-full border-2 transition-all"
              style={{
                backgroundColor: c,
                borderColor: value.color === c ? "hsl(var(--foreground))" : "transparent",
              }}
              onClick={() => selectColor(c)}
              aria-label={c}
            />
          ))}
          <button
            type="button"
            className="size-7 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center text-xs text-muted-foreground"
            onClick={clearColor}
            aria-label={t("noColor")}
          >
            ×
          </button>
        </div>
        <Input
          placeholder="#3B82F6"
          value={value.hexInput}
          onChange={(e) => setHex(e.target.value)}
          maxLength={7}
        />
      </div>
    </>
  );
}
