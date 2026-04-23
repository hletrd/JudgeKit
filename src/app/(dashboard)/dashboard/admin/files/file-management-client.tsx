"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, Upload, Copy, Check, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileUploadDialog } from "./file-upload-dialog";
import { FileDeleteDialog } from "./file-delete-dialog";

type FileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  width: number | null;
  height: number | null;
  createdAt: string | null;
  uploaderName: string | null;
  formattedSize: string;
  formattedDate: string;
};

type Props = {
  files: FileRow[];
  rangeStart: number;
  rangeEnd: number;
  totalCount: number;
  maxFileSizeBytes?: number;
};

export function FileManagementClient({ files, rangeStart, rangeEnd, totalCount, maxFileSizeBytes }: Props) {
  const t = useTranslations("admin.files");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<{ id: string; name: string }[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedIdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedIdTimer.current) clearTimeout(copiedIdTimer.current);
  }, []);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((f) => f.id)));
    }
  }

  function handleDeleteSingle(file: FileRow) {
    setDeleteTargets([{ id: file.id, name: file.originalName }]);
    setDeleteOpen(true);
  }

  function handleDeleteSelected() {
    const targets = files
      .filter((f) => selected.has(f.id))
      .map((f) => ({ id: f.id, name: f.originalName }));
    if (targets.length === 0) return;
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }

  function handleDeleteComplete() {
    setDeleteOpen(false);
    setDeleteTargets([]);
    setSelected(new Set());
    router.refresh();
  }

  function handleUploadComplete() {
    setUploadOpen(false);
    router.refresh();
  }

  async function copyUrl(id: string) {
    const url = `${window.location.origin}/api/v1/files/${id}`;
    const { copyToClipboard } = await import("@/lib/clipboard");
    if (!(await copyToClipboard(url))) {
      toast.error(t("copyFailed"));
      return;
    }
    if (copiedIdTimer.current) {
      clearTimeout(copiedIdTimer.current);
    }
    setCopiedId(id);
    toast.success(t("urlCopied"));
    copiedIdTimer.current = setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="size-4 mr-1" />
              {t("deleteSelected")} ({selected.size})
            </Button>
          )}
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="size-4 mr-1" />
          {t("uploadButton")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("resultsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {files.length > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              {t("pagination.results", { start: rangeStart, end: rangeEnd, total: totalCount })}
            </p>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={files.length > 0 && selected.size === files.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-12">{t("table.preview")}</TableHead>
                  <TableHead>{t("table.filename")}</TableHead>
                  <TableHead>{t("table.type")}</TableHead>
                  <TableHead>{t("table.size")}</TableHead>
                  <TableHead>{t("table.uploader")}</TableHead>
                  <TableHead>{t("table.uploadDate")}</TableHead>
                  <TableHead>{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(file.id)}
                        onCheckedChange={() => toggleSelect(file.id)}
                      />
                    </TableCell>
                    <TableCell>
                      {file.category === "image" ? (
                        <Image
                          src={`/api/v1/files/${file.id}`}
                          alt={file.originalName}
                          className="size-10 rounded object-cover"
                          width={40}
                          height={40}
                          loading="lazy"
                          unoptimized
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded bg-muted">
                          <FileIcon className="size-5 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px] truncate font-medium" title={file.originalName}>
                        {file.originalName}
                      </div>
                      {file.width && file.height && (
                        <div className="text-xs text-muted-foreground">
                          {file.width} x {file.height}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{file.mimeType}</TableCell>
                    <TableCell>{file.formattedSize}</TableCell>
                    <TableCell>{file.uploaderName ?? "-"}</TableCell>
                    <TableCell>{file.formattedDate}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyUrl(file.id)}
                          title={t("copyUrl")}
                          aria-label={t("copyUrl")}
                        >
                          {copiedId === file.id ? (
                            <Check className="size-4" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSingle(file)}
                          title={t("delete")}
                          aria-label={t("delete")}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {files.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {t("noFiles")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <FileUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onComplete={handleUploadComplete}
        maxFileSizeBytes={maxFileSizeBytes}
      />

      <FileDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        targets={deleteTargets}
        onComplete={handleDeleteComplete}
      />
    </>
  );
}
