"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { useVisibilityPolling } from "@/hooks/use-visibility-polling";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, RefreshCw, Pencil, Check, X, Plus, Copy } from "lucide-react";
import { formatRelativeTimeFromNow } from "@/lib/datetime";
import { toast } from "sonner";

interface Worker {
  id: string;
  hostname: string;
  alias: string | null;
  ipAddress: string | null;
  concurrency: number;
  activeTasks: number;
  version: string | null;
  cpuModel: string | null;
  architecture: string | null;
  labels: string[];
  status: string;
  registeredAt: string;
  lastHeartbeatAt: string;
  deregisteredAt: string | null;
}

interface WorkerStats {
  workersOnline: number;
  workersStale: number;
  workersOffline: number;
  queueDepth: number;
  activeJudging: number;
  totalConcurrency: number;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "online":
      return "default";
    case "stale":
      return "secondary";
    case "offline":
      return "outline";
    default:
      return "outline";
  }
}

function AliasCell({ worker, onUpdate }: { worker: Worker; onUpdate: () => void }) {
  const t = useTranslations("admin.workers");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(worker.alias ?? "");

  async function handleSave() {
    const res = await apiFetch(`/api/v1/admin/workers/${worker.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias: value || null }),
    });
    if (res.ok) {
      setEditing(false);
      onUpdate();
    } else {
      toast.error(t("fetchError"));
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-7 w-32 text-sm"
          placeholder={t("aliasPlaceholder")}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSave} aria-label={t("saveAlias")}>
          <Check className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)} aria-label={t("cancelEdit")}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group">
      <span className="text-sm">{worker.alias || "-"}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => { setValue(worker.alias ?? ""); setEditing(true); }}
        aria-label={t("editAlias")}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}

function AddWorkerDialog() {
  const t = useTranslations("admin.workers");
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const dockerCmd = `JUDGE_BASE_URL=${appUrl}/api/v1 \\
JUDGE_AUTH_TOKEN=<your-judge-auth-token> \\
JUDGE_CONCURRENCY=4 \\
docker compose -f docker-compose.worker.yml up -d`;

  const deployCmd = `./scripts/deploy-worker.sh \\
  --host=<worker-ip> \\
  --app-url=${appUrl}/api/v1 \\
  --concurrency=4 \\
  --sync-images`;

  async function copyText(text: string) {
    const { copyToClipboard } = await import("@/lib/clipboard");
    if (!(await copyToClipboard(text))) {
      toast.error(t("copyFailed"));
      return;
    }
    toast.success(t("copied"));
  }

  return (
    <Dialog>
      <DialogTrigger render={
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {t("addWorker")}
        </Button>
      } />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addWorkerTitle")}</DialogTitle>
          <DialogDescription>{t("addWorkerDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">{t("addWorkerDocker")}</h4>
            <div className="relative">
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">{dockerCmd}</pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6"
                onClick={() => copyText(dockerCmd)}
                aria-label={t("copyDockerCommand")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">{t("addWorkerScript")}</h4>
            <div className="relative">
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">{deployCmd}</pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6"
                onClick={() => copyText(deployCmd)}
                aria-label={t("copyDeployScript")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("addWorkerNote")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WorkersPageClient() {
  const t = useTranslations("admin.workers");
  const locale = useLocale();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [workersRes, statsRes] = await Promise.all([
        apiFetch("/api/v1/admin/workers"),
        apiFetch("/api/v1/admin/workers/stats"),
      ]);
      if (workersRes.ok) {
        const wd = await workersRes.json();
        setWorkers(wd.data ?? []);
      } else {
        toast.error(t("fetchError"));
      }
      if (statsRes.ok) {
        const sd = await statsRes.json();
        setStats(sd.data ?? null);
      } else {
        toast.error(t("fetchError"));
      }
    } catch {
      toast.error(t("fetchError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useVisibilityPolling(() => { void fetchData(); }, 10_000);

  async function handleRemove(id: string) {
    const res = await apiFetch(`/api/v1/admin/workers/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("removeSuccess"));
      fetchData();
    } else {
      toast.error(t("removeFailed"));
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("statsOnline")}</CardDescription>
              <CardTitle className="text-2xl">{stats.workersOnline}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("statsQueueDepth")}</CardDescription>
              <CardTitle className="text-2xl">{stats.queueDepth}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("statsActiveJudging")}</CardDescription>
              <CardTitle className="text-2xl">{stats.activeJudging}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("statsTotalConcurrency")}</CardDescription>
              <CardTitle className="text-2xl">{stats.totalConcurrency}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Workers table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("tableTitle")}</CardTitle>
              <CardDescription>
                {t("tableDescription", { count: workers.length })}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <AddWorkerDialog />
              <Button variant="outline" size="sm" onClick={() => fetchData()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("refresh")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : workers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noWorkers")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colAlias")}</TableHead>
                  <TableHead>{t("colHostname")}</TableHead>
                  <TableHead>{t("colIpAddress")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colConcurrency")}</TableHead>
                  <TableHead>{t("colActiveTasks")}</TableHead>
                  <TableHead>{t("colCpu")}</TableHead>
                  <TableHead>{t("colVersion")}</TableHead>
                  <TableHead>{t("colLastHeartbeat")}</TableHead>
                  <TableHead>{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <AliasCell worker={w} onUpdate={fetchData} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {w.hostname}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {w.ipAddress ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(w.status)}>
                        {w.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{w.concurrency}</TableCell>
                    <TableCell>{w.activeTasks}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {w.cpuModel
                        ? `${w.cpuModel}${w.architecture ? ` (${w.architecture})` : ""}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {w.version ?? "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatRelativeTimeFromNow(w.lastHeartbeatAt, locale)}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button variant="ghost" size="icon" aria-label={t("removeWorker")}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("removeConfirmTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("removeConfirmDescription", {
                                hostname: w.alias || w.hostname,
                              })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {t("cancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemove(w.id)}
                            >
                              {t("removeAction")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
