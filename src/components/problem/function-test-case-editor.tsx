"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createEmptyProblemTestCaseDraft,
  type ProblemTestCaseDraft,
} from "@/lib/problems/test-case-drafts";
import { encodeArgs, encodeValue, decodeValue } from "@/lib/judge/function-judging/serialization";
import { isArrayType, type FunctionType } from "@/lib/judge/function-judging/types";
import { parseFieldValue, formatValue } from "@/lib/judge/function-judging/value-fields";

type Param = { name: string; type: FunctionType };

type FunctionTestCaseEditorProps = {
  params: Param[];
  returnType: FunctionType;
  testCases: ProblemTestCaseDraft[];
  onChange: (next: ProblemTestCaseDraft[]) => void;
  disabled?: boolean;
  /**
   * Bumped by the parent after "Compute expected outputs" writes canonical
   * `expectedOutput` strings into the drafts; signals the editor to re-hydrate
   * the visible return fields from those drafts.
   */
  expectedOutputsVersion?: number;
};

/** Typed text fields, keyed by draft `_key`: one string per param + return. */
type TypedFields = {
  args: string[];
  ret: string;
};

function placeholderForType(type: FunctionType, hint: string): string {
  return isArrayType(type) ? hint : "";
}

/** Decode a stored draft (canonical serialized text) into editable typed text. */
function hydrateFields(
  draft: ProblemTestCaseDraft,
  params: Param[],
  returnType: FunctionType,
): TypedFields {
  let args: string[] = params.map(() => "");
  try {
    if (draft.input) {
      const decoded = decodeValue(draft.input, "string[]") as unknown[];
      if (Array.isArray(decoded)) {
        args = params.map((p, i) => formatValue(decoded[i], p.type));
      }
    }
  } catch {
    // Leave args blank if the stored input is not canonical.
  }

  let ret = "";
  try {
    if (draft.expectedOutput) {
      ret = formatValue(decodeValue(draft.expectedOutput, returnType), returnType);
    }
  } catch {
    ret = "";
  }

  return { args, ret };
}

