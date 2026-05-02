"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Flower2,
  Home,
  User,
  Users,
  Megaphone,
  Calendar,
  FileText,
  MessageSquareWarning,
  Lightbulb,
  TicketCheck,
  Receipt,
  Wallet,
  FileSignature,
  LogOut,
  Menu,
  X,
  Shield,
  AlertCircle,
  UsersRound,
  ListTodo,
  Crown,
  Vote,
  Award,
  Bell,
  ShieldCheck,
  Navigation,
  BarChart3,
  ChevronDown,
  MessageCircle,
  Landmark,
  Sparkles,
  UtensilsCrossed,
  HelpCircle,
  IndianRupee,
  GraduationCap,
  Activity,
  MessageSquarePlus,
  MessagesSquare,
  Trophy,
  CalendarDays,
  History as HistoryIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { SettingsPopover } from "@/components/settings-popover";
import { GlobalSearch } from "@/components/global-search";
import { PushManager } from "@/components/push-manager";
import { FeedbackWidget } from "@/components/feedback-widget";
import { ReEngagementModal } from "@/components/re-engagement-modal";

interface UserData {
  name: string;
  email: string;
  role: string;
  phone?: string;
  occupation?: string;
  official_type?: string | null;
  photo_url?: string;
  dob?: string;
  address?: string;
  office_address?: string;
  last_active_at?: string | null;
  posting_details?: {
    regular_district?: string;
    regular_block?: string;
  };
  social_links?: {
    gender?: string;
    qualification?: string;
    date_of_joining?: string;
  };
}

const TITLE_PREFIXES = ["MR.", "MRS.", "MISS.", "DR."];

function hasTitle(name: string): boolean {
  const upper = (name || "").trim().toUpperCase();
  return TITLE_PREFIXES.some((t) => upper.startsWith(t));
}

const navItems = [
  { href: "/dashboard", labelKey: "nav.overview" as const, icon: Home },
  { href: "/dashboard/profile", labelKey: "nav.profile" as const, icon: User },
  { href: "/dashboard/members", labelKey: "nav.members" as const, icon: Users },
  { href: "/dashboard/officials", labelKey: "nav.officials" as const, icon: Crown },
  { href: "/dashboard/teams", labelKey: "nav.teams" as const, icon: UsersRound },
  { href: "/dashboard/messages", labelKey: "nav.messages" as const, icon: MessageSquarePlus },
  { href: "/dashboard/group-chat", labelKey: "nav.group_chat" as const, icon: MessagesSquare },
  { href: "/dashboard/announcements", labelKey: "nav.announcements" as const, icon: Megaphone },
  { href: "/dashboard/events", labelKey: "nav.events" as const, icon: Calendar },
  { href: "/dashboard/calendar", labelKey: "nav.calendar" as const, icon: CalendarDays },
  { href: "/dashboard/resolutions", labelKey: "nav.resolutions" as const, icon: Vote },
  { href: "/dashboard/polls", labelKey: "nav.polls" as const, icon: BarChart3 },
  { href: "/dashboard/logo-vote", labelKey: "nav.logo_vote" as const, icon: Flower2 },
  { href: "/dashboard/documents", labelKey: "nav.documents" as const, icon: FileText },
  { href: "/dashboard/subscriptions", labelKey: "nav.subscriptions" as const, icon: Wallet },
  { href: "/dashboard/payment-status", labelKey: "nav.payment_status" as const, icon: IndianRupee },
  { href: "/dashboard/vouchers", labelKey: "nav.vouchers" as const, icon: Receipt, officialOnly: true },
  { href: "/dashboard/letters", labelKey: "nav.letters" as const, icon: FileSignature, superAdminOnly: true },
  { href: "/dashboard/nearby", labelKey: "nav.nearby" as const, icon: Navigation },
  { href: "/dashboard/todos", labelKey: "nav.todos" as const, icon: ListTodo },
  { href: "/dashboard/activity", labelKey: "nav.my_activity" as const, icon: Activity },
  { href: "/dashboard/achievements", labelKey: "nav.achievements" as const, icon: Trophy },
  { href: "/dashboard/contributions", labelKey: "nav.contributions" as const, icon: Award },
  { href: "/dashboard/finance", labelKey: "nav.finance" as const, icon: Landmark },
  { href: "/dashboard/wishlist", labelKey: "nav.wishlist" as const, icon: Lightbulb },
  { href: "/dashboard/trainings", labelKey: "nav.trainings" as const, icon: GraduationCap },
  { href: "/dashboard/ai-tools", labelKey: "nav.ai_tools" as const, icon: Sparkles },
  { href: "/dashboard/faq", labelKey: "nav.faq" as const, icon: HelpCircle },
  { href: "/dashboard/history", labelKey: "nav.history" as const, icon: HistoryIcon },
  { href: "/dashboard/food-orders", labelKey: "nav.food_orders" as const, icon: UtensilsCrossed, superAdminOnly: true },
];

