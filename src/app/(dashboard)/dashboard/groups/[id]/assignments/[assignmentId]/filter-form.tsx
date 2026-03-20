"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_FILTER_VALUES = [
  "all",
  "not_submitted",
  "pending",
  "queued",
  "judging",
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
] as const;

type StatusFilterValue = (typeof STATUS_FILTER_VALUES)[number];

export interface FilterFormLabels {
  filtersTitle: string;
  studentSearch: string;
  studentSearchPlaceholder: string;
  status: string;
  allStatuses: string;
  applyFilter: string;
  resetFilter: string;
}

export interface FilterFormProps {
  groupId: string;
  assignmentId: string;
  currentStatusFilter: StatusFilterValue;
  currentStudentQuery: string;
  statusLabels: Record<Exclude<StatusFilterValue, "all">, string>;
  labels: FilterFormLabels;
  /** Override the reset link target. Defaults to the group assignment detail page. */
  resetHref?: string;
}

export function FilterForm({
  groupId,
  assignmentId,
  currentStatusFilter,
  currentStudentQuery,
  statusLabels,
  labels,
  resetHref,
}: FilterFormProps) {
  return (
    <Card>
      <CardContent>
        <form className="flex flex-col gap-4 md:flex-row md:items-end" method="get">
          <div className="flex-1 space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="student-search">
              {labels.studentSearch}
            </label>
            <input
              id="student-search"
              name="student"
              defaultValue={currentStudentQuery}
              placeholder={labels.studentSearchPlaceholder}
              data-testid="assignment-student-search"
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              type="search"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="status-filter">
              {labels.status}
            </label>
            <select
              id="status-filter"
              name="status"
              defaultValue={currentStatusFilter}
              data-testid="assignment-status-filter"
              className="flex h-10 min-w-48 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="all">{labels.allStatuses}</option>
              {STATUS_FILTER_VALUES.filter((value) => value !== "all").map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 items-end">
            <Button type="submit">{labels.applyFilter}</Button>
            <Link href={resetHref ?? `/dashboard/groups/${groupId}/assignments/${assignmentId}`}>
              <Button type="button" variant="outline">
                {labels.resetFilter}
              </Button>
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
