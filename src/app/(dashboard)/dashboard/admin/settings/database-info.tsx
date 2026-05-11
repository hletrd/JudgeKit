"use client";

import { useTranslations, useLocale } from "next-intl";
import { formatBytes } from "@/lib/formatting";

interface DbInfo {
  dialect: "postgresql";
  sizeBytes: number;
  version: string;
  tableCount: number;
}

export function DatabaseInfo({ dbInfo }: { dbInfo: DbInfo }) {
  const t = useTranslations("admin.settings");
  const locale = useLocale();

  const rows = [
    { label: t("dbDialect"), value: "PostgreSQL" },
    { label: t("dbSize"), value: formatBytes(dbInfo.sizeBytes, locale) },
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
