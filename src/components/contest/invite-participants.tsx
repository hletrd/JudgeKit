"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch, apiFetchJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Check, Loader2 } from "lucide-react";

interface InviteParticipantsProps {
  assignmentId: string;
}

type UserResult = {
  id: string;
  username: string;
  name: string;
  className: string | null;
  alreadyEnrolled: boolean;
};

export function InviteParticipants({ assignmentId }: InviteParticipantsProps) {
  const t = useTranslations("contests.invite");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      // Cancel any in-flight search request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsSearching(true);
      try {
        const { ok, data } = await apiFetchJson<{ data: UserResult[] }>(
          `/api/v1/contests/${assignmentId}/invite?q=${encodeURIComponent(q.trim())}`,
          { signal: controller.signal },
          { data: [] }
        );
        if (ok) {
          setResults(data.data ?? []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.error(t("searchFailed"));
      } finally {
        setIsSearching(false);
      }
    },
    [assignmentId, t]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  async function handleInvite(username: string, userId: string) {
    setIsInviting(userId);
    try {
      const res = await apiFetch(`/api/v1/contests/${assignmentId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (res.ok) {
        setInvitedIds((prev) => new Set(prev).add(userId));
        toast.success(t("inviteSuccess"));
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error === "userNotFound" ? t("userNotFound") : t("inviteFailed"));
      }
    } catch {
      toast.error(t("inviteFailed"));
    } finally {
      setIsInviting(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        {isSearching && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("searching")}
          </div>
        )}
        {results.length > 0 && (
          <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
            {results.map((user) => {
              const isEnrolled = user.alreadyEnrolled || invitedIds.has(user.id);
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.name}{" "}
                      <span className="text-muted-foreground font-normal">
                        @{user.username}
                      </span>
                    </p>
                    {user.className && (
                      <p className="text-xs text-muted-foreground">{user.className}</p>
                    )}
                  </div>
                  {isEnrolled ? (
                    <Badge variant="secondary" className="shrink-0 gap-1">
                      <Check className="size-3" />
                      {user.alreadyEnrolled && !invitedIds.has(user.id)
                        ? t("alreadyEnrolled")
                        : t("invited")}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleInvite(user.username, user.id)}
                      disabled={isInviting === user.id}
                      className="shrink-0"
                    >
                      <UserPlus className="size-3.5" />
                      {t("invite")}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {query.trim() && !isSearching && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            {t("noResults")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
