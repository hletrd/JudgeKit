"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toggleLanguage, updateLanguageConfig, resetLanguageToDefaults, resetAllLanguagesToDefaults, addLanguageConfig } from "@/lib/actions/language-configs";
import { apiFetch } from "@/lib/api/client";
import { RotateCcw, Pencil, Hammer, Trash2, Loader2, Plus, MoreHorizontal, Eraser } from "lucide-react";

// Recommended Docker images for the combobox dropdown
const RECOMMENDED_IMAGES = [
  "alpine:3.21", "alpine:3.20",
  "ubuntu:24.04", "ubuntu:22.04",
  "debian:bookworm-slim", "debian:bullseye-slim",
  "python:3.14-slim", "python:3.13-slim",
  "node:24-slim", "node:22-slim",
  "rust:1.94-slim",
  "golang:1.26-alpine",
  "openjdk:21-slim",
];

type ConfirmAction =
  | { type: "removeImage"; payload: LanguageConfig }
  | { type: "prune" }
  | { type: "reset"; payload: string }
  | { type: "resetAll" };

interface LanguageConfig {
  id: string;
  language: string;
  displayName: string;
  standard: string | null;
  extension: string;
  dockerImage: string;
  compiler: string | null;
  compileCommand: string | null;
  runCommand: string;
  dockerfile: string | null;
  isEnabled: boolean | null;
  updatedAt: Date;
  runtimeInfo: string;
  dockerSize: string | null;
}

