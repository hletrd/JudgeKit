"use client";

import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui/tabs";

interface HashTabsProps extends React.ComponentProps<typeof Tabs> {
  defaultValue: string;
}

export function HashTabs({ defaultValue, children, ...props }: HashTabsProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) setValue(hash);
  }, []);

  const handleChange = (newValue: string | number | null) => {
    const v = String(newValue ?? defaultValue);
    setValue(v);
    window.history.replaceState(null, "", `#${v}`);
  };

  return (
    <Tabs value={value} onValueChange={handleChange} {...props}>
      {children}
    </Tabs>
  );
}
