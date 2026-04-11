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
  keyPrefix: string;
  role: string;
  createdById: string;
  createdByName: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  hasEncryptedKey?: boolean;
}

type CreatedKey = {
  id: string;
  key: string;
  keyPrefix: string;
  name: string;
};

function buildMaskedApiKeyPreview(keyPrefix: string) {
  return `${keyPrefix}••••••••••••`;
}

export function ApiKeysClient() {
  const t = useTranslations("admin.apiKeys");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [createdKeyCopied, setCreatedKeyCopied] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState("admin");
  const [createExpiry, setCreateExpiry] = useState("none");
  const [creating, setCreating] = useState(false);
  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    instructor: "Instructor",
  };
  const expiryLabels: Record<string, string> = {
    none: t("expiryNone"),
    "30d": t("expiry30d"),
    "90d": t("expiry90d"),
    "1y": t("expiry1y"),
  };

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
        const json = await res.json();
        setCreateOpen(false);
        setCreateName("");
        setCreateRole("admin");
        setCreateExpiry("none");
        setCreatedKey(json.data ?? null);
        setCreatedKeyCopied(false);
        toast.success(t("createSuccess"));
        fetchKeys();
      } else {
        toast.error(t("createError"));
      }
    } finally {
      setCreating(false);
    }
  }

  async function copyCreatedKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
    } catch {
      toast.error("Failed to copy — please select and copy manually");
      return;
    }
    setCreatedKeyCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCreatedKeyCopied(false), 2000);
  }

  async function handleCopyKeyPrefix(key: ApiKey) {
    try {
      await navigator.clipboard.writeText(buildMaskedApiKeyPreview(key.keyPrefix));
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = buildMaskedApiKeyPreview(key.keyPrefix);
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      try {
        textarea.select();
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopiedKeyId(key.id);
    toast.success(t("copied"));
    setTimeout(() => setCopiedKeyId(null), 2000);
  }

  async function handleToggle(key: ApiKey) {
    try {
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
    } catch {
      toast.error(t("toggleFailed"));
    }
  }

  async function handleDelete(key: ApiKey) {
    try {
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
    } catch {
      toast.error(t("deleteFailed"));
    }
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
        <Dialog
          open={createdKey !== null}
          onOpenChange={(open) => {
            if (!open) {
              setCreatedKey(null);
              setCreatedKeyCopied(false);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("keyCreatedTitle")}</DialogTitle>
              <DialogDescription>{t("keyCreatedDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-md border bg-muted/40 p-3">
                <code className="block break-all text-sm">{createdKey?.key ?? ""}</code>
              </div>
              <div className="text-xs text-muted-foreground">
                {createdKey ? buildMaskedApiKeyPreview(createdKey.keyPrefix) : ""}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={copyCreatedKey}>
                {createdKeyCopied ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {t("copyKey")}
              </Button>
              <Button
                onClick={() => {
                  setCreatedKey(null);
                  setCreatedKeyCopied(false);
                }}
              >
                {t("done")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                    <SelectValue>{roleLabels[createRole] || createRole}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin" label="Super Admin">Super Admin</SelectItem>
                    <SelectItem value="admin" label="Admin">Admin</SelectItem>
                    <SelectItem value="instructor" label="Instructor">Instructor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("expiryLabel")}</Label>
                <Select value={createExpiry} onValueChange={v => { if (v) setCreateExpiry(v); }}>
                  <SelectTrigger>
                    <SelectValue>{expiryLabels[createExpiry] || createExpiry}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" label={t("expiryNone")}>{t("expiryNone")}</SelectItem>
                    <SelectItem value="30d" label={t("expiry30d")}>{t("expiry30d")}</SelectItem>
                    <SelectItem value="90d" label={t("expiry90d")}>{t("expiry90d")}</SelectItem>
                    <SelectItem value="1y" label={t("expiry1y")}>{t("expiry1y")}</SelectItem>
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
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs bg-muted px-2 py-1 rounded truncate select-all max-w-[240px]">
                            {buildMaskedApiKeyPreview(key.keyPrefix)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => handleCopyKeyPrefix(key)}
                            aria-label={t("copyKey")}
                          >
                            {copiedKeyId === key.id ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
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
