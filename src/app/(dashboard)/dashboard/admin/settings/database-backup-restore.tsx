"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

export function DatabaseBackupRestore({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleBackup() {
    setIsDownloading(true);
    try {
      const response = await apiFetch("/api/v1/admin/backup");
      if (!response.ok) {
        toast.error(t("backupFailed"));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `judgekit-backup-${timestamp}.sqlite`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("backupSuccess"));
    } catch {
      toast.error(t("backupFailed"));
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleRestore() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error(t("noFileSelected"));
      return;
    }

    setIsRestoring(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiFetch("/api/v1/admin/restore", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(t(data.error ?? "restoreFailed"));
        return;
      }

      toast.success(t("restoreSuccess"));
      setConfirmRestore(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      toast.error(t("restoreFailed"));
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleBackup} disabled={isDownloading}>
          <Download className="mr-2 h-4 w-4" />
          {isDownloading ? tCommon("loading") : t("downloadBackup")}
        </Button>
      </div>

      {isSuperAdmin && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">{t("restoreTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("restoreWarning")}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sqlite,.db"
            onChange={() => setConfirmRestore(false)}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded file:border file:border-input file:text-sm file:font-medium file:bg-background file:text-foreground hover:file:bg-accent cursor-pointer"
          />
          {!confirmRestore ? (
            <Button
              variant="destructive"
              onClick={() => setConfirmRestore(true)}
              disabled={isRestoring || !fileInputRef.current?.files?.length}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t("restoreDatabase")}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="destructive" onClick={handleRestore} disabled={isRestoring}>
                {isRestoring ? tCommon("loading") : t("confirmRestore")}
              </Button>
              <Button variant="outline" onClick={() => setConfirmRestore(false)} disabled={isRestoring}>
                {tCommon("cancel")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
