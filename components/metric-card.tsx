"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  borderColor?: string;
  iconColor?: string;
  subtitleColor?: string;
  loading?: boolean;
}

export function MetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  borderColor = "border-l-primary",
  iconColor = "text-primary/40",
  subtitleColor = "text-primary",
  loading = false,
}: MetricCardProps) {
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-14 my-0.5" />
            ) : (
              <p className="text-xl sm:text-3xl font-bold">{value}</p>
            )}
            {subtitle && (
              <p className={`text-xs mt-1 ${loading ? "invisible" : subtitleColor}`}>{subtitle}</p>
            )}
          </div>
          <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${iconColor}`} />
        </div>
      </CardContent>
    </Card>
  );
}
