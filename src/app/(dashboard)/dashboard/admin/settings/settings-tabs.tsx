"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SettingsTabsProps {
  tabs: { value: string; label: string; content: ReactNode }[];
}

export function SettingsTabs({ tabs }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState("general");

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
