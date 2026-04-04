"use client";

import { useTranslations } from "next-intl";

interface DbInfo {
  dialect: "postgresql";
  path: string;
  sizeBytes: number;
  version: string;
  tableCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function DatabaseInfo({ dbInfo }: { dbInfo: DbInfo }) {
  const t = useTranslations("admin.settings");

  const rows = [
    { label: t("dbDialect"), value: "PostgreSQL" },
    { label: t("dbPath"), value: dbInfo.path },
    { label: t("dbSize"), value: formatBytes(dbInfo.sizeBytes) },
    { label: t("dbVersion"), value: dbInfo.version },
    { label: t("dbTableCount"), value: dbInfo.tableCount.toString() },
  ];

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between py-2 border-b last:border-0">
          <span className="text-sm text-muted-foreground">{row.label}</span>
          <span className="text-sm font-mono truncate max-w-[60%] text-right" title={row.value}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
