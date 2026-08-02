"use client";

import { GamificationPanel } from "@/components/gamification-panel";
import { RewardsCatalog } from "@/components/rewards-catalog";
import { Separator } from "@/components/ui/separator";

export default function RewardsPage() {
  return (
    <div className="space-y-8">
      <GamificationPanel />
      <Separator />
      <RewardsCatalog />
    </div>
  );
}
