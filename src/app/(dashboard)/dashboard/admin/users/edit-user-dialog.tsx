"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { editUser } from "@/lib/actions/user-management";

interface RoleOption {
  name: string;
  displayName: string;
  level: number;
}

interface EditUserDialogProps {
  user: {
    id: string;
    username: string;
    email: string | null;
    name: string;
    className?: string | null;
    role: string;
  };
  actorRole?: string;
  availableRoles?: RoleOption[];
}

export default function EditUserDialog({ user, actorRole, availableRoles }: EditUserDialogProps) {
  const t = useTranslations("admin.users");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email || "");
  const [name, setName] = useState(user.name);
  const [className, setClassName] = useState(user.className || "");
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setUsername(user.username);
      setEmail(user.email || "");
      setName(user.name);
      setClassName(user.className || "");
      setRole(user.role);
      setPassword("");
    }
  }, [open, user]);

  const builtinRoleLabels: Record<string, string> = {
    student: t("roleOptions.student"),
    instructor: t("roleOptions.instructor"),
    admin: t("roleOptions.admin"),
    super_admin: t("roleOptions.super_admin"),
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await editUser(user.id, { username, email, name, className, role, password });
      if (result.success) {
        toast.success(t("updateSuccess"));
        setOpen(false);
        router.refresh();
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
      <DialogTrigger render={<Button variant="outline" size="sm">{tCommon("edit")}</Button>} />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("editUser")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-username">{t("table.username")}</Label>
            <Input id="edit-username" value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t("table.name")}</Label>
            <Input id="edit-name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-className">{tCommon("class")}</Label>
            <Input id="edit-className" value={className} onChange={e => setClassName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">{t("table.email")} ({tCommon("optional")})</Label>
            <Input id="edit-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-role">{t("table.role")}</Label>
            <Select value={role} onValueChange={v => { if (v) setRole(v); }} disabled={user.role === "super_admin" || actorRole === "instructor"}>
              <SelectTrigger id="edit-role">
                <SelectValue>{builtinRoleLabels[role] || role}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableRoles ? (
                  availableRoles
                    .filter((r) => r.name !== "super_admin" || user.role === "super_admin")
                    .map((r) => (
                      <SelectItem key={r.name} value={r.name} label={builtinRoleLabels[r.name] ?? r.displayName}>
                        {builtinRoleLabels[r.name] ?? r.displayName}
                      </SelectItem>
                    ))
                ) : (
                  <>
                    <SelectItem value="student" label={builtinRoleLabels.student}>{builtinRoleLabels.student}</SelectItem>
                    {(!actorRole || actorRole === "admin" || actorRole === "super_admin") && (
                      <>
                        <SelectItem value="instructor" label={builtinRoleLabels.instructor}>{builtinRoleLabels.instructor}</SelectItem>
                        <SelectItem value="admin" label={builtinRoleLabels.admin}>{builtinRoleLabels.admin}</SelectItem>
                      </>
                    )}
                    {user.role === "super_admin" && <SelectItem value="super_admin" label={builtinRoleLabels.super_admin}>{builtinRoleLabels.super_admin}</SelectItem>}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-password">{t("newPasswordLabel")}</Label>
            <Input id="edit-password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <p className="text-sm text-muted-foreground">{t("newPasswordHint")}</p>
          </div>
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