function getMissingFields(u: UserData): string[] {
  const missing: string[] = [];
  const nameParts = (u.name || "").trim().split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) missing.push("Last Name / Initial");
  if (!u.phone?.trim()) missing.push("Phone Number");
  if (!u.occupation?.trim()) missing.push("Designation");
  if (!u.posting_details?.regular_district) missing.push("District");
  if (!u.posting_details?.regular_block) missing.push("Block");
  if (!u.photo_url) missing.push("Profile Photo");
  if (!u.dob) missing.push("Date of Birth");
  if (!u.social_links?.gender) missing.push("Gender");
  if (!u.social_links?.qualification) missing.push("Qualification");
  if (!u.social_links?.date_of_joining) missing.push("Date of Joining");
  if (!u.address?.trim() && !u.office_address?.trim()) missing.push("Address");
  return missing;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState({ total: 0, announcements: 0, subscriptions: 0, tasks: 0, volunteerInvites: 0, draftAnnouncements: 0 });
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [locationEnabling, setLocationEnabling] = useState(false);
  const [showTitlePicker, setShowTitlePicker] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [showVolunteerInvite, setShowVolunteerInvite] = useState(false);
  const [isFinanceTeam, setIsFinanceTeam] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [volunteerInvite, setVolunteerInvite] = useState<{ id: string; district: string; inviterName: string } | null>(null);
  const [volunteerResponding, setVolunteerResponding] = useState(false);
  const [trainerInvites, setTrainerInvites] = useState<{ id: string; training: { title: string; date: string; location: string; mode: string }; inviter: { name: string } }[]>([]);
  const [showTrainerInvite, setShowTrainerInvite] = useState(false);
  const [trainerResponding, setTrainerResponding] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => {
        if (data.user) {
          if (data.user.status === "suspended") {
            router.push("/suspended");
            return;
          }
          if (data.user.status === "pending" && data.user.role !== "super_admin") {
            router.push("/pending");
            return;
          }
          // Redirect truly unnamed users (no name at all) back to onboarding
          if (!data.user.name && data.user.role !== "admin" && data.user.role !== "super_admin") {
            router.push("/onboarding");
            return;
          }
          // Auto-prefix title for members without one
          const gender = data.user.social_links?.gender;
          if (data.user.name && !hasTitle(data.user.name)) {
            if (gender === "Female") {
              // Female: ask for title choice
              setShowTitlePicker(true);
            } else {
              // Male or gender not set: default to "Mr."
              const updatedName = `Mr. ${data.user.name}`;
              data.user.name = updatedName;
              // Fire-and-forget save
              fetch("/api/users/me", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: updatedName }),
              }).catch(() => {});
            }
          }
          setUser(data.user);
          if (data.is_finance_team) setIsFinanceTeam(true);
          // Check for missing mandatory fields — block access until complete
          const missing = getMissingFields(data.user);
          if (missing.length > 0 && data.user.role !== "admin" && data.user.role !== "super_admin") {
            setMissingFields(missing);
            setShowIncomplete(true);
          } else {
            setShowIncomplete(false);
          }
        } else {
          router.push("/");
        }
      })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));

    // Fetch notification counts
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => { if (d.total !== undefined) setNotifications(d); })
      .catch(() => {});

    // Fetch unread message count
    fetch("/api/messages?unread_count=true")
      .then((r) => r.json())
      .then((d) => { if (d.count !== undefined) setUnreadMessages(d.count); })
      .catch(() => {});

    // Fetch pending trainer invites
    fetch("/api/trainings/invite")
      .then((r) => r.json())
      .then((d) => {
        if (d.invites?.length > 0) {
          setTrainerInvites(d.invites);
          setShowTrainerInvite(true);
        }
      })
      .catch(() => {});

    // Location: silently update if enabled, or prompt if never asked
    if (navigator.geolocation) {
      fetch("/api/users/me").then((r) => r.json()).then((d) => {
        if (d.user?.location_sharing) {
          // Already enabled — silently update
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              fetch("/api/location", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              }).catch(() => {});
            },
            () => {},
            { enableHighAccuracy: false, timeout: 10000 }
          );
        } else if (d.user?.location_sharing === false && !localStorage.getItem("location_prompt_dismissed")) {
          // Never enabled and not dismissed — show prompt
          setShowLocationPrompt(true);
        }
      }).catch(() => {});
    }
  }, [router]);

  // Poll notifications every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/notifications")
        .then((r) => r.json())
        .then((d) => { if (d.total !== undefined) setNotifications(d); })
        .catch(() => {});
      fetch("/api/messages?unread_count=true")
        .then((r) => r.json())
        .then((d) => { if (d.count !== undefined) setUnreadMessages(d.count); })
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch volunteer invite details when dialog opens
  useEffect(() => {
    if (!showVolunteerInvite) return;
    fetch("/api/volunteer-invites")
      .then((r) => r.json())
      .then((d) => {
        if (d.invite) {
          const inviterName = (d.invite.users as { name?: string } | null)?.name || "Admin";
          setVolunteerInvite({ id: d.invite.id, district: d.invite.district, inviterName });
        }
      })
      .catch(() => { setVolunteerInvite(null); });
  }, [showVolunteerInvite]);

  async function handleVolunteerResponse(action: "accept" | "decline") {
    setVolunteerResponding(true);
    try {
      const res = await fetch("/api/volunteer-invites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        const { toast } = await import("sonner");
        toast.success(data.message);
        setShowVolunteerInvite(false);
        setVolunteerInvite(null);
        // Refresh notifications
        fetch("/api/notifications").then((r) => r.json()).then((d) => { if (d.total !== undefined) setNotifications(d); }).catch(() => {});
        if (action === "accept") {
          // Reload to reflect new role
          window.location.reload();
        }
      }
    } catch { /* silent */ }
    setVolunteerResponding(false);
  }

  async function handleTrainerInviteResponse(inviteId: string, action: "accept" | "decline") {
    setTrainerResponding(true);
    try {
      const res = await fetch("/api/trainings/invite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: inviteId, action }),
      });
      const data = await res.json();
      if (res.ok) {
        const { toast } = await import("sonner");
        toast.success(data.message);
        setTrainerInvites((prev) => prev.filter((i) => i.id !== inviteId));
        if (trainerInvites.length <= 1) setShowTrainerInvite(false);
      }
    } catch { /* silent */ }
    setTrainerResponding(false);
  }

  async function handleTitleSelect(title: string) {
    if (!user?.name) return;
    setTitleSaving(true);
    const updatedName = `${title} ${user.name}`;
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: updatedName }),
      });
      if (res.ok) {
        setUser({ ...user, name: updatedName });
      }
    } catch { /* silent */ }
    setTitleSaving(false);
    setShowTitlePicker(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  const [feedbackOpen, setFeedbackOpen] = useState(
    pathname === "/dashboard/suggestions" || pathname === "/dashboard/grievances" || pathname === "/dashboard/service-requests"
  );

  const t = useT();

  function NavLinks({ onItemClick }: { onItemClick?: () => void }) {
    const feedbackItems = [
      { href: "/dashboard/suggestions", labelKey: "nav.suggestions" as const, icon: Lightbulb },
      { href: "/dashboard/service-requests", labelKey: "nav.service_requests" as const, icon: TicketCheck },
      { href: "/dashboard/grievances", labelKey: "nav.grievances" as const, icon: MessageSquareWarning },
    ];
    const isFeedbackActive = feedbackItems.some((i) => pathname === i.href);

    return (
      <>
        {navItems.filter((item) => {
          if ("superAdminOnly" in item && item.superAdminOnly && user?.role !== "super_admin") return false;
          if ("officialOnly" in item && item.officialOnly && !(user?.official_type === "state" || user?.official_type === "district" || user?.role === "admin" || user?.role === "super_admin")) return false;
          return true;
        }).map((item) => {
          const isActive = pathname === item.href;
          // Insert Feedback group after Document Vault
          if (item.href === "/dashboard/subscriptions") {
            return (
              <div key="feedback-group">
                {/* Feedback collapsible */}
                <button
                  onClick={() => setFeedbackOpen(!feedbackOpen)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isFeedbackActive && !feedbackOpen
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <MessageCircle size={18} />
                  <span className="flex-1 text-left">{t("nav.feedback")}</span>
                  <ChevronDown size={14} className={`transition-transform ${feedbackOpen ? "rotate-180" : ""}`} />
                </button>
                {feedbackOpen && (
                  <div className="ml-4 space-y-0.5 mt-0.5">
                    {feedbackItems.map((fi) => (
                      <Link
                        key={fi.href}
                        href={fi.href}
                        onClick={onItemClick}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          pathname === fi.href
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        }`}
                      >
                        <fi.icon size={16} />
                        {t(fi.labelKey)}
                      </Link>
                    ))}
                  </div>
                )}
                {/* Subscriptions (the current item) */}
                <Link
                  href={item.href}
                  onClick={onItemClick}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <item.icon size={18} />
                  {t(item.labelKey)}
                </Link>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <item.icon size={18} />
              <span className="flex-1">{t(item.labelKey)}</span>
              {item.href === "/dashboard/messages" && unreadMessages > 0 && (
                <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {unreadMessages > 99 ? "99+" : unreadMessages}
                </span>
              )}
            </Link>
          );
        })}
        {(user?.role === "admin" || user?.role === "super_admin" || isFinanceTeam) && (
          <Link
            href="/admin"
            onClick={onItemClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-primary hover:bg-sidebar-accent/50 transition-colors"
          >
            <Shield size={18} />
            {t("nav.admin_panel")}
          </Link>
        )}
      </>
    );
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col h-screen sticky top-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Flower2 className="w-7 h-7 text-sidebar-primary" />
              <span className="text-lg font-bold text-sidebar-foreground">TANHOWA</span>
            </Link>
            <button className="relative p-1.5 rounded-lg hover:bg-sidebar-accent/50 transition-colors" onClick={() => setShowNotifications(true)} aria-label="Notifications">
              <Bell size={16} className="text-sidebar-foreground/70" />
              {notifications.total > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
                  {notifications.total > 99 ? "99+" : notifications.total}
                </span>
              )}
            </button>
          </div>
          {user?.name && (
            <p className="mt-1.5 text-xs text-sidebar-foreground/60 truncate">{user.name}</p>
          )}
        </div>

        <div className="px-3 pt-2">
          <GlobalSearch />
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <NavLinks />
        </nav>

        <div className="shrink-0 p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
            </div>
          </div>
          <SettingsPopover />
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          >
            <LogOut size={16} />
            {t("common.logout")}
          </Button>
        </div>
      </aside>

      {/* Mobile Header + Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Flower2 className="w-6 h-6 text-primary" />
            <span className="font-bold text-primary">TANHOWA</span>
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="relative" onClick={() => setShowNotifications(true)} aria-label="Notifications">
              <Bell size={18} />
              {notifications.total > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {notifications.total > 99 ? "99+" : notifications.total}
                </span>
              )}
            </Button>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu">
                  {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                </Button>
              </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground p-0 flex flex-col h-full">
              <div className="shrink-0 p-4 border-b border-sidebar-border">
                <div className="flex items-center gap-2">
                  <Flower2 className="w-7 h-7 text-sidebar-primary" />
                  <span className="text-lg font-bold">TANHOWA</span>
                </div>
                {user?.name && (
                  <p className="mt-1.5 text-xs text-sidebar-foreground/60 truncate">{user.name}</p>
                )}
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1 pb-16">
                <NavLinks onItemClick={() => setMobileOpen(false)} />
              </nav>
              <div className="shrink-0 p-3 border-t border-sidebar-border space-y-1">
                <SettingsPopover />
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full justify-start gap-2 text-sidebar-foreground/70"
                >
                  <LogOut size={16} />
                  {t("common.logout")}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 bg-background overflow-x-hidden overflow-y-auto relative">
          <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.03] pointer-events-none" />
          {/* Location sharing prompt */}
          {showLocationPrompt && (
            <div className="relative z-20 mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">{t("location.title")}</p>
                <p className="text-xs text-blue-600 mt-0.5">{t("location.desc")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-xs h-8"
                  disabled={locationEnabling}
                  onClick={() => {
                    if (!navigator.geolocation) return;
                    setLocationEnabling(true);
                    navigator.geolocation.getCurrentPosition(
                      async (pos) => {
                        await fetch("/api/location", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sharing: true }) });
                        await fetch("/api/location", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }) });
                        setShowLocationPrompt(false);
                        setLocationEnabling(false);
                      },
                      () => {
                        setShowLocationPrompt(false);
                        localStorage.setItem("location_prompt_dismissed", "1");
                        setLocationEnabling(false);
                      },
                      { enableHighAccuracy: true, timeout: 15000 }
                    );
                  }}
                >
                  {locationEnabling ? t("location.enabling") : t("common.enable")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-8 text-blue-600"
                  onClick={() => {
                    setShowLocationPrompt(false);
                    localStorage.setItem("location_prompt_dismissed", "1");
                  }}
                >
                  {t("common.not_now")}
                </Button>
              </div>
            </div>
          )}
          {/* Mandatory profile completion banner on profile page */}
          {showIncomplete && pathname === "/dashboard/profile" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 mb-4 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">{t("profile.mandatory_banner")}</p>
                <p className="text-xs text-amber-700 mt-1">Missing: {missingFields.join(", ")}</p>
              </div>
            </div>
          )}
          <div className="relative z-10">{children}</div>
          <PushManager />
        </main>
      </div>

      {/* Feedback widget + re-engagement modal — only after the user is loaded.
          daysInactive uses last_active_at as fetched, which /api/users/me returns
          BEFORE bumping it for the current request, so the value reflects the
          prior visit. */}
      {user && (
        <>
          <FeedbackWidget />
          <ReEngagementModal
            daysInactive={
              user.last_active_at
                ? Math.floor((Date.now() - new Date(user.last_active_at).getTime()) / (1000 * 60 * 60 * 24))
                : null
            }
          />
        </>
      )}

      {/* Notifications Dialog */}
      <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              {t("notif.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {notifications.draftAnnouncements > 0 && (
              <Link href="/admin/announcements" onClick={() => setShowNotifications(false)} className="flex items-center gap-3 p-3 rounded-xl transition-colors border border-amber-200 bg-amber-50">
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Megaphone size={16} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Draft Announcements</p>
                  <p className="text-xs text-amber-600">Pending your approval — review & publish</p>
                </div>
                <Badge className="bg-amber-500 text-white border-0 text-xs">{notifications.draftAnnouncements}</Badge>
              </Link>
            )}
            {notifications.announcements > 0 && (
              <Link
                href="/dashboard/announcements"
                onClick={() => setShowNotifications(false)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Megaphone size={16} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t("notif.new_announcements")}</p>
                  <p className="text-xs text-muted-foreground">{notifications.announcements} {t("notif.since_last_visit")}</p>
                </div>
                <Badge className="bg-accent/10 text-accent border-0 text-xs">{notifications.announcements}</Badge>
              </Link>
            )}
            {notifications.subscriptions > 0 && (
              <Link
                href="/dashboard/subscriptions"
                onClick={() => setShowNotifications(false)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Wallet size={16} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t("notif.subscriptions_due")}</p>
                  <p className="text-xs text-muted-foreground">{notifications.subscriptions} {t("notif.pending_payments")}</p>
                </div>
                <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">{notifications.subscriptions}</Badge>
              </Link>
            )}
            {notifications.tasks > 0 && (
              <Link
                href="/dashboard/todos"
                onClick={() => setShowNotifications(false)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <ListTodo size={16} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t("notif.active_tasks")}</p>
                  <p className="text-xs text-muted-foreground">{notifications.tasks} {t("notif.tasks_assigned")}</p>
                </div>
                <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">{notifications.tasks}</Badge>
              </Link>
            )}
            {notifications.volunteerInvites > 0 && (
              <button
                onClick={() => { setShowNotifications(false); setShowVolunteerInvite(true); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <Users size={16} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium">{t("volunteer.invite_title")}</p>
                  <p className="text-xs text-muted-foreground">{t("volunteer.invite_desc")}</p>
                </div>
                <Badge className="bg-green-100 text-green-700 border-0 text-xs">1</Badge>
              </button>
            )}
            {notifications.total === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">{t("notif.all_caught_up")}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Title Selection Dialog (Female members) */}
      <Dialog open={showTitlePicker} onOpenChange={() => {}}>
        <DialogContent className="max-w-xs" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-center">{t("profile.select_title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground text-center">
            {t("profile.select_title_desc")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {["Mrs.", "Miss.", "Dr."].map((title) => (
              <Button
                key={title}
                variant="outline"
                disabled={titleSaving}
                className="h-12 text-base font-semibold"
                onClick={() => handleTitleSelect(title)}
              >
                {title}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Volunteer Admin Invite Dialog */}
      <Dialog open={showVolunteerInvite} onOpenChange={setShowVolunteerInvite}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" />
              {t("volunteer.invite_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center space-y-2">
              <p className="text-sm font-medium text-green-800">{t("volunteer.invite_desc")}</p>
              {volunteerInvite && (
                <>
                  <p className="text-xs text-green-700">
                    {t("volunteer.invited_by")}: <strong>{volunteerInvite.inviterName}</strong>
                  </p>
                  <p className="text-xs text-green-700">
                    {t("volunteer.for_district")}: <strong>{volunteerInvite.district}</strong>
                  </p>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                disabled={volunteerResponding}
                onClick={() => handleVolunteerResponse("decline")}
              >
                {t("volunteer.decline")}
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                disabled={volunteerResponding}
                onClick={() => handleVolunteerResponse("accept")}
              >
                {t("volunteer.accept")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trainer Invite Dialog */}
      <Dialog open={showTrainerInvite} onOpenChange={setShowTrainerInvite}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-primary" />
              Trainer Invitation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">You have been invited to be a trainer for the following session(s):</p>
            {trainerInvites.map((inv) => (
              <div key={inv.id} className="rounded-xl border p-3 space-y-2">
                <p className="font-semibold text-sm">{inv.training?.title}</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {inv.training?.date && <p>Date: {new Date(inv.training.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>}
                  {inv.training?.location && <p>Location: {inv.training.location}</p>}
                  {inv.training?.mode && <p>Mode: {inv.training.mode.charAt(0).toUpperCase() + inv.training.mode.slice(1)}</p>}
                  {inv.inviter?.name && <p>Invited by: {inv.inviter.name}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={trainerResponding}
                    onClick={() => handleTrainerInviteResponse(inv.id, "decline")}>Decline</Button>
                  <Button size="sm" className="bg-primary hover:bg-primary/90" disabled={trainerResponding}
                    onClick={() => handleTrainerInviteResponse(inv.id, "accept")}>Accept</Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Incomplete Profile Dialog — mandatory, non-dismissible */}
      <Dialog open={showIncomplete && pathname !== "/dashboard/profile"} onOpenChange={() => {}}>
        <DialogContent className="max-w-md [&>button:last-child]:hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flower2 className="w-5 h-5 text-primary" />
              {t("profile.mandatory_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("profile.mandatory_greeting")}
            </p>
            <p className="text-sm font-medium">{t("profile.mandatory_missing")}</p>
            <div className="rounded-xl border bg-amber-50 p-3 space-y-1.5">
              {missingFields.map((field) => (
                <div key={field} className="flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="font-medium text-amber-800">{field}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {missingFields.length} {t("profile.mandatory_remaining")}
            </p>
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => {
                router.push("/dashboard/profile");
              }}
            >
              {t("profile.mandatory_button")}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              {t("profile.mandatory_note")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
