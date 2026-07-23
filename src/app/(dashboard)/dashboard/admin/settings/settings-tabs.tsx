"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SettingsTabsProps {
  tabs: { value: string; label: string; content: ReactNode }[];
}

export function SettingsTabs({ tabs }: SettingsTabsProps) {
  // Initial state must be deterministic for SSR — fall back to the first tab
  // value here. The effect below switches tabs based on `location.hash` only
  // when it changes (initial load uses a layout effect equivalent via the
  // hashchange handler with manual fire on mount, scheduled async to avoid
  // cascading renders flagged by `react-hooks/set-state-in-effect`).
  const [activeTab, setActiveTab] = useState(tabs[0]?.value ?? "general");

  useEffect(() => {
    function applyHash(hash: string) {
      if (hash && tabs.some((tab) => tab.value === hash)) {
        setActiveTab((current) => (current === hash ? current : hash));
      }
    }
    function onHashChange() {
      applyHash(window.location.hash.slice(1));
    }
    // Defer the initial sync to the next microtask so the setState happens
    // after the effect body returns, sidestepping cascading-render warnings
    // while still hydrating from the URL hash on mount.
    const initialHash = window.location.hash.slice(1);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) applyHash(initialHash);
    });
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [tabs]);

  function handleTabChange(value: string) {
    setActiveTab(value);
    window.history.replaceState(null, "", `#${value}`);
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      {/*
        The base TabsList is a fixed-height (h-8), horizontally-scrolling strip
        (overflow-x-auto). With many settings sections we want the triggers to
        WRAP onto multiple rows instead — so override the fixed height to auto
        and clear the overflow, otherwise the wrapped second row is clipped by
        h-8 and becomes an unnecessary scroll.
      */}
      <TabsList className="w-full flex-wrap h-auto group-data-horizontal/tabs:h-auto overflow-visible overflow-x-visible gap-1">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="space-y-6 mt-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
