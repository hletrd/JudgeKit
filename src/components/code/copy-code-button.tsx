"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";

export function CopyCodeButton({ value }: { value: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(value);
    if (!ok) {
      toast.error(t("copyFailed"));
      return;
    }
    setCopied(true);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [value, t]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute right-1.5 top-1.5 z-10 h-7 w-7 rounded-md opacity-50 transition-opacity hover:opacity-80"
      onClick={handleCopy}
      aria-label={copied ? t("copied") : t("copyCode")}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500 dark:text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-[var(--problem-code-foreground,currentColor)]" />
      )}
    </Button>
  );
}
