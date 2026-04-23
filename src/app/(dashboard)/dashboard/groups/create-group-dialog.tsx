"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function CreateGroupDialog() {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function resetState() {
    setName("");
    setDescription("");
  }

  function getErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
      return tCommon("error");
    }

    switch (error.message) {
      case "nameRequired":
        return t("nameRequired");
      case "nameTooLong":
        return t("nameTooLong");
      case "descriptionTooLong":
        return t("descriptionTooLong");
      case "createError":
        return t("createError");
      default:
        // Avoid showing raw SyntaxError or parse error strings to the user
        if (error instanceof SyntaxError) {
          return t("createError");
        }
        return tCommon("error");
    }
  }

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      resetState();
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const response = await apiFetch("/api/v1/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error((errorBody as { error?: string }).error || "createError");
        }

        const data = await response.json().catch(() => ({ data: {} })) as { data?: { id?: string } };

        toast.success(t("createSuccess"));
        await handleOpenChange(false);
        const groupId = data.data?.id;
        if (groupId) {
          router.push(`/dashboard/groups/${groupId}`);
        } else {
          router.push("/dashboard/groups");
        }
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button>{t("create")}</Button>} />
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>{t("createDialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="group-name">{t("nameLabel")}</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[140px]"
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon("loading") : tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
