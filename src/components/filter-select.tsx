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
  defaultValue?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function FilterSelect({
  name,
  defaultValue = "",
  options,
  placeholder,
}: FilterSelectProps) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} hidden />
      <Select value={value} onValueChange={(v) => setValue(v ?? "")}>
        <SelectTrigger className="w-48 h-8">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} label={opt.label}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
