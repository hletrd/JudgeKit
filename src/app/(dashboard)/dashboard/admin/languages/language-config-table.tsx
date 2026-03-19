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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toggleLanguage, updateLanguageConfig, resetLanguageToDefaults, resetAllLanguagesToDefaults } from "@/lib/actions/language-configs";
import { RotateCcw, Pencil, Hammer, Trash2, Loader2 } from "lucide-react";

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
}

export function LanguageConfigTable({ languages }: { languages: LanguageConfig[] }) {
  const t = useTranslations("admin.languages");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingLang, setEditingLang] = useState<LanguageConfig | null>(null);
  const [editForm, setEditForm] = useState({ dockerImage: "", compileCommand: "", runCommand: "", dockerfile: "" });
  const [search, setSearch] = useState("");
  const [imageInfo, setImageInfo] = useState<Map<string, string>>(new Map());
  const [buildingLangs, setBuildingLangs] = useState<Set<string>>(new Set());

  const fetchImageStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/docker/images");
      if (res.ok) {
        const json = await res.json();
        const info = new Map<string, string>();
        for (const img of json.data ?? []) {
          info.set(`${img.repository}:${img.tag}`, img.size ?? "");
        }
        setImageInfo(info);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchImageStatus(); }, [fetchImageStatus]);

  function handleBuild(lang: LanguageConfig) {
    setBuildingLangs(prev => new Set(prev).add(lang.language));
    fetch("/api/v1/admin/docker/images/build", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
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
    if (!confirm(t("actions.removeConfirm"))) return;
    fetch("/api/v1/admin/docker/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
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
    if (!confirm(t("edit.resetConfirm"))) return;
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
    if (!confirm(t("actions.resetAllConfirm"))) return;
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
      <div className="flex items-center gap-2 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
          className="max-w-xs"
        />
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleResetAll} disabled={isPending}>
            <RotateCcw className="size-4 mr-1.5" />
            {t("actions.resetAll")}
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">{t("table.enabled")}</TableHead>
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
                <TableCell>
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
                    {imageInfo.size > 0 && (
                      imageInfo.has(lang.dockerImage)
                        ? <Badge variant="outline" className="w-fit text-xs text-green-600 border-green-300">{t("imageStatus.available")}{imageInfo.get(lang.dockerImage) ? ` (${imageInfo.get(lang.dockerImage)})` : ""}</Badge>
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
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(lang)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleBuild(lang)}
                      disabled={buildingLangs.has(lang.language)}
                      title={t("actions.build")}
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
    </>
  );
}
