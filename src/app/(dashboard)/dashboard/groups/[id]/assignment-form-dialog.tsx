"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AvailableProblem = {
  id: string;
  title: string;
};

type AssignmentProblemDraft = {
  problemId: string;
  points: number;
};

export type AssignmentEditorValue = {
  id: string;
  title: string;
  description: string;
  startsAt: number | null;
  deadline: number | null;
  lateDeadline: number | null;
  latePenalty: number;
  hasSubmissions: boolean;
  problems: AssignmentProblemDraft[];
};

type AssignmentFormDialogProps = {
  groupId: string;
  availableProblems: AvailableProblem[];
  initialAssignment?: AssignmentEditorValue;
};

function createEmptyProblemDraft(availableProblems: AvailableProblem[]): AssignmentProblemDraft {
  return {
    problemId: availableProblems[0]?.id ?? "",
    points: 100,
  };
}

function formatDateTimeInput(value: number | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function parseDateTimeInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedValue = new Date(trimmedValue).valueOf();
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

export default function AssignmentFormDialog({
  groupId,
  availableProblems,
  initialAssignment,
}: AssignmentFormDialogProps) {
  const router = useRouter();
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const isEditing = Boolean(initialAssignment);
  const problemsLocked = Boolean(initialAssignment?.hasSubmissions);

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState(initialAssignment?.title ?? "");
  const [description, setDescription] = useState(initialAssignment?.description ?? "");
  const [startsAt, setStartsAt] = useState(formatDateTimeInput(initialAssignment?.startsAt ?? null));
  const [deadline, setDeadline] = useState(formatDateTimeInput(initialAssignment?.deadline ?? null));
  const [lateDeadline, setLateDeadline] = useState(
    formatDateTimeInput(initialAssignment?.lateDeadline ?? null)
  );
  const [latePenalty, setLatePenalty] = useState(initialAssignment?.latePenalty ?? 0);
  const [problemRows, setProblemRows] = useState<AssignmentProblemDraft[]>(
    initialAssignment?.problems.length ? initialAssignment.problems : []
  );

  function resetState() {
    setTitle(initialAssignment?.title ?? "");
    setDescription(initialAssignment?.description ?? "");
    setStartsAt(formatDateTimeInput(initialAssignment?.startsAt ?? null));
    setDeadline(formatDateTimeInput(initialAssignment?.deadline ?? null));
    setLateDeadline(formatDateTimeInput(initialAssignment?.lateDeadline ?? null));
    setLatePenalty(initialAssignment?.latePenalty ?? 0);
    setProblemRows(initialAssignment?.problems.length ? initialAssignment.problems : []);
  }

  function getErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
      return tCommon("error");
    }

    switch (error.message) {
      case "assignmentTitleRequired":
      case "assignmentTitleTooLong":
      case "assignmentDescriptionTooLong":
      case "assignmentProblemRequired":
      case "assignmentProblemDuplicate":
      case "assignmentProblemForbidden":
      case "assignmentPointsInvalid":
      case "assignmentLatePenaltyInvalid":
      case "assignmentScheduleInvalid":
      case "assignmentLateDeadlineInvalid":
      case "tooManyAssignmentProblems":
      case "assignmentProblemsLocked":
      case "assignmentCreateFailed":
      case "assignmentUpdateFailed":
        return t(error.message);
      default:
        return error.message || tCommon("error");
    }
  }

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      resetState();
    }
  }

  function updateProblemRow(index: number, updates: Partial<AssignmentProblemDraft>) {
    setProblemRows((currentRows) =>
      currentRows.map((row, currentIndex) =>
        currentIndex === index ? { ...row, ...updates } : row
      )
    );
  }

  function addProblemRow() {
    setProblemRows((currentRows) => [...currentRows, createEmptyProblemDraft(availableProblems)]);
  }

  function removeProblemRow(index: number) {
    setProblemRows((currentRows) => currentRows.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(
        isEditing
          ? `/api/v1/groups/${groupId}/assignments/${initialAssignment?.id}`
          : `/api/v1/groups/${groupId}/assignments`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            description,
            startsAt: parseDateTimeInput(startsAt),
            deadline: parseDateTimeInput(deadline),
            lateDeadline: parseDateTimeInput(lateDeadline),
            latePenalty,
            ...(problemsLocked ? {} : { problems: problemRows }),
          }),
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || (isEditing ? "assignmentUpdateFailed" : "assignmentCreateFailed"));
      }

      toast.success(t(isEditing ? "assignmentUpdateSuccess" : "assignmentCreateSuccess"));
      await handleOpenChange(false);

      const createdAssignmentId = payload.data?.id;
      if (!isEditing && typeof createdAssignmentId === "string") {
        router.push(`/dashboard/groups/${groupId}/assignments/${createdAssignmentId}`);
      }

      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant={isEditing ? "outline" : "default"} size="sm">
            {isEditing ? tCommon("edit") : t("createAssignment")}
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t("assignmentEditDialogTitle") : t("assignmentCreateDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? t("assignmentEditDialogDescription")
                : t("assignmentCreateDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`assignment-title-${initialAssignment?.id ?? "new"}`}>
              {t("assignmentTitleLabel")}
            </Label>
            <Input
              id={`assignment-title-${initialAssignment?.id ?? "new"}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`assignment-description-${initialAssignment?.id ?? "new"}`}>
              {t("assignmentDescriptionLabel")}
            </Label>
            <Textarea
              id={`assignment-description-${initialAssignment?.id ?? "new"}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[160px]"
              disabled={isLoading}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`assignment-starts-at-${initialAssignment?.id ?? "new"}`}>
                {t("assignmentStartsAtLabel")}
              </Label>
              <Input
                id={`assignment-starts-at-${initialAssignment?.id ?? "new"}`}
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`assignment-deadline-${initialAssignment?.id ?? "new"}`}>
                {t("assignmentDeadlineLabel")}
              </Label>
              <Input
                id={`assignment-deadline-${initialAssignment?.id ?? "new"}`}
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`assignment-late-deadline-${initialAssignment?.id ?? "new"}`}>
                {t("assignmentLateDeadlineLabel")}
              </Label>
              <Input
                id={`assignment-late-deadline-${initialAssignment?.id ?? "new"}`}
                type="datetime-local"
                value={lateDeadline}
                onChange={(event) => setLateDeadline(event.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`assignment-late-penalty-${initialAssignment?.id ?? "new"}`}>
                {t("assignmentLatePenaltyLabel")}
              </Label>
              <Input
                id={`assignment-late-penalty-${initialAssignment?.id ?? "new"}`}
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={latePenalty}
                onChange={(event) => setLatePenalty(Number(event.target.value))}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{t("assignmentProblemsTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("assignmentProblemsDescription")}</p>
                {problemsLocked && (
                  <p className="text-sm text-amber-600">{t("assignmentProblemsLocked")}</p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addProblemRow}
                disabled={isLoading || problemsLocked || availableProblems.length === 0}
              >
                <Plus />
                {t("addProblem")}
              </Button>
            </div>

            {problemRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noAssignmentProblems")}</p>
            ) : (
              <div className="space-y-4">
                {problemRows.map((row, index) => (
                  <div
                    key={`${initialAssignment?.id ?? "new"}-assignment-problem-${index}`}
                    className="space-y-4 rounded-lg border bg-muted/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-medium">{t("assignmentProblemLabel", { number: index + 1 })}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeProblemRow(index)}
                        disabled={isLoading || problemsLocked}
                      >
                        <Trash2 />
                        {t("removeProblem")}
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
                      <div className="space-y-2">
                        <Label>{t("assignmentProblemSelectLabel")}</Label>
                        <Select
                          value={row.problemId}
                          onValueChange={(value) =>
                            updateProblemRow(index, { problemId: value ?? "" })
                          }
                          disabled={isLoading || problemsLocked}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("assignmentProblemSelectPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableProblems.map((problem) => (
                              <SelectItem key={problem.id} value={problem.id}>
                                {problem.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`assignment-problem-points-${index}`}>
                          {t("assignmentProblemPointsLabel")}
                        </Label>
                        <Input
                          id={`assignment-problem-points-${index}`}
                          type="number"
                          min={1}
                          max={10000}
                          value={row.points}
                          onChange={(event) =>
                            updateProblemRow(index, { points: Number(event.target.value) })
                          }
                          disabled={isLoading || problemsLocked}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? tCommon("loading")
                : isEditing
                  ? tCommon("save")
                  : tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
