"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { updateSystemSettings } from "@/lib/actions/system-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type AllowedHostsFormProps = {
  initialHosts: string[];
  authUrlHost: string | null;
};

export function AllowedHostsForm({ initialHosts, authUrlHost }: AllowedHostsFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");
  const [hosts, setHosts] = useState<string[]>(initialHosts);
  const [newHost, setNewHost] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function handleAdd() {
    const trimmed = newHost.trim().toLowerCase();
    if (!trimmed) return;
    if (hosts.includes(trimmed)) {
      toast.error(t("allowedHostDuplicate"));
      return;
    }
    setHosts((prev) => [...prev, trimmed]);
    setNewHost("");
  }

  function handleRemove(host: string) {
    setHosts((prev) => prev.filter((h) => h !== host));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const result = await updateSystemSettings({ allowedHosts: hosts });

      if (!result.success) {
        toast.error(t(result.error ?? "updateError"));
        return;
      }

      toast.success(t("updateSuccess"));
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {authUrlHost && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("allowedHostAuthUrl")}</p>
          <Badge variant="secondary" className="font-mono text-xs">
            {authUrlHost}
          </Badge>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={newHost}
            onChange={(e) => setNewHost(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("allowedHostPlaceholder")}
            className="font-mono"
          />
          <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="shrink-0">
            {tCommon("add")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("allowedHostHint")}</p>
      </div>

      {hosts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hosts.map((host) => (
            <Badge key={host} variant="outline" className="gap-1 font-mono text-xs">
              {host}
              <button
                type="button"
                onClick={() => handleRemove(host)}
                className="ml-1 rounded-full hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
