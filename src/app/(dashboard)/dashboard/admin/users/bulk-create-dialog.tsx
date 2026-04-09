"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Papa from "papaparse";

type ParsedRow = {
  username: string;
  name: string;
  password: string;
  email?: string;
  role?: string;
  className?: string;
};

type CreatedUser = {
  username: string;
  name: string;
};

type FailedUser = {
  username: string;
  reason: string;
};

function normalizeCsvHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const HEADER_ALIASES: Record<string, string> = {
  username: "username",
  userid: "username",
  id: "username",
  name: "name",
  fullname: "name",
  displayname: "name",
  password: "password",
  passwd: "password",
  pass: "password",
  email: "email",
  emailaddress: "email",
  role: "role",
  usertype: "role",
  type: "role",
  classname: "className",
  class: "className",
  group: "className",
  section: "className",
};

function mapHeaders(rawHeaders: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const raw of rawHeaders) {
    const normalized = normalizeCsvHeader(raw);
    const mapped = HEADER_ALIASES[normalized];
    if (mapped) {
      mapping[raw] = mapped;
    }
  }
  return mapping;
}

function normalizeRole(raw?: string): "student" | "instructor" {
  const lower = (raw ?? "").trim().toLowerCase();
  if (lower === "instructor" || lower === "teacher" || lower === "prof" || lower === "professor") {
    return "instructor";
  }
  return "student";
}

export default function BulkCreateDialog() {
  const t = useTranslations("admin.users");
  const tCommon = useTranslations("common");
  const roleLabels: Record<string, string> = {
    student: tCommon("roles.student"),
    instructor: tCommon("roles.instructor"),
    admin: tCommon("roles.admin"),
    super_admin: tCommon("roles.super_admin"),
  };
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<{ created: CreatedUser[]; failed: FailedUser[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setParsedRows([]);
    setParseError(null);
    setResults(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setParsedRows([]);
    setResults(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (!result.data || result.data.length === 0) {
          setParseError(t("bulkCsvEmpty"));
          return;
        }

        const rawHeaders = result.meta.fields ?? [];
        const headerMap = mapHeaders(rawHeaders);

        const rows: ParsedRow[] = [];
        const errors: string[] = [];

        for (let i = 0; i < result.data.length; i++) {
          const raw = result.data[i];
          const mapped: Record<string, string> = {};

          for (const [rawKey, mappedKey] of Object.entries(headerMap)) {
            const val = raw[rawKey];
            if (val !== undefined) {
              mapped[mappedKey] = val.trim();
            }
          }

          const username = mapped["username"] ?? "";
          const name = mapped["name"] ?? "";
          const password = mapped["password"] ?? "";

          if (!username || username.length < 2) {
            errors.push(t("bulkRowInvalidUsername", { row: i + 2 }));
            continue;
          }
          if (!name) {
            errors.push(t("bulkRowMissingName", { row: i + 2 }));
            continue;
          }
          if (!password) {
            errors.push(t("bulkRowMissingPassword", { row: i + 2 }));
            continue;
          }

          rows.push({
            username,
            name,
            password,
            email: mapped["email"] || undefined,
            role: normalizeRole(mapped["role"]),
            className: mapped["className"] || undefined,
          });
        }

        if (errors.length > 0) {
          setParseError(errors.slice(0, 5).join("; ") + (errors.length > 5 ? ` ${t("bulkMoreErrors", { count: errors.length - 5 })}` : ""));
        }

        if (rows.length > 200) {
          setParseError(t("bulkTooManyRows", { count: rows.length, max: 200 }));
          setParsedRows(rows.slice(0, 200));
          return;
        }

        setParsedRows(rows);
      },
      error: (err) => {
        setParseError(t("bulkCsvParseError", { message: err.message }));
      },
    });
  }

  async function handleSubmit() {
    if (parsedRows.length === 0) return;

    setIsLoading(true);
    try {
      const response = await apiFetch("/api/v1/users/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ users: parsedRows }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error ?? tCommon("error"));
        return;
      }

      setResults({ created: data.created ?? [], failed: data.failed ?? [] });
      router.refresh();
      toast.success(t("bulkCreateSuccess", { count: data.createdCount ?? 0 }));
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline">{t("bulkCreate")}</Button>} />
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        {results ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("bulkCreate")}</DialogTitle>
              <DialogDescription>
                {t("bulkCreateSuccess", { count: results.created.length })}
                {results.failed.length > 0 && ` ${t("bulkFailedSuffix", { count: results.failed.length })}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {results.created.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">{t("bulkCreatedUsersTitle", { count: results.created.length })}</p>
                  <div className="max-h-64 overflow-y-auto border rounded">
                    <Table>
                      <caption className="sr-only">{t("bulkCreatedUsersTitle", { count: results.created.length })}</caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("table.username")}</TableHead>
                          <TableHead>{t("table.name")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.created.map((u) => (
                          <TableRow key={u.username}>
                            <TableCell className="font-mono">{u.username}</TableCell>
                            <TableCell>{u.name}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              {results.failed.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 text-destructive" role="alert">{t("bulkFailedTitle", { count: results.failed.length })}</p>
                  <div className="max-h-32 overflow-y-auto border rounded border-destructive/30">
                    <Table>
                      <caption className="sr-only">{t("bulkFailedTitle", { count: results.failed.length })}</caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("table.username")}</TableHead>
                          <TableHead>{t("bulkReason")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.failed.map((u) => (
                          <TableRow key={u.username}>
                            <TableCell className="font-mono">{u.username}</TableCell>
                            <TableCell>{u.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {tCommon("done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("bulkCreate")}</DialogTitle>
              <DialogDescription>
                {t("uploadCsv")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-sm font-medium" htmlFor="bulk-csv-input">
                  {t("uploadCsv")}
                </label>
                <input
                  id="bulk-csv-input"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded file:border file:border-input file:text-sm file:font-medium file:bg-background file:text-foreground hover:file:bg-accent cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  {t("bulkCsvHint")}
                </p>
              </div>
              {parseError && (
                <p className="text-sm text-destructive" role="alert">{parseError}</p>
              )}
              {parsedRows.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">{t("csvPreview")} {t("csvPreviewCount", { count: parsedRows.length })}</p>
                  <div className="max-h-64 overflow-y-auto border rounded">
                    <Table>
                      <caption className="sr-only">{t("csvPreview")}</caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("table.username")}</TableHead>
                          <TableHead>{t("table.name")}</TableHead>
                          <TableHead>{t("table.email")}</TableHead>
                          <TableHead>{t("table.role")}</TableHead>
                          <TableHead>{tCommon("class")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedRows.slice(0, 50).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono">{row.username}</TableCell>
                            <TableCell>{row.name}</TableCell>
                            <TableCell>{row.email || "-"}</TableCell>
                            <TableCell>{roleLabels[row.role || "student"] ?? row.role}</TableCell>
                            <TableCell>{row.className || "-"}</TableCell>
                          </TableRow>
                        ))}
                        {parsedRows.length > 50 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                              {t("bulkMoreRows", { count: parsedRows.length - 50 })}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || parsedRows.length === 0}
              >
                {isLoading ? tCommon("loading") : tCommon("create")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
