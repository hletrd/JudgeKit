"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";

type GroupInstructor = {
  id: string;
  userId: string;
  role: string;
  username: string;
  name: string;
};

type UserOption = {
  id: string;
  username: string;
  name: string;
};

type GroupInstructorsManagerProps = {
  groupId: string;
  canManage: boolean;
  instructors: GroupInstructor[];
  availableUsers: UserOption[];
};

export function GroupInstructorsManager({
  groupId,
  canManage,
  instructors: initialInstructors,
  availableUsers,
}: GroupInstructorsManagerProps) {
  const t = useTranslations("groups");
  const [instructors, setInstructors] = useState(initialInstructors);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<"co_instructor" | "ta">("ta");
  const [isAdding, setIsAdding] = useState(false);
  const normalizedUserSearch = userSearchQuery.trim().toLowerCase();
  const filteredAvailableUsers = normalizedUserSearch
    ? availableUsers.filter((user) =>
        [user.name, user.username]
          .join(" ")
          .toLowerCase()
          .includes(normalizedUserSearch)
      )
    : availableUsers;
  const selectedUser = availableUsers.find((user) => user.id === selectedUserId);
  const selectedUserLabel = selectedUser
    ? `${selectedUser.name} (${selectedUser.username})`
    : "";

  async function handleAdd() {
    if (!selectedUserId) return;
    setIsAdding(true);
    try {
      const res = await apiFetch(`/api/v1/groups/${groupId}/instructors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? t("addInstructorFailed"));
        return;
      }
      const user = availableUsers.find((u) => u.id === selectedUserId);
      if (user) {
        setInstructors((prev) => {
          const existing = prev.findIndex((i) => i.userId === selectedUserId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], role: selectedRole };
            return updated;
          }
          return [...prev, { id: "", userId: user.id, role: selectedRole, username: user.username, name: user.name }];
        });
      }
      setSelectedUserId("");
      toast.success(t("instructorAdded"));
    } catch {
      toast.error(t("addInstructorFailed"));
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    try {
      const res = await apiFetch(`/api/v1/groups/${groupId}/instructors`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        toast.error(t("removeInstructorFailed"));
        return;
      }
      setInstructors((prev) => prev.filter((i) => i.userId !== userId));
      toast.success(t("instructorRemoved"));
    } catch {
      toast.error(t("removeInstructorFailed"));
    }
  }

  const roleLabel = (role: string) =>
    role === "co_instructor" ? t("coInstructor") : t("teachingAssistant");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("groupInstructors")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              value={userSearchQuery}
              onChange={(event) => setUserSearchQuery(event.target.value)}
              placeholder={t("availableInstructorSearchPlaceholder")}
              className="flex-1"
            />
            <Select value={selectedUserId} onValueChange={(value) => setSelectedUserId(value ?? "")}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={t("selectUser")}>
                  {selectedUserLabel || selectedUserId}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {filteredAvailableUsers
                  .filter((u) => !instructors.some((i) => i.userId === u.id))
                  .map((user) => (
                    <SelectItem key={user.id} value={user.id} label={`${user.name} (${user.username})`}>
                      {user.name} ({user.username})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole((value ?? "ta") as "co_instructor" | "ta")}>
              <SelectTrigger className="w-40">
                <SelectValue>{roleLabel(selectedRole)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ta" label={t("teachingAssistant")}>{t("teachingAssistant")}</SelectItem>
                <SelectItem value="co_instructor" label={t("coInstructor")}>{t("coInstructor")}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => void handleAdd()} disabled={!selectedUserId || isAdding} size="sm">
              <Plus className="mr-1 size-4" />
              {t("addInstructor")}
            </Button>
          </div>
        )}
        {canManage && availableUsers.length > 0 && filteredAvailableUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("availableInstructorSearchEmpty")}</p>
        ) : null}

        {instructors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noGroupInstructors")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                {canManage && <TableHead className="w-16" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructors.map((inst) => (
                <TableRow key={inst.userId}>
                  <TableCell>
                    {inst.name} <span className="text-muted-foreground">({inst.username})</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={inst.role === "co_instructor" ? "default" : "secondary"}>
                      {roleLabel(inst.role)}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRemove(inst.userId)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