export function FunctionTestCaseEditor({
  params,
  returnType,
  testCases,
  onChange,
  disabled = false,
  expectedOutputsVersion = 0,
}: FunctionTestCaseEditorProps) {
  const t = useTranslations("problems");
  const arrayHint = t("fnArgArrayHint");

  // Typed text state keyed by draft _key. Hydrated lazily from incoming drafts.
  const [fields, setFields] = useState<Record<string, TypedFields>>(() => {
    const init: Record<string, TypedFields> = {};
    for (const draft of testCases) {
      if (draft._key) init[draft._key] = hydrateFields(draft, params, returnType);
    }
    return init;
  });

  // Track param count so a signature change re-pads the typed arg arrays.
  const paramCount = params.length;
  useEffect(() => {
    setFields((prev) => {
      const next: Record<string, TypedFields> = {};
      for (const [key, f] of Object.entries(prev)) {
        const args = Array.from({ length: paramCount }, (_, i) => f.args[i] ?? "");
        next[key] = { ...f, args };
      }
      return next;
    });
  }, [paramCount]);

  // Re-hydrate the return fields from drafts after an external compute filled
  // their canonical `expectedOutput`. Args are left as the author typed them.
  // Keyed only on `expectedOutputsVersion` so ordinary edits never clobber typing.
  useEffect(() => {
    if (expectedOutputsVersion === 0) return;
    setFields((prev) => {
      const next: Record<string, TypedFields> = { ...prev };
      for (const draft of testCases) {
        if (!draft._key) continue;
        const current = next[draft._key] ?? { args: params.map(() => ""), ret: "" };
        let ret = current.ret;
        try {
          ret = draft.expectedOutput
            ? formatValue(decodeValue(draft.expectedOutput, returnType), returnType)
            : "";
        } catch {
          ret = current.ret;
        }
        next[draft._key] = { ...current, ret };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedOutputsVersion]);

  const getFields = useCallback(
    (key: string): TypedFields => fields[key] ?? { args: params.map(() => ""), ret: "" },
    [fields, params],
  );

  /** Serialize one case's typed fields into its draft (best-effort on errors). */
  const serializeCase = useCallback(
    (draft: ProblemTestCaseDraft, f: TypedFields): ProblemTestCaseDraft => {
      let input = draft.input;
      let expectedOutput = draft.expectedOutput;

      const parsedArgs: unknown[] = [];
      let argsOk = true;
      for (let i = 0; i < params.length; i += 1) {
        const result = parseFieldValue(f.args[i] ?? "", params[i].type);
        if (result.ok) {
          parsedArgs.push(result.value);
        } else {
          argsOk = false;
          break;
        }
      }
      if (argsOk) {
        input = encodeArgs(parsedArgs, params);
      }

      const retResult = parseFieldValue(f.ret, returnType);
      if (retResult.ok) {
        expectedOutput = encodeValue(retResult.value, returnType);
      }

      return { ...draft, input, expectedOutput };
    },
    [params, returnType],
  );

  const updateCaseFields = useCallback(
    (index: number, next: TypedFields) => {
      const draft = testCases[index];
      if (!draft?._key) return;
      setFields((prev) => ({ ...prev, [draft._key as string]: next }));
      onChange(testCases.map((d, i) => (i === index ? serializeCase(d, next) : d)));
    },
    [testCases, onChange, serializeCase],
  );

  function setArg(index: number, argIndex: number, raw: string) {
    const current = getFields(testCases[index]._key as string);
    const args = current.args.slice();
    while (args.length < params.length) args.push("");
    args[argIndex] = raw;
    updateCaseFields(index, { ...current, args });
  }

  function setReturn(index: number, raw: string) {
    const current = getFields(testCases[index]._key as string);
    updateCaseFields(index, { ...current, ret: raw });
  }

  function setVisible(index: number, isVisible: boolean) {
    onChange(testCases.map((d, i) => (i === index ? { ...d, isVisible } : d)));
  }

  function addCase() {
    const draft = createEmptyProblemTestCaseDraft();
    setFields((prev) => ({
      ...prev,
      [draft._key as string]: { args: params.map(() => ""), ret: "" },
    }));
    // Seed the serialized empty draft so a no-edit empty array still encodes.
    onChange([...testCases, serializeCase(draft, { args: params.map(() => ""), ret: "" })]);
  }

  function removeCase(index: number) {
    const draft = testCases[index];
    if (draft?._key) {
      setFields((prev) => {
        const next = { ...prev };
        delete next[draft._key as string];
        return next;
      });
    }
    onChange(testCases.filter((_, i) => i !== index));
  }

  const errorsByCase = useMemo(() => {
    return testCases.map((draft) => {
      const f = getFields(draft._key as string);
      const argErrors = params.map((p, i) => {
        const result = parseFieldValue(f.args[i] ?? "", p.type);
        return result.ok ? null : result.errorKey;
      });
      const retResult = parseFieldValue(f.ret, returnType);
      return { argErrors, retError: retResult.ok ? null : retResult.errorKey };
    });
  }, [testCases, params, returnType, getFields]);

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{t("fnTestCasesTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("fnTestCasesDescription")}</p>
        </div>
        <Button type="button" variant="outline" onClick={addCase} disabled={disabled}>
          <Plus aria-hidden="true" />
          {t("addTestCase")}
        </Button>
      </div>

      {testCases.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noTestCases")}</p>
      ) : (
        <div className="space-y-4">
          {testCases.map((draft, index) => {
            const f = getFields(draft._key as string);
            const caseErrors = errorsByCase[index];
            return (
              <div key={draft._key} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="font-medium">{t("testCaseLabel", { number: index + 1 })}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCase(index)}
                    disabled={disabled}
                  >
                    <Trash2 aria-hidden="true" />
                    {t("removeTestCase")}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {params.map((param, argIndex) => {
                    const fieldId = `fn-arg-${draft._key}-${argIndex}`;
                    const error = caseErrors?.argErrors[argIndex];
                    return (
                      <div key={argIndex} className="space-y-1">
                        <Label htmlFor={fieldId}>
                          {param.name || `arg${argIndex + 1}`}{" "}
                          <span className="text-muted-foreground">({param.type})</span>
                        </Label>
                        <Input
                          id={fieldId}
                          value={f.args[argIndex] ?? ""}
                          onChange={(e) => setArg(index, argIndex, e.target.value)}
                          placeholder={placeholderForType(param.type, arrayHint)}
                          disabled={disabled}
                          aria-invalid={Boolean(error)}
                          className="font-mono text-sm"
                        />
                        {error && <p className="text-xs text-destructive">{t(error)}</p>}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`fn-ret-${draft._key}`}>
                    {t("fnExpectedReturnLabel")}{" "}
                    <span className="text-muted-foreground">({returnType})</span>
                  </Label>
                  <Input
                    id={`fn-ret-${draft._key}`}
                    value={f.ret}
                    onChange={(e) => setReturn(index, e.target.value)}
                    placeholder={placeholderForType(returnType, arrayHint)}
                    disabled={disabled}
                    aria-invalid={Boolean(caseErrors?.retError)}
                    className="font-mono text-sm"
                  />
                  {caseErrors?.retError && (
                    <p className="text-xs text-destructive">{t(caseErrors.retError)}</p>
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={draft.isVisible}
                    onCheckedChange={(checked) => setVisible(index, checked === true)}
                    disabled={disabled}
                  />
                  <span>{t("testCaseVisibleLabel")}</span>
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
