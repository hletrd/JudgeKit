"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
// i18n keys used from "contests.accessCode" and "common"
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Key, Link2, Trash2 } from "lucide-react";
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

interface AccessCodeManagerProps {
  assignmentId: string;
}

export function AccessCodeManager({ assignmentId }: AccessCodeManagerProps) {
  const t = useTranslations("contests.accessCode");
  const tCommon = useTranslations("common");
  const [code, setCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);

  const fetchCode = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/v1/contests/${assignmentId}/access-code`);
      if (res.ok) {
        const json = await res.json();
        setCode(json.data.accessCode);
      }
    } catch {
      // ignore
    }
  }, [assignmentId]);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  async function copyValue(value: string, { showToast = false }: { showToast?: boolean } = {}) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error(t("copyFailed"));
      return;
    }

    setCopied(true);
    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);

    if (showToast) {
      toast.success(t("copied"));
    }
  }

  async function handleGenerate() {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/v1/contests/${assignmentId}/access-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const json = await res.json();
        const nextCode = json.data.accessCode as string;
        setCode(nextCode);
        await copyValue(nextCode);
        toast.success(t("generateSuccess"));
      } else {
        toast.error(tCommon("error"));
      }
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRevoke() {
    setRevokeConfirmOpen(false);
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/v1/contests/${assignmentId}/access-code`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCode(null);
        toast.success(t("revokeSuccess"));
      } else {
        toast.error(tCommon("error"));
      }
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    if (!code) return;
    await copyValue(code);
  }

  async function handleCopyLink() {
    if (!code) return;
    const url = `${window.location.origin}/dashboard/contests/join?code=${code}`;
    await copyValue(url, { showToast: true });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Key className="size-4" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {code ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-4 py-3">
              {/* tracking-widest is for alphanumeric access codes (font-mono) — safe for Korean locale */}
              <code className="flex-1 text-center text-lg font-mono tracking-widest">
                {code}
              </code>
              <Button variant="ghost" size="sm" onClick={handleCopy} disabled={isLoading}>
                <Copy className="size-4" />
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyLink} disabled={isLoading}>
                <Link2 className="size-4" />
                {t("shareLink")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isLoading}>
                <Key className="size-4" />
                {t("generate")}
              </Button>
              <AlertDialog open={revokeConfirmOpen} onOpenChange={setRevokeConfirmOpen}>
                <AlertDialogTrigger render={
                  <Button variant="destructive" size="sm" disabled={isLoading}>
                    <Trash2 className="size-4" />
                    {t("revoke")}
                  </Button>
                } />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("revoke")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("revokeConfirm")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevoke}>{t("revoke")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("noCode")}</p>
            <Button onClick={handleGenerate} disabled={isLoading} size="sm">
              <Key className="size-4" />
              {t("generate")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