export function LanguageConfigTable({ languages }: { languages: LanguageConfig[] }) {
  const t = useTranslations("admin.languages");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingLang, setEditingLang] = useState<LanguageConfig | null>(null);
  const [editForm, setEditForm] = useState({ dockerImage: "", compileCommand: "", runCommand: "", dockerfile: "" });
  const [search, setSearch] = useState("");
  const [imageInfo, setImageInfo] = useState<Map<string, { size: string; created: string; stale: boolean }>>(new Map());
  const [diskUsage, setDiskUsage] = useState<{ total: string; used: string; available: string; usePercent: string } | null>(null);
  const [buildingLangs, setBuildingLangs] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    language: "", displayName: "", standard: "", extension: "",
    dockerImage: "", compiler: "", compileCommand: "", runCommand: "",
    dockerfile: "",
  });
  const [isPruning, setIsPruning] = useState(false);
  const [staleCount, setStaleCount] = useState(0);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [imageStatusLoading, setImageStatusLoading] = useState(true);
  const [imageStatusError, setImageStatusError] = useState(false);

  const fetchImageStatus = useCallback(async () => {
    setImageStatusLoading(true);
    setImageStatusError(false);
    try {
      const res = await apiFetch("/api/v1/admin/docker/images");
      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? {};
        const images = data.images ?? data ?? [];
        const staleSet = new Set<string>(data.staleImages ?? []);
        const info = new Map<string, { size: string; created: string; stale: boolean }>();
        for (const img of Array.isArray(images) ? images : []) {
          const tag = `${img.repository}:${img.tag}`;
          info.set(tag, {
            size: img.size ?? "",
            created: img.created ?? "",
            stale: staleSet.has(tag),
          });
        }
        setImageInfo(info);
        setStaleCount(staleSet.size);
        if (data.disk) setDiskUsage(data.disk);
      } else {
        setImageStatusError(true);
        toast.error(t("toast.fetchImageStatusError"));
      }
    } catch {
      setImageStatusError(true);
      toast.error(t("toast.fetchImageStatusError"));
    } finally {
      setImageStatusLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchImageStatus(); }, [fetchImageStatus]);

  function handleBuild(lang: LanguageConfig) {
    setBuildingLangs(prev => new Set(prev).add(lang.language));
    apiFetch("/api/v1/admin/docker/images/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: lang.language }),
    })
      .then(async (res) => {
        if (res.ok) {
          toast.success(t("toast.buildSuccess"));
          fetchImageStatus();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? t("toast.buildError"));
        }
      })
      .catch(() => toast.error(t("toast.buildError")))
      .finally(() => setBuildingLangs(prev => { const next = new Set(prev); next.delete(lang.language); return next; }));
  }

  function handleRemoveImage(lang: LanguageConfig) {
    setConfirmAction({ type: "removeImage", payload: lang });
  }

  function confirmRemoveImage(lang: LanguageConfig) {
    apiFetch("/api/v1/admin/docker/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageTag: lang.dockerImage }),
    })
      .then(async (res) => {
        if (res.ok) {
          toast.success(t("toast.removeSuccess"));
          fetchImageStatus();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? t("toast.removeError"));
        }
      })
      .catch(() => toast.error(t("toast.removeError")));
  }

  function handlePrune() {
    setConfirmAction({ type: "prune" });
  }

  function confirmPrune() {
    setIsPruning(true);
    apiFetch("/api/v1/admin/docker/images/prune", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const count = data.data?.removedCount ?? 0;
          if (count > 0) {
            toast.success(t("toast.pruneSuccess", { count }));
          } else {
            toast.info(t("toast.pruneNone"));
          }
          fetchImageStatus();
        } else {
          toast.error(data.error ?? t("toast.pruneError"));
        }
      })
      .catch(() => toast.error(t("toast.pruneError")))
      .finally(() => setIsPruning(false));
  }

  function openEdit(lang: LanguageConfig) {
    setEditingLang(lang);
    setEditForm({
      dockerImage: lang.dockerImage,
      compileCommand: lang.compileCommand ?? "",
      runCommand: lang.runCommand,
      dockerfile: lang.dockerfile ?? "",
    });
  }

  function handleToggle(language: string, enabled: boolean) {
    startTransition(async () => {
      const result = await toggleLanguage(language, enabled);
      if (result.success) {
        toast.success(t("toast.toggleSuccess", { language, state: enabled ? t("enabled") : t("disabled") }));
        router.refresh();
      } else {
        toast.error(t("toast.toggleError"));
      }
    });
  }

  function handleSave() {
    if (!editingLang) return;
    startTransition(async () => {
      const result = await updateLanguageConfig(editingLang.language, editForm);
      if (result.success) {
        toast.success(t("toast.updateSuccess"));
        setEditingLang(null);
        router.refresh();
      } else {
        toast.error(t("toast.updateError"));
      }
    });
  }

  function handleReset(language: string) {
    setConfirmAction({ type: "reset", payload: language });
  }

  function confirmReset(language: string) {
    startTransition(async () => {
      const result = await resetLanguageToDefaults(language);
      if (result.success) {
        toast.success(t("toast.resetSuccess"));
        setEditingLang(null);
        router.refresh();
      } else {
        toast.error(t("toast.resetError"));
      }
    });
  }

  function handleResetAll() {
    setConfirmAction({ type: "resetAll" });
  }

  function confirmResetAll() {
    startTransition(async () => {
      const result = await resetAllLanguagesToDefaults();
      if (result.success) {
        toast.success(t("toast.resetAllSuccess"));
        router.refresh();
      } else {
        toast.error(t("toast.resetAllError"));
      }
    });
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await addLanguageConfig({
        language: addForm.language,
        displayName: addForm.displayName,
        standard: addForm.standard || undefined,
        extension: addForm.extension,
        dockerImage: addForm.dockerImage,
        compiler: addForm.compiler || undefined,
        compileCommand: addForm.compileCommand || undefined,
        runCommand: addForm.runCommand,
        dockerfile: addForm.dockerfile || undefined,
      });
      if (result.success) {
        toast.success(t("add.createSuccess"));
        setAddOpen(false);
        setAddForm({
          language: "", displayName: "", standard: "", extension: "",
          dockerImage: "", compiler: "", compileCommand: "", runCommand: "",
          dockerfile: "",
        });
        router.refresh();
      } else {
        toast.error(t("add.createError"));
      }
    });
  }

  // Collect unique docker images currently in use for the datalist
  const existingImages = [...new Set(languages.map(l => l.dockerImage))];
  const allImageOptions = [...new Set([...existingImages, ...RECOMMENDED_IMAGES])].sort();

  const filteredLanguages = search.trim()
    ? languages.filter(lang => {
        const q = search.toLowerCase();
        return (
          lang.displayName.toLowerCase().includes(q) ||
          lang.language.toLowerCase().includes(q) ||
          (lang.standard ?? "").toLowerCase().includes(q) ||
          lang.dockerImage.toLowerCase().includes(q) ||
          lang.extension.toLowerCase().includes(q)
        );
      })
    : languages;

  return (
    <>
      {diskUsage && (() => {
        const usagePercent = parseInt(diskUsage.usePercent) || 0;
        const widthValue = diskUsage.usePercent.includes('%') ? diskUsage.usePercent : `${diskUsage.usePercent}%`;
        return (
        <div className="flex items-center gap-3 rounded-lg border p-3 text-sm mb-4">
          <span className="font-medium">{t("diskUsage")}</span>
          <span>{diskUsage.used} / {diskUsage.total} ({diskUsage.usePercent})</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-green-600">{diskUsage.available} {t("diskAvailable")}</span>
          <div
            className="ml-auto h-2 w-32 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={usagePercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("diskUsage")}
          >
            <div
              className={`h-full rounded-full ${usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-yellow-500" : "bg-green-500"}`}
              style={{ width: widthValue }}
            />
          </div>
        </div>
        );
      })()}
      <div className="flex items-center gap-2 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
          className="max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => setAddOpen(true)} disabled={isPending}>
            <Plus className="size-4 mr-1.5" />
            {t("add.button")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground h-8 cursor-pointer">
              <MoreHorizontal className="size-4" />
              {t("actions.more")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handlePrune} disabled={isPruning || staleCount === 0}>
                {isPruning ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Eraser className="size-4 mr-2" />}
                {t("actions.pruneStale")}{staleCount > 0 ? ` (${staleCount})` : ""}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleResetAll} disabled={isPending}>
                <RotateCcw className="size-4 mr-2" />
                {t("actions.resetAll")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px] pl-4">{t("table.enabled")}</TableHead>
              <TableHead>{t("table.language")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.standard")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("table.extension")}</TableHead>
              <TableHead>{t("table.dockerImage")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("table.compileCommand")}</TableHead>
              <TableHead className="w-[120px]">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLanguages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t("noResults")}
                </TableCell>
              </TableRow>
            ) : filteredLanguages.map((lang) => (
              <TableRow key={lang.language} className={lang.isEnabled ? "" : "opacity-50"}>
                <TableCell className="pl-4">
                  <Checkbox
                    checked={lang.isEnabled ?? true}
                    onCheckedChange={(checked) => handleToggle(lang.language, checked === true)}
                    disabled={isPending}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{lang.displayName}</span>
                    <span className="text-xs text-muted-foreground font-mono">{lang.language}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {lang.standard && <Badge variant="secondary">{lang.standard}</Badge>}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-xs font-mono text-muted-foreground">{lang.extension.startsWith(".") ? lang.extension : `.${lang.extension}`}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-mono">{lang.dockerImage}</span>
                    <span className="text-xs text-muted-foreground">{lang.runtimeInfo}</span>
                    {imageStatusLoading && imageInfo.size === 0
                      ? <Badge variant="outline" className="w-fit text-xs text-muted-foreground">{tCommon("loading")}</Badge>
                      : imageStatusError && imageInfo.size === 0
                        ? <Badge variant="outline" className="w-fit text-xs text-yellow-600 border-yellow-300">{t("imageStatus.loadError")}</Badge>
                      : imageInfo.size > 0 && (
                        imageInfo.has(lang.dockerImage)
                          ? <div className="flex flex-col gap-0.5">
                              {imageInfo.get(lang.dockerImage)?.stale
                                ? <Badge variant="outline" className="w-fit text-xs text-yellow-600 border-yellow-300">{t("imageStatus.stale")}{imageInfo.get(lang.dockerImage)?.size ? ` (${imageInfo.get(lang.dockerImage)?.size})` : ""}</Badge>
                                : <Badge variant="outline" className="w-fit text-xs text-green-600 border-green-300">{t("imageStatus.available")}{imageInfo.get(lang.dockerImage)?.size ? ` (${imageInfo.get(lang.dockerImage)?.size})` : ""}</Badge>
                              }
                              {imageInfo.get(lang.dockerImage)?.created && (
                                <span className="text-xs text-muted-foreground">{imageInfo.get(lang.dockerImage)?.created}</span>
                              )}
                            </div>
                          : <Badge variant="outline" className="w-fit text-xs text-muted-foreground">{t("imageStatus.notBuilt")}</Badge>
                      )}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-xs font-mono text-muted-foreground truncate max-w-[300px] block">
                    {lang.compileCommand ?? t("noCompileCommand")}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(lang)} aria-label={t("edit.title")}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleBuild(lang)}
                      disabled={buildingLangs.has(lang.language)}
                      title={t("actions.build")}
                      aria-label={t("actions.build")}
                    >
                      {buildingLangs.has(lang.language)
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <Hammer className="size-3.5" />}
                    </Button>
                    {imageInfo.has(lang.dockerImage) && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveImage(lang)}
                        title={t("actions.remove")}
                        aria-label={t("actions.remove")}
                        className="text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Sheet */}
      <Sheet open={editingLang !== null} onOpenChange={(open) => { if (!open) setEditingLang(null); }}>
        <SheetContent className="sm:max-w-lg flex flex-col">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>{t("edit.title")}</SheetTitle>
            <SheetDescription>
              {editingLang?.displayName} {editingLang?.standard ? `(${editingLang.standard})` : ""} — <code>{editingLang?.language}</code>
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div className="space-y-2">
              <Label>{t("edit.dockerImage")}</Label>
              <Input
                value={editForm.dockerImage}
                onChange={(e) => setEditForm(prev => ({ ...prev, dockerImage: e.target.value }))}
                placeholder={t("edit.dockerImagePlaceholder")}
                list="docker-images"
              />
              <datalist id="docker-images">
                {allImageOptions.map(img => (
                  <option key={img} value={img} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>{t("edit.compileCommand")}</Label>
              <Textarea
                value={editForm.compileCommand}
                onChange={(e) => setEditForm(prev => ({ ...prev, compileCommand: e.target.value }))}
                rows={3}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{t("edit.compileCommandHelp")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("edit.runCommand")}</Label>
              <Textarea
                value={editForm.runCommand}
                onChange={(e) => setEditForm(prev => ({ ...prev, runCommand: e.target.value }))}
                rows={2}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{t("edit.runCommandHelp")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("edit.dockerfile")}</Label>
              <Textarea
                value={editForm.dockerfile}
                onChange={(e) => setEditForm(prev => ({ ...prev, dockerfile: e.target.value }))}
                rows={10}
                className="font-mono text-sm"
                placeholder={t("edit.dockerfilePlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("edit.dockerfileHelp")}</p>
            </div>
          </div>

          <div className="border-t px-6 py-4 flex gap-2">
            <Button onClick={handleSave} disabled={isPending}>
              {t("edit.save")}
            </Button>
            <Button variant="outline" onClick={() => setEditingLang(null)} disabled={isPending}>
              {t("edit.cancel")}
            </Button>
            <Button
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={() => editingLang && handleReset(editingLang.language)}
              disabled={isPending}
            >
              <RotateCcw className="size-4 mr-1.5" />
              {t("edit.resetToDefaults")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Language Sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-lg flex flex-col">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>{t("add.title")}</SheetTitle>
            <SheetDescription>
              {t("add.languageKeyHelp")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div className="space-y-2">
              <Label>{t("add.languageKey")}</Label>
              <Input
                value={addForm.language}
                onChange={(e) => setAddForm(prev => ({ ...prev, language: e.target.value }))}
                placeholder={t("add.languageKeyPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("add.languageKeyHelp")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("table.language")}</Label>
              <Input
                value={addForm.displayName}
                onChange={(e) => setAddForm(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder={t("add.displayNamePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("table.standard")} <span className="text-muted-foreground text-xs">({tCommon("optional")})</span></Label>
              <Input
                value={addForm.standard}
                onChange={(e) => setAddForm(prev => ({ ...prev, standard: e.target.value }))}
                placeholder={t("add.standardPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("table.extension")}</Label>
              <Input
                value={addForm.extension}
                onChange={(e) => setAddForm(prev => ({ ...prev, extension: e.target.value }))}
                placeholder={t("add.extensionPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("edit.dockerImage")}</Label>
              <Input
                value={addForm.dockerImage}
                onChange={(e) => setAddForm(prev => ({ ...prev, dockerImage: e.target.value }))}
                placeholder={t("edit.dockerImagePlaceholder")}
                list="docker-images-add"
              />
              <datalist id="docker-images-add">
                {allImageOptions.map(img => (
                  <option key={img} value={img} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>{t("edit.compileCommand")} <span className="text-muted-foreground text-xs">({tCommon("optional")})</span></Label>
              <Textarea
                value={addForm.compileCommand}
                onChange={(e) => setAddForm(prev => ({ ...prev, compileCommand: e.target.value }))}
                rows={3}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{t("edit.compileCommandHelp")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("edit.runCommand")}</Label>
              <Textarea
                value={addForm.runCommand}
                onChange={(e) => setAddForm(prev => ({ ...prev, runCommand: e.target.value }))}
                rows={2}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{t("edit.runCommandHelp")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("edit.dockerfile")} <span className="text-muted-foreground text-xs">({tCommon("optional")})</span></Label>
              <Textarea
                value={addForm.dockerfile}
                onChange={(e) => setAddForm(prev => ({ ...prev, dockerfile: e.target.value }))}
                rows={10}
                className="font-mono text-sm"
                placeholder={t("edit.dockerfilePlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("edit.dockerfileHelp")}</p>
            </div>
          </div>

          <div className="border-t px-6 py-4 flex gap-2">
            <Button onClick={handleCreate} disabled={isPending || !addForm.language || !addForm.displayName || !addForm.extension || !addForm.dockerImage || !addForm.runCommand}>
              {t("add.create")}
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={isPending}>
              {t("edit.cancel")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmation dialog for destructive actions */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon("confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "removeImage" ? t("actions.removeConfirm")
                : confirmAction?.type === "prune" ? t("actions.pruneConfirm")
                : confirmAction?.type === "reset" ? t("edit.resetConfirm")
                : t("actions.resetAllConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmAction?.type === "removeImage") confirmRemoveImage(confirmAction.payload);
              else if (confirmAction?.type === "prune") confirmPrune();
              else if (confirmAction?.type === "reset") confirmReset(confirmAction.payload);
              else if (confirmAction?.type === "resetAll") confirmResetAll();
              setConfirmAction(null);
            }}>
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
