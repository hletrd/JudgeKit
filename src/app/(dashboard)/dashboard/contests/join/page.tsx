import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { ContestJoinClient } from "./contest-join-client";

export default async function ContestJoinPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { isRecruitingCandidate } = await getRecruitingAccessContext(session.user.id);
  if (isRecruitingCandidate) {
    redirect("/dashboard/contests");
  }

  return <ContestJoinClient />;
}
