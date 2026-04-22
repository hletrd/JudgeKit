"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Loader2, CheckCircle2 } from "lucide-react";

export function ContestJoinClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("contests.accessCode");
  const [code, setCode] = useState(searchParams.get("code") ?? "");

  // Clear access code from URL to prevent leakage via browser history/Referer
  useEffect(() => {
    if (searchParams.get("code")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [shaking, setShaking] = useState(false);

  async function handleJoin(submitCode?: string) {
    const codeToUse = submitCode ?? code;
    if (!codeToUse.trim()) return;

    setIsLoading(true);
    try {
      const res = await apiFetch("/api/v1/contests/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeToUse }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "joinFailed");
      }

      const payload = await res.json();

      setSuccess(true);
      if (payload.data.alreadyEnrolled) {
        toast.info(t("alreadyEnrolled"));
      } else {
        toast.success(t("joinSuccess"));
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      router.push(`/dashboard/contests/${payload.data.assignmentId}`);
    } catch {
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
      toast.error(t("joinFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-12">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />
      <Card
        className={`w-full max-w-md shadow-lg transition-all duration-200${shaking ? " [animation:shake_0.6s_ease-in-out]" : ""}`}
      >
        <CardHeader className="items-center text-center pb-2">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Trophy className="h-7 w-7 text-primary [animation:pulse-slow_2.4s_ease-in-out_infinite]" />
          </div>
          <CardTitle className="text-2xl">{t("joinTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{t("joinDescription")}</p>
        </CardHeader>
        <CardContent className="pt-4">
          {success ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500 animate-pulse" />
              <p className="text-base font-medium text-green-600">{t("successRedirect")}</p>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleJoin();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="access-code">{t("codeLabel")}</Label>
                {/* tracking-[0.35em] is for alphanumeric access codes (font-mono) — safe for Korean locale */}
                <Input
                  id="access-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={t("codePlaceholder")}
                  disabled={isLoading}
                  className="text-center text-xl tracking-[0.35em] font-mono h-12"
                  maxLength={32}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full h-11 text-base" disabled={isLoading || !code.trim()}>
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("joining")}
                  </span>
                ) : (
                  t("joinButton")
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
