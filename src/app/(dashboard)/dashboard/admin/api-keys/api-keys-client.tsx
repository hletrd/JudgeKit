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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Copy, Trash2, Check } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  keyPlain: string;
  keyPrefix: string;
  role: string;
  createdById: string;
  createdByName: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export function ApiKeysClient() {
  const t = useTranslations("admin.apiKeys");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState("admin");
  const [createExpiry, setCreateExpiry] = useState("none");
  const [creating, setCreating] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/api-keys", {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (res.ok) {
        const json = await res.json();
        setKeys(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      let expiresAt: string | null = null;
      if (createExpiry !== "none") {
        const days = createExpiry === "30d" ? 30 : createExpiry === "90d" ? 90 : 365;
        expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      }

      const res = await fetch("/api/v1/admin/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ name: createName.trim(), role: createRole, expiresAt }),
      });

      if (res.ok) {
        setCreateOpen(false);
        setCreateName("");
        setCreateRole("admin");
        setCreateExpiry("none");
        toast.success(t("createSuccess"));
        fetchKeys();
      } else {
        toast.error(t("createError"));
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(key: ApiKey) {
    const res = await fetch(`/api/v1/admin/api-keys/${key.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ isActive: !key.isActive }),
    });
    if (res.ok) {
      toast.success(key.isActive ? t("deactivateSuccess") : t("activateSuccess"));
      fetchKeys();
    } else {
      toast.error(t("toggleFailed"));
    }
  }

  async function handleDelete(key: ApiKey) {
    const res = await fetch(`/api/v1/admin/api-keys/${key.id}`, {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (res.ok) {
      toast.success(t("deleteSuccess"));
      fetchKeys();
    } else {
      toast.error(t("deleteFailed"));
    }
  }

  async function copyKey(key: ApiKey) {
    await navigator.clipboard.writeText(key.keyPlain);
    setCopiedId(key.id);
    toast.success(t("copied"));
    setTimeout(() => setCopiedId(null), 2000);
  }

  function getStatus(key: ApiKey) {
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return { label: t("expired"), variant: "destructive" as const };
    }
    if (!key.isActive) {
      return { label: t("inactive"), variant: "secondary" as const };
    }
    return { label: t("active"), variant: "default" as const };
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return t("never");
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {t("createKey")}
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("createTitle")}</DialogTitle>
              <DialogDescription>{t("createDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("nameLabel")}</Label>
                <Input
                  placeholder={t("namePlaceholder")}
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("roleLabel")}</Label>
                <Select value={createRole} onValueChange={v => { if (v) setCreateRole(v); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="instructor">Instructor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("expiryLabel")}</Label>
                <Select value={createExpiry} onValueChange={v => { if (v) setCreateExpiry(v); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("expiryNone")}</SelectItem>
                    <SelectItem value="30d">{t("expiry30d")}</SelectItem>
                    <SelectItem value="90d">{t("expiry90d")}</SelectItem>
                    <SelectItem value="1y">{t("expiry1y")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={handleCreate} disabled={creating || !createName.trim()}>
                {t("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noKeys")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colKey")}</TableHead>
                  <TableHead>{t("colRole")}</TableHead>
                  <TableHead>{t("colCreatedBy")}</TableHead>
                  <TableHead>{t("colLastUsed")}</TableHead>
                  <TableHead>{t("colExpires")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const status = getStatus(key);
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <code className="text-xs bg-muted px-2 py-1 rounded truncate select-all max-w-[280px] block">
                            {key.keyPlain}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 shrink-0"
                            onClick={() => copyKey(key)}
                          >
                            {copiedId === key.id ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{key.role}</Badge>
                      </TableCell>
                      <TableCell>{key.createdByName ?? "-"}</TableCell>
                      <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                      <TableCell>
                        {key.expiresAt ? formatDate(key.expiresAt) : t("noExpiry")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggle(key)}
                          >
                            {key.isActive ? t("inactive") : t("active")}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("deleteConfirmDescription", { name: key.name })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(key)}>
                                  {t("delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
