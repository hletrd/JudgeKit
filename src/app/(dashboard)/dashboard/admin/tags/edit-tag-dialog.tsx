"use client";

import { useEffect, useState } from "react";
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
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateTag } from "@/lib/actions/tag-management";
import { TagFormFields, type TagFormValue } from "./tag-form-fields";

interface EditTagDialogProps {
  tag: {
    id: string;
    name: string;
    color: string | null;
  };
}

export default function EditTagDialog({ tag }: EditTagDialogProps) {
  const t = useTranslations("admin.tags");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState<TagFormValue>({
    name: tag.name,
    color: tag.color,
    hexInput: tag.color ?? "",
  });

  useEffect(() => {
    if (open) {
      setForm({ name: tag.name, color: tag.color, hexInput: tag.color ?? "" });
    }
  }, [open, tag]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await updateTag(tag.id, form.name, form.color);
      if (result.success) {
        toast.success(t("updateSuccess"));
        router.refresh();
        setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <Pencil className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("editTag")}</DialogTitle>
          </DialogHeader>
          <TagFormFields value={form} onChange={setForm} nameInputId="edit-tag-name" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? tCommon("loading") : tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
