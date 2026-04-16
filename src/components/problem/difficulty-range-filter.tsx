"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRACTICE_DIFFICULTY_MAX,
  PRACTICE_DIFFICULTY_MIN,
  normalizeDifficultyRange,
  serializeDifficultyRange,
} from "@/lib/practice/difficulty-range";

type DifficultyRangeFilterProps = {
  name: string;
  defaultValue?: string;
  minLabel: string;
  maxLabel: string;
};

export function DifficultyRangeFilter({
  name,
  defaultValue = "",
  minLabel,
  maxLabel,
}: DifficultyRangeFilterProps) {
  const initialRange = useMemo(() => normalizeDifficultyRange(defaultValue), [defaultValue]);
  const [minValue, setMinValue] = useState(String(initialRange.min));
  const [maxValue, setMaxValue] = useState(String(initialRange.max));

  const options = useMemo(
    () => Array.from(
      { length: PRACTICE_DIFFICULTY_MAX - PRACTICE_DIFFICULTY_MIN + 1 },
      (_, index) => {
        const value = String(PRACTICE_DIFFICULTY_MIN + index);
        return { value, label: value };
      },
    ),
    [],
  );
  const labelMap = useMemo(
    () => Object.fromEntries(options.map((option) => [option.value, option.label])),
    [options],
  );

  const serializedValue = serializeDifficultyRange({
    min: Number(minValue),
    max: Number(maxValue),
  });

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={serializedValue} />
      <Select
        value={minValue}
        onValueChange={(value) => {
          const nextValue = value ?? minValue;
          setMinValue(nextValue);
          if (Number(nextValue) > Number(maxValue)) {
            setMaxValue(nextValue);
          }
        }}
      >
        <SelectTrigger className="h-10 w-24">
          <SelectValue placeholder={minLabel}>{labelMap[minValue] || minValue}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={`min-${option.value}`} value={option.value} label={option.label}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground">–</span>
      <Select
        value={maxValue}
        onValueChange={(value) => {
          const nextValue = value ?? maxValue;
          setMaxValue(nextValue);
          if (Number(nextValue) < Number(minValue)) {
            setMinValue(nextValue);
          }
        }}
      >
        <SelectTrigger className="h-10 w-24">
          <SelectValue placeholder={maxLabel}>{labelMap[maxValue] || maxValue}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={`max-${option.value}`} value={option.value} label={option.label}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
