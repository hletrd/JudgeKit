"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

type DownloadMode = "portable" | "backup";

export function DatabaseBackupRestore({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const t = useTranslations("admin.settings");
  const tCommon = useTranslations("common");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restorePassword, setRestorePassword] = useState("");
  const [downloadMode, setDownloadMode] = useState<DownloadMode | null>(null);
  const [backupPassword, setBackupPassword] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDownload() {
    if (!backupPassword) {
      toast.error(t("passwordRequired"));
      return;
    }
    if (!downloadMode) {
      return;
    }

    setIsDownloading(true);
    try {
      const isPortableExport = downloadMode === "portable";
      const response = await apiFetch(
        isPortableExport ? "/api/v1/admin/migrate/export" : "/api/v1/admin/backup?includeFiles=true",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: backupPassword }),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(t(data.error ?? (isPortableExport ? "portableExportFailed" : "backupFailed")));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Use the server-provided filename from Content-Disposition header so the
      // download name matches the DB-time-based snapshot inside the file.
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename\*?=UTF-8''([^\s;]+)|filename="([^"]+)"/);
      const serverFilename = filenameMatch
        ? decodeURIComponent(filenameMatch[1] ?? filenameMatch[2])
        : null;
      // Fallback to a client-side timestamp only if the header is missing
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = serverFilename
        ?? (isPortableExport
          ? `judgekit-export-${timestamp}.json`
          : `judgekit-backup-${timestamp}.zip`);
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t(isPortableExport ? "portableExportSuccess" : "backupSuccess"));
      setDownloadMode(null);
      setBackupPassword("");
    } catch {
      toast.error(t(downloadMode === "portable" ? "portableExportFailed" : "backupFailed"));
    } finally {
      setIsDownloading(false);
    }
  }

  function renderDownloadSection(mode: DownloadMode, title: string, description: string, buttonLabel: string) {
    const isActive = downloadMode === mode;

    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {!isActive ? (
          <Button variant="outline" onClick={() => setDownloadMode(mode)}>
            <Download className="mr-2 h-4 w-4" />
            {buttonLabel}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={backupPassword}
              onChange={(e) => setBackupPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDownload()}
              placeholder={t("enterPassword")}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              autoFocus
            />
            <Button variant="outline" onClick={handleDownload} disabled={isDownloading || !backupPassword}>
              <Download className="mr-2 h-4 w-4" />
              {isDownloading ? tCommon("loading") : tCommon("confirm")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDownloadMode(null);
                setBackupPassword("");
              }}
            >
              {tCommon("cancel")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  async function handleRestore() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error(t("noFileSelected"));
      return;
    }

    if (!restorePassword) {
      toast.error(t("passwordRequired"));
      return;
    }

    setIsRestoring(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("password", restorePassword);

      const response = await apiFetch("/api/v1/admin/restore", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(t((data as { error?: string }).error ?? "restoreFailed"));
        return;
      }

      toast.success(t("restoreSuccess"));
      setConfirmRestore(false);
      setRestorePassword("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      toast.error(t("restoreFailed"));
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div className="space-y-4">
      {isSuperAdmin && (
        <div className="space-y-4">
          {renderDownloadSection(
            "portable",
            t("portableExportTitle"),
            t("portableExportDescription"),
            t("downloadPortableExport")
          )}
          <div className="border-t pt-4">
            {renderDownloadSection(
              "backup",
              t("fullBackupTitle"),
              t("fullBackupDescription"),
              t("downloadBackup")
            )}
          </div>
        </div>
      )}

      {isSuperAdmin && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">{t("restoreTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("restoreWarning")}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
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
            <div className="space-y-2">
              <input
                type="password"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && restorePassword && handleRestore()}
                placeholder={t("enterPassword")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button variant="destructive" onClick={handleRestore} disabled={isRestoring || !restorePassword}>
                  {isRestoring ? tCommon("loading") : t("confirmRestore")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirmRestore(false);
                    setRestorePassword("");
                  }}
                  disabled={isRestoring}
                >
                  {tCommon("cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
