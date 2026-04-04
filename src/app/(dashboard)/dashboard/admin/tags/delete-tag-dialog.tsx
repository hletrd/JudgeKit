"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTag } from "@/lib/actions/tag-management";

interface DeleteTagDialogProps {
  tagId: string;
  tagName: string;
  problemCount: number;
}

export default function DeleteTagDialog({ tagId, tagName, problemCount }: DeleteTagDialogProps) {
  const t = useTranslations("admin.tags");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleDelete() {
    setIsLoading(true);
    try {
      const result = await deleteTag(tagId);
      if (result.success) {
        toast.success(t("deleteSuccess"));
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
      <DialogTrigger>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          <DialogDescription>
            {problemCount > 0
              ? t("deleteConfirmWithProblems", { name: tagName, count: problemCount })
              : t("deleteConfirmDescription", { name: tagName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={isLoading}
          >
            {isLoading ? tCommon("loading") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
