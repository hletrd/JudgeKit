"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Problem = { id: string; title: string };

export function QuickCreateContestForm({ problems }: { problems: Problem[] }) {
  const t = useTranslations("contests.quickCreate");
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [enableAntiCheat, setEnableAntiCheat] = useState(true);
  const [selectedProblems, setSelectedProblems] = useState<{ id: string; points: number }[]>([]);

  function addProblem() {
    // Find first unselected problem
    const used = new Set(selectedProblems.map((p) => p.id));
    const available = problems.find((p) => !used.has(p.id));
    if (available) {
      setSelectedProblems([...selectedProblems, { id: available.id, points: 100 }]);
    }
  }

  function removeProblem(index: number) {
    setSelectedProblems(selectedProblems.filter((_, i) => i !== index));
  }

  function updateProblemId(index: number, newId: string) {
    const copy = [...selectedProblems];
    copy[index].id = newId;
    setSelectedProblems(copy);
  }

  function updateProblemPoints(index: number, pts: number) {
    const copy = [...selectedProblems];
    copy[index].points = pts;
    setSelectedProblems(copy);
  }

  async function handleCreate() {
    if (!title.trim() || selectedProblems.length === 0) return;
    setCreating(true);

    try {
      const res = await apiFetch("/api/v1/contests/quick-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          durationMinutes,
          problemIds: selectedProblems.map((p) => p.id),
          problemPoints: selectedProblems.map((p) => p.points),
          enableAntiCheat,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        toast.success(t("createSuccess"));
        router.push(`/dashboard/contests/${json.data.assignmentId}`);
      } else {
        toast.error(t("createError"));
      }
    } finally {
      setCreating(false);
    }
  }

  const usedIds = new Set(selectedProblems.map((p) => p.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>{t("assessmentTitle")}</Label>
          <Input
            placeholder={t("titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("assessmentDescription")}</Label>
          <Textarea
            placeholder={t("descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("duration")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1440}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">{t("minutes")}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("antiCheat")}</Label>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox checked={enableAntiCheat} onCheckedChange={(v) => setEnableAntiCheat(v === true)} />
              <span className="text-sm text-muted-foreground">
                {enableAntiCheat ? t("antiCheatOn") : t("antiCheatOff")}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label>{t("problems")}</Label>
          {selectedProblems.map((sp, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={sp.id} onValueChange={(v) => { if (v) updateProblemId(i, v); }}>
                <SelectTrigger className="flex-1">
                  <SelectValue>
                    {problems.find((p) => p.id === sp.id)?.title ?? sp.id}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {problems.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={usedIds.has(p.id) && p.id !== sp.id} label={p.title}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                value={sp.points}
                onChange={(e) => updateProblemPoints(i, Number(e.target.value) || 100)}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">{t("pts")}</span>
              <Button variant="ghost" size="sm" onClick={() => removeProblem(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addProblem} disabled={selectedProblems.length >= problems.length}>
            <Plus className="h-4 w-4 mr-1" />
            {t("addProblem")}
          </Button>
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={handleCreate}
          disabled={creating || !title.trim() || selectedProblems.length === 0}
        >
          {creating ? t("creating") : t("createAssessment")}
        </Button>
      </CardContent>
    </Card>
  );
}
