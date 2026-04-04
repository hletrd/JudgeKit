"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createTag } from "@/lib/actions/tag-management";

const COLOR_PALETTE = [
  "#EF4444", "#F97316", "#F59E0B", "#10B981",
  "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#6B7280",
];

export default function AddTagDialog() {
  const t = useTranslations("admin.tags");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [hexInput, setHexInput] = useState("");

  function resetFormState() {
    setName("");
    setColor(null);
    setHexInput("");
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetFormState();
  }

  function handlePaletteSelect(c: string) {
    setColor(c);
    setHexInput(c);
  }

  function handleHexChange(value: string) {
    setHexInput(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setColor(value);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await createTag(name, color);
      if (result.success) {
        toast.success(t("createSuccess"));
        router.refresh();
        handleOpenChange(false);
      } else {
        toast.error(t(result.error));
      }
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button><Plus className="size-4 mr-2" />{t("addTag")}</Button>} />
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("addTag")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tag-name">{t("table.name")}</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("color")} ({tCommon("optional")})</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="size-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "hsl(var(--foreground))" : "transparent",
                  }}
                  onClick={() => handlePaletteSelect(c)}
                  aria-label={c}
                />
              ))}
              <button
                type="button"
                className="size-7 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center text-xs text-muted-foreground"
                onClick={() => { setColor(null); setHexInput(""); }}
                aria-label={t("noColor")}
              >
                ×
              </button>
            </div>
            <Input
              placeholder="#3B82F6"
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              maxLength={7}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? tCommon("loading") : tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
