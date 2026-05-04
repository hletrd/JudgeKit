"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSIGNMENT_PARTICIPANT_STATUS_VALUES,
  type AssignmentParticipantStatus,
} from "@/lib/assignments/participant-status";

const STATUS_FILTER_VALUES = ["all", ...ASSIGNMENT_PARTICIPANT_STATUS_VALUES] as const;

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
  statusLabels: Record<AssignmentParticipantStatus, string>;
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
  const [statusValue, setStatusValue] = useState<StatusFilterValue>(currentStatusFilter);

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
            <input type="hidden" name="status" value={statusValue} data-testid="assignment-status-filter" />
            <Select value={statusValue} onValueChange={(v) => { if (v) setStatusValue(v as StatusFilterValue); }}>
              <SelectTrigger id="status-filter" className="h-10 min-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" label={labels.allStatuses}>{labels.allStatuses}</SelectItem>
                {STATUS_FILTER_VALUES.filter((value) => value !== "all").map((value) => (
                  <SelectItem key={value} value={value} label={statusLabels[value]}>
                    {statusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 items-end">
            <Button type="submit" className="h-10">{labels.applyFilter}</Button>
            <Link href={resetHref ?? `/dashboard/groups/${groupId}/assignments/${assignmentId}`}>
              <Button type="button" variant="outline" className="h-10">
                {labels.resetFilter}
              </Button>
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
