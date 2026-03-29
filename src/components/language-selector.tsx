"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, CheckIcon, SearchIcon } from "lucide-react";

// Category definitions — language IDs that belong to each named group.
// Any language not in any category will fall into "Other".
const LANGUAGE_CATEGORIES: Record<string, string[]> = {
  "C / C++": ["c", "c89", "c99", "c11", "c17", "c23", "cpp", "cpp11", "cpp14", "cpp17", "cpp20", "cpp23", "clang_c23", "clang_cpp23"],
  "Java / JVM": ["java", "java8", "java11", "java17", "java21", "java25", "kotlin", "scala", "groovy", "clojure"],
  "Python": ["python", "python2", "python3", "pypy2", "pypy3", "micropython"],
  "JavaScript / TypeScript": ["javascript", "typescript", "nodejs", "deno_js", "deno_ts", "bun_js", "bun_ts", "coffeescript"],
  "Rust": ["rust"],
  "Go": ["go"],
  "Swift": ["swift"],
  ".NET": ["csharp", "fsharp", "vbnet"],
  "Haskell / ML": ["haskell", "ocaml", "sml", "flix", "purescript"],
  "Functional": ["elixir", "erlang", "gleam", "racket", "scheme", "commonlisp", "hy", "fennel", "clean", "mercury", "curry", "koka", "lean", "grain", "pony", "factor"],
  "Scripting": ["perl", "ruby", "php", "lua", "bash", "awk", "tcl", "powershell", "r"],
  "Compiled": ["fortran", "pascal", "d", "ada", "nim", "zig", "dart", "crystal", "vala", "hare", "c3", "nelua", "odin", "vlang"],
  "Esoteric / Other": ["brainfuck", "befunge", "aheui", "hyeong", "whitespace", "umjunsik", "lolcode", "shakespeare", "b", "sed", "dc", "forth", "algol68", "snobol4", "icon", "uiua", "rexx", "arturo", "janet", "picat", "wat", "modula2", "minizinc", "spark", "carp", "raku", "bqn", "squirrel", "julia", "octave", "prolog", "smalltalk", "freebasic", "apl", "nasm", "llvm_ir", "postscript", "haxe", "objective_c", "cobol", "delphi"],
};

type SubmissionLanguage = {
  id: string;
  language: string;
  displayName: string;
  standard: string | null;
};

type LanguageSelectorProps = {
  id?: string;
  languages: SubmissionLanguage[];
  value: string;
  onValueChange: (value: string) => void;
  preferredLanguage?: string | null;
  placeholder?: string;
  searchPlaceholder?: string;
  recentlyUsedLabel?: string;
  otherLabel?: string;
};

type LanguageEntry = {
  language: string;
  label: string;
};

