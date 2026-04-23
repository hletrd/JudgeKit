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
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Trash2 } from "lucide-react";

interface RoleDeleteDialogProps {
  roleId: string;
  roleName: string;
  displayName: string;
  userCount: number;
}

export default function RoleDeleteDialog({
  roleId,
  displayName,
  userCount,
}: RoleDeleteDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations("admin.roles");
  const tCommon = useTranslations("common");

  const hasUsers = userCount > 0;

  async function handleDelete() {
    if (hasUsers) return;
    setLoading(true);

    try {
      const res = await apiFetch(`/api/v1/admin/roles/${roleId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "unknown");
      }

      toast.success(t("deleteSuccess"));
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Role delete failed:", error);
      }
      toast.error(t("deleteFailed"));
    } finally {
      setLoading(false);
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
            {hasUsers
              ? t("cannotDeleteWithUsers", { count: userCount })
              : t("deleteConfirmDescription", { name: displayName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          {!hasUsers && (
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={loading}
            >
              {loading ? tCommon("loading") : tCommon("delete")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
