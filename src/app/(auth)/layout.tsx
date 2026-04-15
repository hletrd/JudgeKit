import type { Metadata } from "next";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NO_INDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NO_INDEX_METADATA;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-muted/50 px-4 py-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle className="bg-background/80 shadow-sm ring-1 ring-border/70 backdrop-blur" />
      </div>
      {children}
    </div>
  );
}
