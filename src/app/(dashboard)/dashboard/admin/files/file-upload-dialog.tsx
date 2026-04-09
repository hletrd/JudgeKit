"use client";

import { useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Upload, X, FileIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  /** Max upload size in bytes. Defaults to 50MB. Keep in sync with server uploadMaxFileSizeBytes setting. */
  maxFileSizeBytes?: number;
};

type QueuedFile = {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

export function FileUploadDialog({ open, onOpenChange, onComplete, maxFileSizeBytes = 50 * 1024 * 1024 }: Props) {
  const t = useTranslations("admin.files");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const MAX_UPLOAD_SIZE = maxFileSizeBytes;
    const newFiles = Array.from(fileList)
      .filter((file) => {
        if (file.size > MAX_UPLOAD_SIZE) {
          toast.error(t("fileTooLarge", { fileName: file.name }));
          return false;
        }
        return true;
      })
      .map((file) => ({
        file,
        status: "pending" as const,
      }));
    setQueue((prev) => [...prev, ...newFiles]);
  }, [t, maxFileSizeBytes]);

  function removeFromQueue(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  async function handleUpload() {
    if (queue.length === 0) return;
    setIsUploading(true);
    let successCount = 0;

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== "pending") continue;

      setQueue((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: "uploading" } : item
        )
      );

      try {
        const formData = new FormData();
        formData.append("file", queue[i].file);

        const res = await apiFetch("/api/v1/files", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "uploadFailed");
        }

        setQueue((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "done" } : item
          )
        );
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "uploadFailed";
        setQueue((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "error", error: message } : item
          )
        );
      }
    }

    setIsUploading(false);

    if (successCount > 0) {
      toast.success(t("uploadSuccess", { count: successCount }));
      // Small delay so user can see status, then close
      setTimeout(() => {
        setQueue([]);
        onComplete();
      }, 500);
    }
  }

  function handleClose(open: boolean) {
    if (!isUploading) {
      if (!open) setQueue([]);
      onOpenChange(open);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("uploadDialogTitle")}</DialogTitle>
          <DialogDescription>{t("uploadDialogDescription")}</DialogDescription>
        </DialogHeader>

        <div
          className={`flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mb-2 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isDragging ? t("dropzoneActive") : t("dropzoneHint")}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {queue.length > 0 && (
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {queue.map((item, i) => (
              <div
                key={`${item.file.name}-${i}`}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{item.file.name}</span>
                {item.status === "uploading" && (
                  <Loader2 className="size-4 animate-spin text-primary" />
                )}
                {item.status === "done" && (
                  <span className="text-xs text-green-600">{t("done")}</span>
                )}
                {item.status === "error" && (
                  <span className="text-xs text-destructive">{item.error}</span>
                )}
                {item.status === "pending" && !isUploading && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromQueue(i);
                    }}
                    className="rounded p-0.5 hover:bg-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isUploading}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isUploading || queue.filter((q) => q.status === "pending").length === 0}
          >
            {isUploading ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                {t("uploading")}
              </>
            ) : (
              <>
                <Upload className="size-4 mr-1" />
                {t("upload")} ({queue.filter((q) => q.status === "pending").length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
