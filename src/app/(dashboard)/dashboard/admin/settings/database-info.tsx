"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface DbInfo {
  path: string;
  sizeBytes: number;
  walSizeBytes: number;
  journalMode: string;
  foreignKeys: boolean;
  busyTimeout: number;
  tableCount: number;
  pageSize: number;
  pageCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DatabaseInfo({ dbInfo }: { dbInfo: DbInfo }) {
  const t = useTranslations("admin.settings");

  const rows = [
    { label: t("dbPath"), value: dbInfo.path },
    { label: t("dbSize"), value: formatBytes(dbInfo.sizeBytes) },
    { label: t("dbWalSize"), value: formatBytes(dbInfo.walSizeBytes) },
    { label: t("dbJournalMode"), value: dbInfo.journalMode.toUpperCase() },
    { label: t("dbPageSize"), value: `${dbInfo.pageSize} B` },
    { label: t("dbPageCount"), value: dbInfo.pageCount.toLocaleString() },
    { label: t("dbTableCount"), value: dbInfo.tableCount.toString() },
    { label: t("dbBusyTimeout"), value: `${dbInfo.busyTimeout} ms` },
    { label: t("dbForeignKeys"), value: dbInfo.foreignKeys ? "ON" : "OFF" },
  ];

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between py-2 border-b last:border-0">
          <span className="text-sm text-muted-foreground">{row.label}</span>
          <span className="text-sm font-mono">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
