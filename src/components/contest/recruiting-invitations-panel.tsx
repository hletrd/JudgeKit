"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Plus, Check, Ban, Trash2, Link, Copy, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Invitation = {
  id: string;
  token: string;
  candidateName: string;
  candidateEmail: string | null;
  metadata: Record<string, string>;
  status: string;
  userId: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  redeemedAt: string | null;
  createdAt: string;
};

type Stats = {
  total: number;
  pending: number;
  redeemed: number;
  revoked: number;
  expired: number;
};

export function RecruitingInvitationsPanel({ assignmentId }: { assignmentId: string }) {
  const t = useTranslations("contests.invitations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, redeemed: 0, revoked: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedTemporaryPassword, setRevealedTemporaryPassword] = useState<{ candidateName: string; password: string } | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createExpiry, setCreateExpiry] = useState("none");
  const [customExpiryDate, setCustomExpiryDate] = useState("");
  const [metadataFields, setMetadataFields] = useState<{ key: string; value: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (!revealedTemporaryPassword) return;
    const timer = setTimeout(() => setRevealedTemporaryPassword(null), 60_000);
    return () => clearTimeout(timer);
  }, [revealedTemporaryPassword]);

  const fetchData = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (statusFilter !== "all") query.set("status", statusFilter);
      if (search) query.set("search", search);

      const [invRes, statsRes] = await Promise.all([
        apiFetch(`/api/v1/contests/${assignmentId}/recruiting-invitations?${query}`),
        apiFetch(`/api/v1/contests/${assignmentId}/recruiting-invitations/stats`),
      ]);

      if (invRes.ok) {
        const json = await invRes.json();
        setInvitations(json.data ?? []);
      }
      if (statsRes.ok) {
        const json = await statsRes.json();
        setStats(json.data ?? stats);
      }
    } catch {
      toast.error(t("fetchError"));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, statusFilter, search, t, stats]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      let expiresAt: string | null = null;
      if (createExpiry === "custom" && customExpiryDate) {
        expiresAt = new Date(customExpiryDate + "T23:59:59").toISOString();
      } else if (createExpiry !== "none" && createExpiry !== "custom") {
        const days = createExpiry === "7d" ? 7 : createExpiry === "30d" ? 30 : 90;
        expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      }

      const metadata: Record<string, string> = {};
      for (const f of metadataFields) {
        if (f.key.trim() && f.value.trim()) metadata[f.key.trim()] = f.value.trim();
      }

      const res = await apiFetch(`/api/v1/contests/${assignmentId}/recruiting-invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName: createName.trim(),
          candidateEmail: createEmail.trim() || undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          expiresAt,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const token = json.data?.token as string | undefined;
        setCreateOpen(false);
        setCreateName("");
        setCreateEmail("");
        setCreateExpiry("none");
        setMetadataFields([]);
        if (token) {
          const link = `${baseUrl}/recruit/${token}`;
          setCreatedLink(link);
          try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
        }
        toast.success(t("createSuccess"));
        fetchData();
      } else {
        try {
          const json = await res.json();
          const code = json.error ?? json.code ?? "";
          if (code === "emailAlreadyInvited") {
            toast.error(t("emailAlreadyInvited"));
          } else {
            toast.error(t("createError"));
          }
        } catch {
          toast.error(t("createError"));
        }
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleCopyLink(invitation: Invitation) {
    const url = `${baseUrl}/recruit/${invitation.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(invitation.id);
    toast.success(t("linkCopied"));
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleRevoke(invitation: Invitation) {
    const res = await apiFetch(
      `/api/v1/contests/${assignmentId}/recruiting-invitations/${invitation.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked" }),
      }
    );
    if (res.ok) {
      toast.success(t("revokeSuccess"));
      fetchData();
    }
  }



  async function handleResetAccountPassword(invitation: Invitation) {
    const res = await apiFetch(
      `/api/v1/contests/${assignmentId}/recruiting-invitations/${invitation.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetAccountPassword: true }),
      }
    );
    if (!res.ok) {
      toast.error(t("accountPasswordResetError"));
      return;
    }

    toast.success(t("accountPasswordResetSuccess"));
  }


  async function handleDelete(invitation: Invitation) {
    const res = await apiFetch(
      `/api/v1/contests/${assignmentId}/recruiting-invitations/${invitation.id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success(t("deleteSuccess"));
      fetchData();
    }
  }

  function getStatusBadge(inv: Invitation) {
    if (inv.status === "revoked") return <Badge variant="destructive">{t("statusRevoked")}</Badge>;
    if (inv.status === "redeemed") return <Badge variant="default">{t("statusRedeemed")}</Badge>;
    if (inv.isExpired) return <Badge variant="secondary">{t("statusExpired")}</Badge>;
    return <Badge variant="outline">{t("statusPending")}</Badge>;
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return formatDateTimeInTimeZone(dateStr, locale);
  }

  const expiryLabels: Record<string, string> = {
    none: t("noExpiry"),
    "7d": t("expiry7d"),
    "30d": t("expiry30d"),
    "90d": t("expiry90d"),
    custom: t("expiryCustom"),
  };
  const statusFilterLabels: Record<string, string> = {
    all: t("filterAll"),
    pending: t("statusPending"),
    redeemed: t("statusRedeemed"),
    revoked: t("statusRevoked"),
  };
  const selectedStatusFilterLabel = statusFilterLabels[statusFilter] ?? statusFilter;

  return (
    <div className="space-y-4">
      {/* Created link dialog */}
      <Dialog open={!!createdLink} onOpenChange={(open) => { if (!open) setCreatedLink(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("linkCreatedTitle")}</DialogTitle>
            <DialogDescription>{t("linkCreatedDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
            <code className="flex-1 truncate text-xs">{createdLink}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (createdLink) {
                  await navigator.clipboard.writeText(createdLink);
                  toast.success(t("linkCopied"));
                }
              }}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              {t("copyLink")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {(["total", "pending", "redeemed", "revoked", "expired"] as const).map((key) => (
          <Card key={key}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats[key]}</p>
              <p className="text-xs text-muted-foreground">{t(`stats.${key}`)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => { if (v) setStatusFilter(v); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>{selectedStatusFilterLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" label={t("filterAll")}>{t("filterAll")}</SelectItem>
            <SelectItem value="pending" label={t("statusPending")}>{t("statusPending")}</SelectItem>
            <SelectItem value="redeemed" label={t("statusRedeemed")}>{t("statusRedeemed")}</SelectItem>
            <SelectItem value="revoked" label={t("statusRevoked")}>{t("statusRevoked")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {t("createInvitation")}
              </Button>
            } />
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("createTitle")}</DialogTitle>
                <DialogDescription>{t("createDescription")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("candidateName")}</Label>
                  <Input
                    placeholder={t("candidateNamePlaceholder")}
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("candidateEmail")}</Label>
                  <Input
                    type="email"
                    placeholder={t("candidateEmailPlaceholder")}
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("expiresAt")}</Label>
                  <Select value={createExpiry} onValueChange={(v) => { if (v) setCreateExpiry(v); }}>
                    <SelectTrigger>
                      <SelectValue>{expiryLabels[createExpiry] || createExpiry}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" label={t("noExpiry")}>{t("noExpiry")}</SelectItem>
                      <SelectItem value="7d" label={t("expiry7d")}>{t("expiry7d")}</SelectItem>
                      <SelectItem value="30d" label={t("expiry30d")}>{t("expiry30d")}</SelectItem>
                      <SelectItem value="90d" label={t("expiry90d")}>{t("expiry90d")}</SelectItem>
                      <SelectItem value="custom" label={t("expiryCustom")}>{t("expiryCustom")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {createExpiry === "custom" && (
                    <Input
                      type="date"
                      value={customExpiryDate}
                      onChange={(e) => setCustomExpiryDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                    />
                  )}
                </div>
                {/* Dynamic metadata fields */}
                <div className="space-y-2">
                  <Label>{t("metadata")}</Label>
                  {metadataFields.map((field, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder={t("metadataKey")}
                        value={field.key}
                        onChange={(e) => {
                          const copy = [...metadataFields];
                          copy[i].key = e.target.value;
                          setMetadataFields(copy);
                        }}
                        className="flex-1"
                      />
                      <Input
                        placeholder={t("metadataValue")}
                        value={field.value}
                        onChange={(e) => {
                          const copy = [...metadataFields];
                          copy[i].value = e.target.value;
                          setMetadataFields(copy);
                        }}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMetadataFields(metadataFields.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMetadataFields([...metadataFields, { key: "", value: "" }])}
                  >
                    {t("addField")}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleCreate} disabled={creating || !createName.trim() || !createEmail.trim()}>
                  {t("create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {/* Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
      ) : invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noInvitations")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colExpires")}</TableHead>
                <TableHead>{t("colRedeemed")}</TableHead>
                <TableHead>{t("colCreated")}</TableHead>
                <TableHead>{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.candidateName}</TableCell>
                  <TableCell>{inv.candidateEmail || "-"}</TableCell>
                  <TableCell>{getStatusBadge(inv)}</TableCell>
                  <TableCell>{inv.expiresAt ? formatDate(inv.expiresAt) : t("noExpiry")}</TableCell>
                  <TableCell>{formatDate(inv.redeemedAt)}</TableCell>
                  <TableCell>{formatDate(inv.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyLink(inv)}
                        title={t("copyLink")}
                      >
                        {copiedId === inv.id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Link className="h-4 w-4" />
                        )}
                      </Button>
                      {inv.status === "redeemed" && (
                        <AlertDialog>
                            <AlertDialogTrigger render={
                              <Button variant="ghost" size="sm" title={t("resetAccountPassword")}>
                                <ShieldAlert className="h-4 w-4" />
                              </Button>
                            } />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("resetAccountPasswordConfirmTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("resetAccountPasswordConfirm", { name: inv.candidateName })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleResetAccountPassword(inv)}>
                                  {t("resetAccountPassword")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {inv.status === "pending" && (
                        <>
                          <AlertDialog>
                            <AlertDialogTrigger render={
                              <Button variant="ghost" size="sm" title={t("revoke")}>
                                <Ban className="h-4 w-4" />
                              </Button>
                            } />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("revokeConfirmTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("revokeConfirm", { name: inv.candidateName })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRevoke(inv)}>
                                  {t("revoke")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <AlertDialog>
                            <AlertDialogTrigger render={
                              <Button variant="ghost" size="sm" title={t("delete")}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            } />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("deleteConfirm", { name: inv.candidateName })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(inv)}>
                                  {t("delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
