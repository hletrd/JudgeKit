"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Worker {
  id: string;
  hostname: string;
  concurrency: number;
  activeTasks: number;
  version: string | null;
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

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function WorkersPageClient() {
  const t = useTranslations("admin.workers");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [workersRes, statsRes] = await Promise.all([
        fetch("/api/v1/admin/workers"),
        fetch("/api/v1/admin/workers/stats"),
      ]);
      if (workersRes.ok) {
        const wd = await workersRes.json();
        setWorkers(wd.data ?? []);
      }
      if (statsRes.ok) {
        const sd = await statsRes.json();
        setStats(sd.data ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleRemove(id: string) {
    const res = await fetch(`/api/v1/admin/workers/${id}`, { method: "DELETE" });
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
            <Button variant="outline" size="sm" onClick={() => fetchData()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("refresh")}
            </Button>
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
                  <TableHead>{t("colHostname")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colConcurrency")}</TableHead>
                  <TableHead>{t("colActiveTasks")}</TableHead>
                  <TableHead>{t("colVersion")}</TableHead>
                  <TableHead>{t("colLastHeartbeat")}</TableHead>
                  <TableHead>{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-sm">
                      {w.hostname}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(w.status)}>
                        {w.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{w.concurrency}</TableCell>
                    <TableCell>{w.activeTasks}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {w.version ?? "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatRelativeTime(w.lastHeartbeatAt)}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button variant="ghost" size="icon">
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
                                hostname: w.hostname,
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
