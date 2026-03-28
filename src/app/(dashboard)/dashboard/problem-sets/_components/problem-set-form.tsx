"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AvailableProblem = { id: string; title: string };
type AvailableGroup = { id: string; name: string };

type ProblemSetEditorValue = {
  id: string;
  name: string;
  description: string;
  problemIds: string[];
  groupIds: string[];
  assignedGroups: { id: string; name: string }[];
};

type ProblemSetFormProps = {
  problemSet?: ProblemSetEditorValue;
  availableProblems: AvailableProblem[];
  availableGroups: AvailableGroup[];
};

export default function ProblemSetForm({
  problemSet,
  availableProblems,
  availableGroups,
}: ProblemSetFormProps) {
  const router = useRouter();
  const t = useTranslations("problemSets");
  const tCommon = useTranslations("common");
  const isEditing = Boolean(problemSet);

  const [isLoading, setIsLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(problemSet?.name ?? "");
  const [description, setDescription] = useState(problemSet?.description ?? "");
  const [selectedProblemIds, setSelectedProblemIds] = useState<string[]>(
    problemSet?.problemIds ?? []
  );
  const [assignedGroups, setAssignedGroups] = useState<{ id: string; name: string }[]>(
    problemSet?.assignedGroups ?? []
  );
  const [selectedGroupToAdd, setSelectedGroupToAdd] = useState("");

  const problemMap = new Map(availableProblems.map((p) => [p.id, p]));
  const unassignedGroups = availableGroups.filter(
    (g) => !assignedGroups.some((ag) => ag.id === g.id)
  );

  function addProblem(problemId: string) {
    if (!problemId || selectedProblemIds.includes(problemId)) return;
    setSelectedProblemIds((prev) => [...prev, problemId]);
  }

  function removeProblem(index: number) {
    setSelectedProblemIds((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAssignGroup() {
    if (!selectedGroupToAdd || !problemSet) return;

    setIsLoading(true);
    try {
      const response = await apiFetch(`/api/v1/problem-sets/${problemSet.id}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: [selectedGroupToAdd] }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "assignFailed");

      const group = availableGroups.find((g) => g.id === selectedGroupToAdd);
      if (group) {
        setAssignedGroups((prev) => [...prev, group]);
      }

      setSelectedGroupToAdd("");
      toast.success(t("assignSuccess"));
      router.refresh();
    } catch {
      toast.error(t("assignFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemoveGroup(groupId: string) {
    if (!problemSet) return;

    setIsLoading(true);
    try {
      const response = await apiFetch(`/api/v1/problem-sets/${problemSet.id}/groups`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "removeGroupFailed");

      setAssignedGroups((prev) => prev.filter((g) => g.id !== groupId));
      toast.success(t("removeGroupSuccess"));
      router.refresh();
    } catch {
      toast.error(t("removeGroupFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!problemSet) return;

    setIsLoading(true);
    try {
      const response = await apiFetch(`/api/v1/problem-sets/${problemSet.id}`, {
        method: "DELETE",
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "deleteFailed");

      toast.success(t("deleteSuccess"));
      router.push("/dashboard/problem-sets");
      router.refresh();
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const url = isEditing
        ? `/api/v1/problem-sets/${problemSet!.id}`
        : "/api/v1/problem-sets";

      const response = await apiFetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          problemIds: selectedProblemIds,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || (isEditing ? "updateFailed" : "createFailed"));
      }

      toast.success(t(isEditing ? "updateSuccess" : "createSuccess"));

      if (!isEditing && payload.data?.id) {
        router.push(`/dashboard/problem-sets/${payload.data.id}`);
      }

      router.refresh();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      const key = [
        "problemSetNameRequired",
        "problemSetNameTooLong",
        "problemSetDescriptionTooLong",
        "problemSetProblemDuplicate",
        "tooManyProblemSetProblems",
      ].includes(msg)
        ? msg
        : isEditing
          ? "updateFailed"
          : "createFailed";
      toast.error(t(key));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {isEditing ? t("editTitle") : t("createTitle")}
        </h2>
        {isEditing && (
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger
              render={
                <Button variant="destructive" size="sm" disabled={isLoading}>
                  {tCommon("delete")}
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("deleteDialogDescription", { name: problemSet?.name ?? "" })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  {tCommon("delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{isEditing ? t("editDescription") : t("createDescription")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ps-name">{t("nameLabel")}</Label>
              <Input
                id="ps-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ps-description">{t("descriptionLabel")}</Label>
              <Textarea
                id="ps-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[100px]"
                disabled={isLoading}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("problemsTitle")}</CardTitle>
            <CardDescription>{t("problemsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select
                key={selectedProblemIds.length}
                onValueChange={(value) => addProblem(value as string)}
                disabled={isLoading || availableProblems.length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t("selectProblem")} />
                </SelectTrigger>
                <SelectContent>
                  {availableProblems
                    .filter((p) => !selectedProblemIds.includes(p.id))
                    .map((problem) => (
                      <SelectItem key={problem.id} value={problem.id} label={problem.title}>
                        {problem.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProblemIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noProblems")}</p>
            ) : (
              <div className="space-y-2">
                {selectedProblemIds.map((pid, index) => {
                  const problem = problemMap.get(pid);
                  return (
                    <div
                      key={pid}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="text-sm">
                        {index + 1}. {problem?.title ?? pid}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeProblem(index)}
                        disabled={isLoading}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        <span className="sr-only">{t("removeProblem")}</span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/problem-sets")}
            disabled={isLoading}
          >
            {tCommon("cancel")}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? tCommon("loading") : isEditing ? tCommon("save") : tCommon("create")}
          </Button>
        </div>
      </form>

      {isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>{t("groupsTitle")}</CardTitle>
            <CardDescription>{t("groupsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select
                value={selectedGroupToAdd}
                onValueChange={(value) => setSelectedGroupToAdd((value as string) ?? "")}
                disabled={isLoading || unassignedGroups.length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t("selectGroupsPlaceholder")}>{unassignedGroups.find((g) => g.id === selectedGroupToAdd)?.name || selectedGroupToAdd}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {unassignedGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id} label={group.name}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                onClick={handleAssignGroup}
                disabled={isLoading || !selectedGroupToAdd}
                size="sm"
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("assignGroups")}
              </Button>
            </div>

            {assignedGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignedGroups.map((group) => (
                  <Badge key={group.id} variant="secondary" className="gap-1 pr-1">
                    {group.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveGroup(group.id)}
                      disabled={isLoading}
                      className="ml-1 rounded-full p-0.5 hover:bg-muted"
                      aria-label={`${t("removeGroup")} ${group.name}`}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
