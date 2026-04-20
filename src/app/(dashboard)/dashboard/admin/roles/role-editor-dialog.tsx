"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Plus, Pencil } from "lucide-react";
import CapabilityMatrix from "./capability-matrix";

interface RoleData {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isBuiltin: boolean;
  level: number;
  capabilities: string[];
}

interface RoleEditorDialogProps {
  mode: "create" | "edit";
  role?: RoleData;
  superAdminLevel?: number;
}

export default function RoleEditorDialog({ mode, role, superAdminLevel = 4 }: RoleEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(role?.name ?? "");
  const [displayName, setDisplayName] = useState(role?.displayName ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [level, setLevel] = useState(role?.level ?? 0);
  const [capabilities, setCapabilities] = useState<string[]>(role?.capabilities ?? []);
  const router = useRouter();
  const t = useTranslations("admin.roles");
  const tCommon = useTranslations("common");

  function resetForm() {
    if (mode === "create") {
      setName("");
      setDisplayName("");
      setDescription("");
      setLevel(0);
      setCapabilities([]);
    } else if (role) {
      setName(role.name);
      setDisplayName(role.displayName);
      setDescription(role.description ?? "");
      setLevel(role.level);
      setCapabilities(role.capabilities);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const url =
        mode === "create"
          ? "/api/v1/admin/roles"
          : `/api/v1/admin/roles/${role!.id}`;

      const body =
        mode === "create"
          ? { name, displayName, description: description || null, level, capabilities }
          : {
              displayName,
              description: description || null,
              ...(role?.isBuiltin ? {} : { level }),
              ...((role && role.level >= superAdminLevel) ? {} : { capabilities }),
            };

      const res = await apiFetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "unknown");
      }

      toast.success(mode === "create" ? t("createSuccess") : t("updateSuccess"));
      setOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown";
      toast.error(mode === "create" ? t("createFailed") : t("updateFailed"), {
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  }

  const isSuperAdmin = role != null && role.level >= superAdminLevel;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(); }}>
      <DialogTrigger>
        {mode === "create" ? (
          <Button>
            <Plus className="size-4 mr-2" />
            {t("createRole")}
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            <Pencil className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createRole") : t("editRole")}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? t("description") : `${role?.displayName ?? ""}`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="roleName">{t("roleName")}</Label>
              <Input
                id="roleName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. teaching_assistant"
                pattern="^[a-z][a-z0-9_]{1,49}$"
                required
              />
              <p className="text-xs text-muted-foreground">{t("roleNameHint")}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="displayName">{t("displayName")}</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Teaching Assistant"
              required
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("descriptionLabel")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder=""
              maxLength={500}
              rows={2}
            />
          </div>

          {!(role?.isBuiltin) && (
            <div className="space-y-2">
              <Label htmlFor="level">{t("level")}</Label>
              <Input
                id="level"
                type="number"
                min={0}
                max={2}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">{t("levelHint")}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("capabilities")}</Label>
            <CapabilityMatrix
              selected={capabilities}
              onChange={setCapabilities}
              disabled={isSuperAdmin}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? tCommon("loading") : tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
