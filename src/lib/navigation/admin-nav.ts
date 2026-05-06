/**
 * Single source of truth for admin-area navigation.
 *
 * Consumed by:
 * - `src/app/(dashboard)/dashboard/admin/page.tsx` — admin landing card grid.
 * - `src/app/(public)/dashboard/_components/admin-dashboard.tsx` — quick
 *   shortcuts on the user dashboard.
 *
 * Adding a new admin section is a single edit here; both surfaces pick it up
 * automatically. Capability strings must match what `lib/capabilities/cache`
 * exposes; titleKey/descriptionKey must exist under the `nav` and
 * `admin.index` translation namespaces respectively.
 */
import type { ComponentType, SVGProps } from "react";
import {
  Blocks,
  Code,
  FileCode,
  History,
  KeyRound,
  LogIn,
  MessageCircle,
  MessageCircleWarning,
  Server,
  Settings,
  Shield,
  Tags,
  Upload,
} from "lucide-react";

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type AdminNavItem = {
  href: string;
  /** key under the `nav` translation namespace */
  titleKey: string;
  /** key under the `admin.index` translation namespace */
  descriptionKey: string;
  capability: string;
  icon: LucideIcon;
};

export type AdminNavGroup = {
  /** key under the `nav` translation namespace */
  labelKey: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    labelKey: "usersAndLogs",
    items: [
      { href: "/dashboard/admin/users", titleKey: "userManagement", descriptionKey: "userManagementDesc", icon: Shield, capability: "users.view" },
      { href: "/dashboard/admin/roles", titleKey: "roleManagement", descriptionKey: "roleManagementDesc", icon: KeyRound, capability: "users.manage_roles" },
      { href: "/dashboard/admin/submissions", titleKey: "allSubmissions", descriptionKey: "allSubmissionsDesc", icon: FileCode, capability: "submissions.view_all" },
      { href: "/dashboard/admin/audit-logs", titleKey: "auditLogs", descriptionKey: "auditLogsDesc", icon: History, capability: "system.audit_logs" },
      { href: "/dashboard/admin/login-logs", titleKey: "loginLogs", descriptionKey: "loginLogsDesc", icon: LogIn, capability: "system.login_logs" },
      { href: "/dashboard/admin/plugins/chat-logs", titleKey: "chatLogs", descriptionKey: "chatLogsDesc", icon: MessageCircle, capability: "system.chat_logs" },
      { href: "/dashboard/admin/discussions", titleKey: "discussionModeration", descriptionKey: "discussionModerationDesc", icon: MessageCircleWarning, capability: "community.moderate" },
    ],
  },
  {
    labelKey: "system",
    items: [
      { href: "/dashboard/admin/workers", titleKey: "judgeWorkers", descriptionKey: "judgeWorkersDesc", icon: Server, capability: "system.settings" },
      { href: "/dashboard/admin/languages", titleKey: "languages", descriptionKey: "languagesDesc", icon: Code, capability: "system.settings" },
      { href: "/dashboard/admin/settings", titleKey: "systemSettings", descriptionKey: "systemSettingsDesc", icon: Settings, capability: "system.settings" },
      { href: "/dashboard/admin/files", titleKey: "fileManagement", descriptionKey: "fileManagementDesc", icon: Upload, capability: "files.manage" },
      { href: "/dashboard/admin/api-keys", titleKey: "apiKeys", descriptionKey: "apiKeysDesc", icon: KeyRound, capability: "system.settings" },
      { href: "/dashboard/admin/tags", titleKey: "tagManagement", descriptionKey: "tagManagementDesc", icon: Tags, capability: "system.settings" },
      { href: "/dashboard/admin/plugins", titleKey: "plugins", descriptionKey: "pluginsDesc", icon: Blocks, capability: "system.plugins" },
    ],
  },
];

/**
 * Flatten ADMIN_NAV_GROUPS for consumers that don't care about grouping
 * (e.g. dashboard quick shortcuts).
 */
export function flattenAdminNav(): AdminNavItem[] {
  return ADMIN_NAV_GROUPS.flatMap((group) => group.items);
}

/**
 * Look up an admin nav item by href. Returns undefined if not found.
 * Useful for the dashboard quick-shortcuts surface, which curates a small
 * subset of high-frequency admin entries by href.
 */
export function findAdminNavItem(href: string): AdminNavItem | undefined {
  return flattenAdminNav().find((item) => item.href === href);
}
