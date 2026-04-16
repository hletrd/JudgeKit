import { Badge } from "@/components/ui/badge";
import type { Tier } from "@/lib/ratings";
import { TIER_COLORS } from "@/lib/ratings";

type TierBadgeProps = {
  tier: Tier;
  label: string;
};

export function TierBadge({ tier, label }: TierBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`text-xs font-semibold ${TIER_COLORS[tier]}`}
    >
      {label}
    </Badge>
  );
}
