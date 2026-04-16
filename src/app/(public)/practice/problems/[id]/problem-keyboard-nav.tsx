"use client";

import { useRouter } from "next/navigation";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

type ProblemKeyboardNavProps = {
  prevProblemId: string | null;
  nextProblemId: string | null;
  locale: string;
};

export function ProblemKeyboardNav({ prevProblemId, nextProblemId, locale }: ProblemKeyboardNavProps) {
  const router = useRouter();

  useKeyboardShortcuts({
    n: () => nextProblemId && router.push(`/${locale}/practice/problems/${nextProblemId}`),
    p: () => prevProblemId && router.push(`/${locale}/practice/problems/${prevProblemId}`),
  });

  return null;
}
