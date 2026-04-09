import { db } from "@/lib/db";
import { auditEvents, loginEvents } from "@/lib/db/schema";
import { lt } from "drizzle-orm";

const RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS ?? "90", 10);

export async function cleanupOldEvents(): Promise<{
  auditDeleted: number;
  loginDeleted: number;
}> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const deletedAudit = await db
    .delete(auditEvents)
    .where(lt(auditEvents.createdAt, cutoff))
    .returning({ id: auditEvents.id });

  const deletedLogin = await db
    .delete(loginEvents)
    .where(lt(loginEvents.createdAt, cutoff))
    .returning({ id: loginEvents.id });

  return {
    auditDeleted: deletedAudit.length,
    loginDeleted: deletedLogin.length,
  };
}
