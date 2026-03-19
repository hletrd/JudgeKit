"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { DestructiveActionDialog } from "@/components/destructive-action-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "next/navigation";

type GroupMember = {
  id: string;
  userId: string;
  name: string;
  username: string;
  className: string | null;
  enrolledAt: number | null;
};

type AvailableStudent = {
  id: string;
  name: string;
  username: string;
  className: string | null;
};

type GroupMembersManagerProps = {
  groupId: string;
  canManage: boolean;
  members: GroupMember[];
  availableStudents: AvailableStudent[];
};

function sortMembers(members: GroupMember[]) {
  return [...members].sort((left, right) =>
    `${left.name} ${left.username}`.localeCompare(`${right.name} ${right.username}`)
  );
}

function sortStudents(students: AvailableStudent[]) {
  return [...students].sort((left, right) =>
    `${left.name} ${left.username}`.localeCompare(`${right.name} ${right.username}`)
  );
}

export function GroupMembersManager({
  groupId,
  canManage,
  members,
  availableStudents,
}: GroupMembersManagerProps) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(availableStudents[0]?.id ?? "");
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());
  const [currentMembers, setCurrentMembers] = useState(sortMembers(members));
  const [currentAvailableStudents, setCurrentAvailableStudents] = useState(
    sortStudents(availableStudents)
  );

  function getErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
      return tCommon("error");
    }

    switch (error.message) {
      case "studentRequired":
      case "studentNotFound":
      case "studentInactive":
      case "studentRoleInvalid":
      case "studentAlreadyEnrolled":
      case "studentEnrollmentNotFound":
      case "groupMemberRemovalBlocked":
      case "memberAddFailed":
      case "memberRemoveFailed":
      case "bulkAddFailed":
        return t(error.message);
      default:
        return error.message || tCommon("error");
    }
  }

  async function handleAddMember() {
    if (!selectedStudentId) {
      toast.error(t("studentRequired"));
      return;
    }

    setIsAdding(true);

    try {
      const response = await apiFetch(`/api/v1/groups/${groupId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: selectedStudentId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "memberAddFailed");
      }

      const nextMember = payload.data?.user
        ? {
            id: payload.data.id,
            userId: payload.data.user.id,
            name: payload.data.user.name,
            username: payload.data.user.username,
            className: payload.data.user.className,
            enrolledAt: payload.data.enrolledAt ? new Date(payload.data.enrolledAt).valueOf() : null,
          }
        : null;

      if (nextMember) {
        setCurrentMembers((current) => sortMembers([...current, nextMember]));
        setCurrentAvailableStudents((current) => {
          const nextStudents = current.filter((student) => student.id !== selectedStudentId);
          setSelectedStudentId(nextStudents[0]?.id ?? "");
          setSelectedBulkIds((prev) => {
            const next = new Set(prev);
            next.delete(selectedStudentId);
            return next;
          });
          return nextStudents;
        });
      }

      toast.success(t("memberAddSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsAdding(false);
    }
  }

  async function handleBulkAddMembers() {
    if (selectedBulkIds.size === 0) {
      toast.error(t("bulkAddNoneSelected"));
      return;
    }

    setIsBulkAdding(true);

    try {
      const response = await apiFetch(`/api/v1/groups/${groupId}/members/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds: Array.from(selectedBulkIds) }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "bulkAddFailed");
      }

      const { enrolled, skipped } = payload as { enrolled: number; skipped: number };

      // Remove enrolled students from available list (we don't know which were skipped as duplicates
      // vs invalid, so optimistically remove all selected)
      const enrolledIds = new Set(selectedBulkIds);
      setCurrentAvailableStudents((current) => {
        const remaining = current.filter((s) => !enrolledIds.has(s.id));
        setSelectedStudentId((prev) => {
          if (enrolledIds.has(prev)) {
            return remaining[0]?.id ?? "";
          }
          return prev;
        });
        return remaining;
      });
      setSelectedBulkIds(new Set());

      toast.success(t("bulkAddSuccess", { count: enrolled, skipped }));
      // Refresh server data to show accurate member list
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsBulkAdding(false);
    }
  }

  async function handleRemoveMember(member: GroupMember) {
    try {
      const response = await apiFetch(`/api/v1/groups/${groupId}/members/${member.userId}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "memberRemoveFailed");
      }

      setCurrentMembers((current) => current.filter((entry) => entry.userId !== member.userId));
      setCurrentAvailableStudents((current) =>
        sortStudents([
          ...current,
          {
            id: member.userId,
            name: member.name,
            username: member.username,
            className: member.className,
          },
        ])
      );
      setSelectedStudentId((currentValue) => currentValue || member.userId);
      toast.success(t("memberRemoveSuccess"));
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return false;
    }
  }

  function toggleBulkSelection(studentId: string) {
    setSelectedBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedBulkIds.size === currentAvailableStudents.length) {
      setSelectedBulkIds(new Set());
    } else {
      setSelectedBulkIds(new Set(currentAvailableStudents.map((s) => s.id)));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <CardTitle>{t("membersTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("memberCount", { count: currentMembers.length })}
          </p>
        </div>

        {canManage && (
          <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-80">
            <Label htmlFor={`group-member-select-${groupId}`}>{t("availableStudentsLabel")}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={selectedStudentId} onValueChange={(value) => setSelectedStudentId(value ?? "")}>
                <SelectTrigger id={`group-member-select-${groupId}`} className="min-w-64">
                  <SelectValue placeholder={t("availableStudentsPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {currentAvailableStudents.map((student) => (
                    <SelectItem key={student.id} value={student.id} label={`${student.name} (@${student.username})`}>
                      {student.name} (@{student.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddMember} disabled={isAdding || !selectedStudentId} size="sm">
                {isAdding ? tCommon("loading") : t("addMember")}
              </Button>
            </div>
            {currentAvailableStudents.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("availableStudentsEmpty")}</p>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {canManage && currentAvailableStudents.length > 0 && (
          <div className="flex flex-col gap-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t("selectStudents")}</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  disabled={isBulkAdding}
                >
                  {selectedBulkIds.size === currentAvailableStudents.length
                    ? tCommon("cancel")
                    : tCommon("done")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkAddMembers}
                  disabled={isBulkAdding || selectedBulkIds.size === 0}
                >
                  {isBulkAdding
                    ? tCommon("loading")
                    : t("bulkAdd")}
                  {selectedBulkIds.size > 0 && ` (${selectedBulkIds.size})`}
                </Button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <div className="flex flex-col gap-1">
                {currentAvailableStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={selectedBulkIds.has(student.id)}
                      onCheckedChange={() => toggleBulkSelection(student.id)}
                      disabled={isBulkAdding}
                    />
                    <span>
                      {student.name} (@{student.username})
                      {student.className && (
                        <span className="ml-1 text-muted-foreground">· {student.className}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("memberTable.name")}</TableHead>
              <TableHead>{t("memberTable.username")}</TableHead>
              <TableHead>{tCommon("class")}</TableHead>
              {canManage && <TableHead>{tCommon("action")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentMembers.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell>@{member.username}</TableCell>
                <TableCell>{member.className ?? tCommon("notSet")}</TableCell>
                {canManage && (
                  <TableCell>
                    <DestructiveActionDialog
                      triggerLabel={t("removeMember")}
                      title={t("removeMemberDialogTitle")}
                      description={t("removeMemberDialogDescription", { name: member.name })}
                      confirmLabel={t("removeMember")}
                      cancelLabel={tCommon("cancel")}
                      onConfirmAction={() => handleRemoveMember(member)}
                      triggerVariant="outline"
                      triggerSize="sm"
                      triggerTestId={`group-member-remove-${member.userId}`}
                      confirmTestId={`group-member-remove-confirm-${member.userId}`}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {currentMembers.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground">
                  {t("noMembers")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
