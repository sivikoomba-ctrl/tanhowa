import { getServiceClient } from "@/lib/supabase";

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji for simplicity
  check: (stats: UserStats) => boolean;
}

export interface UserStats {
  contributionMinutes: number;
  actionCount: number;
  uniqueActionTypes: number;
  tasksCompleted: number;
  subscriptionsPaid: number;
  totalSubscriptions: number;
  grievancesSubmitted: number;
  ideasSubmitted: number;
  eventsRsvp: number;
  loginCount: number;
  daysSinceJoined: number;
}

export const BADGES: BadgeDefinition[] = [
  { id: "century", name: "Century", description: "100+ contribution minutes", icon: "\u{1F4AF}", check: (s) => s.contributionMinutes >= 100 },
  { id: "half_century", name: "Half Century", description: "50+ contribution minutes", icon: "\u{1F3CF}", check: (s) => s.contributionMinutes >= 50 },
  { id: "all_rounder", name: "All-Rounder", description: "Actions across 5+ categories", icon: "\u{1F31F}", check: (s) => s.uniqueActionTypes >= 5 },
  { id: "task_master", name: "Task Master", description: "10+ tasks completed", icon: "\u{2705}", check: (s) => s.tasksCompleted >= 10 },
  { id: "task_starter", name: "Task Starter", description: "Completed first task", icon: "\u{1F3AF}", check: (s) => s.tasksCompleted >= 1 },
  { id: "payment_champion", name: "Payment Champion", description: "All subscriptions paid on time", icon: "\u{1F4B0}", check: (s) => s.totalSubscriptions > 0 && s.subscriptionsPaid === s.totalSubscriptions },
  { id: "voice_of_change", name: "Voice of Change", description: "5+ suggestions or grievances", icon: "\u{1F4E2}", check: (s) => s.grievancesSubmitted >= 5 },
  { id: "idea_factory", name: "Idea Factory", description: "3+ wishlist ideas submitted", icon: "\u{1F4A1}", check: (s) => s.ideasSubmitted >= 3 },
  { id: "social_butterfly", name: "Social Butterfly", description: "RSVP to 5+ events", icon: "\u{1F98B}", check: (s) => s.eventsRsvp >= 5 },
  { id: "loyal_member", name: "Loyal Member", description: "Active for 6+ months", icon: "\u{1F3C6}", check: (s) => s.daysSinceJoined >= 180 },
  { id: "pioneer", name: "Pioneer", description: "Active for 1+ year", icon: "\u{1F680}", check: (s) => s.daysSinceJoined >= 365 },
  { id: "regular", name: "Regular", description: "50+ logins", icon: "\u{1F511}", check: (s) => s.loginCount >= 50 },
  { id: "dedicated", name: "Dedicated", description: "200+ contribution minutes", icon: "\u{1F396}\u{FE0F}", check: (s) => s.contributionMinutes >= 200 },
];

export function getBadgeById(id: string): BadgeDefinition | undefined {
  return BADGES.find(b => b.id === id);
}

/** Check and award new badges for a user. Returns newly earned badges. */
export async function checkAndAwardBadges(userId: string, stats: UserStats): Promise<string[]> {
  const supabase = getServiceClient();

  // Get already earned badges
  const { data: existing } = await supabase
    .from("achievements")
    .select("badge")
    .eq("user_id", userId);

  const earnedSet = new Set((existing || []).map((a: { badge: string }) => a.badge));
  const newBadges: string[] = [];

  for (const badge of BADGES) {
    if (!earnedSet.has(badge.id) && badge.check(stats)) {
      newBadges.push(badge.id);
    }
  }

  if (newBadges.length > 0) {
    await supabase.from("achievements").insert(
      newBadges.map(badge => ({ user_id: userId, badge }))
    );
  }

  return newBadges;
}
