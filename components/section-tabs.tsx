"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Shared section-tabs pattern — thin wrapper over shadcn Tabs.
 *
 * Goals vs. the raw shadcn tabs + the historical custom button-rows:
 *  1. Horizontal scroll on narrow screens instead of wrapping to 2-3 lines.
 *     CSS-only fade gradients on the left/right edges hint that more tabs
 *     exist off-screen without needing a JS scroll-position observer.
 *  2. Consistent inline count-pill ({ count }) instead of the inconsistent
 *     "(3)", colored Badges, and muted numbers scattered across pages.
 *  3. Real aria-label on the tablist, which shadcn leaves as the generic
 *     "tablist" otherwise.
 *  4. Tab icons treated as decorative (aria-hidden) so screen readers
 *     don't announce "GitBranch Sub-tasks 3".
 *
 * The shape deliberately mirrors shadcn's Tabs* primitives so the ~18
 * existing pages already using them can migrate with a one-line
 * replacement.
 */

export interface SectionTabItem {
  value: string;
  label: string;
  /** Optional decorative icon (lucide-react). Rendered aria-hidden. */
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  /** Optional count pill. Hidden when undefined or 0. */
  count?: number;
  disabled?: boolean;
}

interface SectionTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  tabs: SectionTabItem[];
  /** Accessible name for the tablist; announced by screen readers. */
  "aria-label": string;
  className?: string;
  children?: React.ReactNode;
}

export function SectionTabs({
  value,
  onValueChange,
  tabs,
  className,
  children,
  ...props
}: SectionTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      {/*
        The scroll container uses `overflow-x-auto` + `scroll-smooth` so the
        tablist glides when a tab off-screen is activated by keyboard. The
        two absolutely-positioned gradients fade the left/right edges —
        cheap visual affordance that more content exists, no JS needed.
      */}
      <div className="relative -mx-1">
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-background to-transparent z-10 sm:hidden"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-background to-transparent z-10 sm:hidden"
          aria-hidden="true"
        />
        <div className="overflow-x-auto scroll-smooth scrollbar-none px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList
            variant="line"
            aria-label={props["aria-label"]}
            className="w-max min-w-full flex gap-1"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const hasCount = typeof tab.count === "number" && tab.count > 0;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  disabled={tab.disabled}
                  className="flex items-center gap-1.5 px-3 shrink-0"
                >
                  {Icon && <Icon size={14} aria-hidden="true" className="shrink-0" />}
                  <span>{tab.label}</span>
                  {hasCount && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-medium leading-4 min-w-[1.25rem] transition-colors",
                        value === tab.value
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                      aria-label={`${tab.count} ${tab.label.toLowerCase()}`}
                    >
                      {tab.count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </div>
      {children}
    </Tabs>
  );
}

export { TabsContent as SectionTabsContent };
