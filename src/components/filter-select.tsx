"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FilterSelectProps {
  name: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function FilterSelect({
  name,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  defaultValue = "",
  options,
  placeholder,
}: FilterSelectProps) {
  const [value, setValue] = useState(defaultValue);
  const selectedLabel = options.find((opt) => opt.value === value)?.label || value;
  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={(v) => setValue(v ?? "")}>
        <SelectTrigger id={id} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} className="min-w-[12rem] max-w-[12rem] h-10">
          <SelectValue placeholder={placeholder}>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} label={opt.label}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
