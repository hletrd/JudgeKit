"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VALID_TABS = ["general", "security", "submissions", "judge", "session", "advanced", "database"];

interface SettingsTabsProps {
  tabs: { value: string; label: string; content: ReactNode }[];
}

export function SettingsTabs({ tabs }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && VALID_TABS.includes(hash)) {
      setActiveTab(hash);
    }
  }, []);

  function handleTabChange(value: string) {
    setActiveTab(value);
    window.history.replaceState(null, "", `#${value}`);
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList className="w-full flex-wrap">
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
