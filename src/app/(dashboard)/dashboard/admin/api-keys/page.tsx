import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";
import { canManageRoleAsync } from "@/lib/security/constants";
import { ApiKeysClient } from "./api-keys-client";

export default async function AdminApiKeysPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.settings")) redirect("/dashboard");

  const availableRoles = await db
    .select({ name: roles.name, displayName: roles.displayName, level: roles.level })
    .from(roles)
    .orderBy(roles.level, roles.name);
  const roleOptions = (
    await Promise.all(
      availableRoles.map(async (role) =>
        role.name === session.user.role || await canManageRoleAsync(session.user.role, role.name)
          ? role
          : null
      )
    )
  ).filter((role): role is { name: string; displayName: string; level: number } => Boolean(role));

  return (
    <ApiKeysClient roleOptions={roleOptions} />
  );
}
