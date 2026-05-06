import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { PlatformMode } from "@/types";

type PlatformModeBadgeProps = {
  platformMode: PlatformMode;
};

/**
 * Compact badge surfacing the effective platform mode in the dashboard
 * chrome. Replaces the cycle-1-deferred sidebar badge — admins now see
 * the platform mode at a glance from any admin page without depending on
 * a sidebar that no longer exists.
 *
 * "homework" is the default operational mode and is rendered as a
 * neutral outline badge; the higher-stakes modes (exam, contest,
 * recruiting) use the secondary variant for higher visual weight.
 */
export async function PlatformModeBadge({ platformMode }: PlatformModeBadgeProps) {
  const tCommon = await getTranslations("common");
  const label = tCommon(`platformModes.${platformMode}`);
  const variant = platformMode === "homework" ? "outline" : "secondary";

  return (
    <Badge variant={variant} aria-label={label}>
      {label}
    </Badge>
  );
}