export function LanguageSelector({
  id,
  languages,
  value,
  onValueChange,
  preferredLanguage,
  placeholder = "Select Language",
  searchPlaceholder = "Search languages...",
  recentlyUsedLabel = "Recently Used",
  otherLabel = "Other",
}: LanguageSelectorProps) {
  const [inputValue, setInputValue] = useState("");

  const labelMap = useMemo(
    () =>
      Object.fromEntries(
        languages.map((entry) => [
          entry.language,
          `${entry.displayName}${entry.standard ? ` (${entry.standard})` : ""}`,
        ])
      ),
    [languages]
  );

  // Build grouped structure
  const grouped = useMemo(() => {
    const langSet = new Set(languages.map((l) => l.language));
    const assignedLanguages = new Set<string>();
    const categoryEntries: Array<{ category: string; entries: LanguageEntry[] }> = [];

    for (const [category, ids] of Object.entries(LANGUAGE_CATEGORIES)) {
      const entries: LanguageEntry[] = ids
        .filter((langId) => langSet.has(langId))
        .map((langId) => ({ language: langId, label: labelMap[langId] ?? langId }));
      if (entries.length > 0) {
        categoryEntries.push({ category, entries });
        entries.forEach((e) => assignedLanguages.add(e.language));
      }
    }

    // Languages not in any category go into "Other"
    const otherEntries: LanguageEntry[] = languages
      .filter((l) => !assignedLanguages.has(l.language))
      .map((l) => ({ language: l.language, label: labelMap[l.language] ?? l.language }));

    if (otherEntries.length > 0) {
      categoryEntries.push({ category: otherLabel, entries: otherEntries });
    }

    return categoryEntries;
  }, [languages, labelMap, otherLabel]);

  // Recently used: just the preferredLanguage if it's in the available languages
  const recentlyUsed = useMemo<LanguageEntry[]>(() => {
    if (!preferredLanguage) return [];
    if (!labelMap[preferredLanguage]) return [];
    return [{ language: preferredLanguage, label: labelMap[preferredLanguage] }];
  }, [preferredLanguage, labelMap]);

  // Filter groups by search query
  const groupsToRender = useMemo(() => {
    const query = inputValue.toLowerCase().trim();

    const allGroups: Array<{ category: string; entries: LanguageEntry[] }> = [
      ...(recentlyUsed.length > 0
        ? [{ category: recentlyUsedLabel, entries: recentlyUsed }]
        : []),
      ...grouped,
    ];

    if (!query) return allGroups;

    return allGroups
      .map(({ category, entries }) => ({
        category,
        entries: entries.filter(
          (e) =>
            e.label.toLowerCase().includes(query) ||
            e.language.toLowerCase().includes(query)
        ),
      }))
      .filter(({ entries }) => entries.length > 0);
  }, [inputValue, grouped, recentlyUsed, recentlyUsedLabel]);

  const hasResults = groupsToRender.length > 0;
  const displayLabel = labelMap[value] || value || placeholder;

  return (
    <ComboboxPrimitive.Root
      value={value}
      onValueChange={(val) => {
        if (val) onValueChange(val);
      }}
      inputValue={inputValue}
      onInputValueChange={(val) => setInputValue(val)}
      filter={null}
    >
      <ComboboxPrimitive.Trigger
        id={id}
        data-slot="select-trigger"
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-1 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-input/30 dark:hover:bg-input/50"
        )}
      >
        <span className="flex flex-1 items-center truncate text-left">
          {displayLabel}
        </span>
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </ComboboxPrimitive.Trigger>

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner
          side="bottom"
          sideOffset={4}
          align="center"
          className="isolate z-50"
        >
          <ComboboxPrimitive.Popup
            data-slot="select-content"
            className={cn(
              "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
            )}
          >
            {/* Search input */}
            <div className="flex items-center border-b border-border px-2 py-1.5">
              <SearchIcon className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
              <ComboboxPrimitive.Input
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={searchPlaceholder}
              />
            </div>

            <ComboboxPrimitive.List className="overflow-y-auto max-h-[min(calc(var(--available-height,400px)-48px),360px)]">
              {hasResults ? (
                groupsToRender.map(({ category, entries }) => (
                  <ComboboxPrimitive.Group key={category} className="scroll-my-1 p-1.5">
                    <ComboboxPrimitive.GroupLabel className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                      {category}
                    </ComboboxPrimitive.GroupLabel>
                    {entries.map((entry) => (
                      <ComboboxPrimitive.Item
                        key={entry.language}
                        value={entry.language}
                        className={cn(
                          "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none",
                          "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                          "data-disabled:pointer-events-none data-disabled:opacity-50"
                        )}
                      >
                        <span className="flex flex-1 shrink-0 whitespace-nowrap">
                          {entry.label}
                        </span>
                        <ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                          <CheckIcon className="size-3.5" />
                        </ComboboxPrimitive.ItemIndicator>
                      </ComboboxPrimitive.Item>
                    ))}
                  </ComboboxPrimitive.Group>
                ))
              ) : (
                <ComboboxPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No languages found.
                </ComboboxPrimitive.Empty>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
