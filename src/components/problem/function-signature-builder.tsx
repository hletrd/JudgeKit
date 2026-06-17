"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  AUTHORABLE_FUNCTION_TYPES,
  isArrayType,
  elementType,
  type FunctionSpec,
  type FunctionType,
} from "@/lib/judge/function-judging/types";
import { FUNCTION_JUDGING_LANGUAGES } from "@/lib/judge/function-judging/registry";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Sorted, stable list of the languages that support function judging. */
export const FUNCTION_LANGUAGE_OPTIONS: { id: string; label: string }[] = [...FUNCTION_JUDGING_LANGUAGES]
  .sort()
  .map((id) => ({ id, label: getLanguageDisplayLabel(id) }));

type FunctionSignatureBuilderProps = {
  value: FunctionSpec;
  onChange: (spec: FunctionSpec) => void;
  disabled?: boolean;
  /**
   * Optional float-comparison tolerance binding. When the return type is
   * `double`/`double[]`, judging is forced to float comparison server-side; these
   * let the author override the worker's default (`1e-9`) absolute/relative
   * tolerance. The values are the raw input strings (kept as the form's source of
   * truth); leaving them blank means "use the default". When omitted entirely,
   * only the explanatory note is shown (no tolerance inputs).
   */
  floatAbsoluteError?: string;
  floatRelativeError?: string;
  onFloatAbsoluteErrorChange?: (value: string) => void;
  onFloatRelativeErrorChange?: (value: string) => void;
};

/** A return type is float-compared when it is `double` or `double[]`. */
export function isFloatComparedReturn(type: FunctionType): boolean {
  return (isArrayType(type) ? elementType(type) : type) === "double";
}

/**
 * Shared shadcn-styled native <select> so the parameter/return type pickers
 * stay trivially testable in jsdom (the base-ui Select needs a portal/mock).
 */
function TypeSelect({
  id,
  ariaLabel,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  ariaLabel?: string;
  value: FunctionType;
  onChange: (value: FunctionType) => void;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as FunctionType)}
      className={cn(
        "flex h-10 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm",
        "outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
      )}
    >
      {AUTHORABLE_FUNCTION_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

export function FunctionSignatureBuilder({
  value,
  onChange,
  disabled = false,
  floatAbsoluteError,
  floatRelativeError,
  onFloatAbsoluteErrorChange,
  onFloatRelativeErrorChange,
}: FunctionSignatureBuilderProps) {
  const t = useTranslations("problems");
  const returnIsFloat = isFloatComparedReturn(value.returnType);
  const showToleranceInputs =
    Boolean(onFloatAbsoluteErrorChange) && Boolean(onFloatRelativeErrorChange);

  const functionNameInvalid = value.functionName.length > 0 && !IDENTIFIER.test(value.functionName);
  const hasParams = value.params.length > 0;
  const noLanguages = value.enabledLanguages.length === 0;

  function updateName(functionName: string) {
    onChange({ ...value, functionName });
  }

  function updateParam(index: number, updates: Partial<{ name: string; type: FunctionType }>) {
    onChange({
      ...value,
      params: value.params.map((p, i) => (i === index ? { ...p, ...updates } : p)),
    });
  }

  function addParam() {
    onChange({ ...value, params: [...value.params, { name: "", type: "int" }] });
  }

  function removeParam(index: number) {
    onChange({ ...value, params: value.params.filter((_, i) => i !== index) });
  }

  function updateReturnType(returnType: FunctionType) {
    onChange({ ...value, returnType });
  }

  function toggleLanguage(id: string, enabled: boolean) {
    const set = new Set(value.enabledLanguages);
    if (enabled) {
      set.add(id);
    } else {
      set.delete(id);
    }
    // Preserve a stable order matching the option list.
    onChange({
      ...value,
      enabledLanguages: FUNCTION_LANGUAGE_OPTIONS.filter((o) => set.has(o.id)).map((o) => o.id),
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{t("fnSignatureTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("fnSignatureDescription")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fn-name">{t("fnNameLabel")}</Label>
        <Input
          id="fn-name"
          value={value.functionName}
          onChange={(e) => updateName(e.target.value)}
          placeholder={t("fnNamePlaceholder")}
          disabled={disabled}
          aria-invalid={functionNameInvalid}
        />
        {functionNameInvalid && (
          <p className="text-xs text-destructive">{t("fnNameInvalid")}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>{t("fnParamsLabel")}</Label>
          <Button type="button" variant="outline" size="sm" onClick={addParam} disabled={disabled}>
            <Plus aria-hidden="true" />
            {t("fnAddParam")}
          </Button>
        </div>
        {!hasParams ? (
          <p className="text-xs text-destructive">{t("fnNoParams")}</p>
        ) : (
          <div className="space-y-2">
            {value.params.map((param, index) => {
              const paramNameInvalid = param.name.length > 0 && !IDENTIFIER.test(param.name);
              return (
                <div key={index} className="flex flex-wrap items-start gap-2">
                  <div className="min-w-[160px] flex-1 space-y-1">
                    <Input
                      aria-label={t("fnParamNameLabel", { number: index + 1 })}
                      value={param.name}
                      onChange={(e) => updateParam(index, { name: e.target.value })}
                      placeholder={t("fnParamNamePlaceholder")}
                      disabled={disabled}
                      aria-invalid={paramNameInvalid}
                    />
                    {paramNameInvalid && (
                      <p className="text-xs text-destructive">{t("fnParamNameInvalid")}</p>
                    )}
                  </div>
                  <div className="min-w-[120px]">
                    <TypeSelect
                      ariaLabel={t("fnParamTypeLabel", { number: index + 1 })}
                      value={param.type}
                      onChange={(type) => updateParam(index, { type })}
                      disabled={disabled}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeParam(index)}
                    disabled={disabled}
                    aria-label={t("fnRemoveParam")}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="fn-return-type">{t("fnReturnTypeLabel")}</Label>
        <div className="max-w-[200px]">
          <TypeSelect
            id="fn-return-type"
            ariaLabel={t("fnReturnTypeLabel")}
            value={value.returnType}
            onChange={updateReturnType}
            disabled={disabled}
          />
        </div>
        {returnIsFloat && (
          <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">{t("fnReturnFloatNote")}</p>
            {showToleranceInputs && (
              <div className="space-y-3">
                <p className="text-sm font-medium">{t("fnFloatToleranceTitle")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="fn-float-abs-error">{t("fnFloatAbsoluteErrorLabel")}</Label>
                    <Input
                      id="fn-float-abs-error"
                      value={floatAbsoluteError ?? ""}
                      onChange={(e) => onFloatAbsoluteErrorChange?.(e.target.value)}
                      placeholder="1e-9"
                      disabled={disabled}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">{t("fnFloatAbsoluteErrorHint")}</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="fn-float-rel-error">{t("fnFloatRelativeErrorLabel")}</Label>
                    <Input
                      id="fn-float-rel-error"
                      value={floatRelativeError ?? ""}
                      onChange={(e) => onFloatRelativeErrorChange?.(e.target.value)}
                      placeholder="1e-9"
                      disabled={disabled}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">{t("fnFloatRelativeErrorHint")}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t("fnLanguagesLabel")}</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FUNCTION_LANGUAGE_OPTIONS.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.enabledLanguages.includes(option.id)}
                onCheckedChange={(checked) => toggleLanguage(option.id, checked === true)}
                disabled={disabled}
                aria-label={option.label}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {noLanguages ? (
          <p className="text-xs text-destructive">{t("fnLanguagesNoneSelected")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("fnLanguagesHint")}</p>
        )}
      </div>
    </div>
  );
}
