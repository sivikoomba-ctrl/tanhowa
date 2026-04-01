"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface SectionErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function SectionError({ message = "Failed to load this section", onRetry }: SectionErrorProps) {
  return (
    <Card className="border-destructive/20">
      <CardContent className="pt-4">
        <div className="flex items-center gap-3 text-destructive/80">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{message}</p>
          {onRetry && (
            <Button variant="ghost" size="sm" onClick={onRetry} className="ml-auto shrink-0 text-xs">
              <RefreshCw size={12} className="mr-1" /> Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
