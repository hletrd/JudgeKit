"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProblemSubmissionForm } from "@/components/problem/problem-submission-form";

type SubmissionLanguage = {
  id: string;
  language: string;
  displayName: string;
  standard: string | null;
};

type PublicQuickSubmitProps = {
  editorTheme?: string | null;
  languages: SubmissionLanguage[];
  preferredLanguage?: string | null;
  problemDefaultLanguage?: string | null;
  problemId: string;
  problemTitle: string;
  siteDefaultLanguage?: string | null;
  userId: string;
  layout?: "dialog" | "inline";
};

export function PublicQuickSubmit({
  editorTheme = null,
  languages,
  preferredLanguage = null,
  problemDefaultLanguage = null,
  problemId,
  problemTitle,
  siteDefaultLanguage = null,
  userId,
  layout = "dialog",
}: PublicQuickSubmitProps) {
  const router = useRouter();
  const tProblems = useTranslations("problems");
  const tPractice = useTranslations("publicShell.practice");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const form = (
    <ProblemSubmissionForm
      userId={userId}
      problemId={problemId}
      languages={languages}
      preferredLanguage={preferredLanguage}
      problemDefaultLanguage={problemDefaultLanguage}
      siteDefaultLanguage={siteDefaultLanguage}
      editorTheme={editorTheme}
      onSubmitted={(submissionId) => {
        setOpen(false);
        router.push(`/submissions/${submissionId}?from=problem`);
      }}
    />
  );

  if (layout === "inline") {
    return form;
  }

  const trigger = (
    <Button type="button" onClick={() => setOpen(true)}>
      {tProblems("submitSolution")}
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{tProblems("submitSolution")}</SheetTitle>
              <SheetDescription>
                {tPractice("quickSubmitDescription", { title: problemTitle })}
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">{form}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tProblems("submitSolution")}</DialogTitle>
            <DialogDescription>
              {tPractice("quickSubmitDescription", { title: problemTitle })}
            </DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
    </>
  );
}
