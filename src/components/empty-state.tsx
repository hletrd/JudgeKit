import type { ElementType } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: ElementType;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12">
        <Icon className="size-10 text-muted-foreground" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">{title}</p>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && (
          <Button
            variant="outline"
            size="sm"
            onClick={action.onClick}
            {...(action.href ? { asChild: true } : {})}
          >
            {action.href ? (
              <a href={action.href}>{action.label}</a>
            ) : (
              action.label
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
