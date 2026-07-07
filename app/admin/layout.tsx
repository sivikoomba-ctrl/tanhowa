"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Flower2,
  LayoutDashboard,
  Users,
  UserMinus,
  Mail,
  Megaphone,
  Calendar,
  FileText,
  MessageSquareWarning,
  Lightbulb,
  TicketCheck,
  Receipt,
  Wallet,
  UsersRound,
  ListTodo,
  BarChart3,
  Vote,
  Crown,
  Settings,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  Award,
  Bell,
  Navigation,
  ShieldCheck,
  ChevronDown,
  MessageCircle,
  AlertCircle,
  PieChart,
  Landmark,
  ClipboardList,
  Calculator,
  UtensilsCrossed,
  HelpCircle,
  ClipboardCheck,
  GraduationCap,
  Activity,
  TrendingUp,
  MessagesSquare,
  Sprout,
  History as HistoryIcon,
  Bug,
  Camera,
  BadgeCheck,
  NotebookPen,
  Sparkles,
  FileSignature,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { SettingsPopover } from "@/components/settings-popover";
import { GlobalSearch } from "@/components/global-search";
import { PREVIEW_ROLES, getPreviewRole, setPreviewRole as persistPreviewRole, previewToUserFields, type PreviewRole } from "@/lib/preview-role";

const NAV_SECTIONS = [
  {
    titleKey: "nav.section.overview" as const,
    items: [
      { href: "/admin", labelKey: "nav.dashboard" as const, icon: LayoutDashboard },
      { assistantAction: true as const },
    ],
  },
  {
    titleKey: "nav.section.members" as const,
    items: [
      { href: "/admin/users", labelKey: "nav.member_approval" as const, icon: Users },
      { href: "/admin/roster", labelKey: "nav.roster" as const, icon: ClipboardList },
      { href: "/admin/officials", labelKey: "nav.officials" as const, icon: Crown },
      { href: "/admin/adh-pm", labelKey: "nav.adh_pm" as const, icon: BadgeCheck },
      { href: "/admin/photo-review", labelKey: "nav.photo_review" as const, icon: Camera },
      { href: "/admin/teams", labelKey: "nav.teams" as const, icon: UsersRound },
      { href: "/admin/nearby", labelKey: "nav.nearby" as const, icon: Navigation },
    ],
  },
  {
    titleKey: "nav.section.content" as const,
    items: [
      { href: "/admin/announcements", labelKey: "nav.announcements" as const, icon: Megaphone },
      { href: "/admin/field-diary-stories", labelKey: "nav.field_diary_stories" as const, icon: Sparkles },
      { href: "/admin/events", labelKey: "nav.events" as const, icon: Calendar },
      { href: "/admin/group-chat", labelKey: "nav.group_chat" as const, icon: MessagesSquare },
      { href: "/admin/meetings", labelKey: "nav.meetings" as const, icon: Calendar },
      { href: "/admin/documents", labelKey: "nav.documents" as const, icon: FileText },
      { href: "/admin/history", labelKey: "nav.history" as const, icon: HistoryIcon },
    ],
  },
  {
    titleKey: "nav.section.finance" as const,
    items: [
      { href: "/admin/subscriptions", labelKey: "nav.subscriptions" as const, icon: Wallet },
      { href: "/admin/verify-payments", labelKey: "nav.verify_payments" as const, icon: ShieldCheck },
      { href: "/admin/district-dues", labelKey: "nav.district_dues" as const, icon: Calculator },
      { href: "/admin/district-member-dues", labelKey: "nav.district_member_dues" as const, icon: Calculator },
      { href: "/admin/vouchers", labelKey: "nav.vouchers" as const, icon: Receipt },
      { href: "/admin/finance", labelKey: "nav.finance" as const, icon: Landmark },
    ],
  },
  {
    titleKey: "nav.section.governance" as const,
    items: [
      { href: "/admin/resolutions", labelKey: "nav.resolutions" as const, icon: Vote },
      { href: "/admin/polls", labelKey: "nav.polls" as const, icon: PieChart },
      { href: "/admin/elections", labelKey: "nav.elections" as const, icon: Vote },
    ],
  },
  {
    titleKey: "nav.section.engagement" as const,
    items: [
      { href: "/admin/todos", labelKey: "nav.todos" as const, icon: ListTodo },
      { href: "/admin/trainings", labelKey: "nav.trainings" as const, icon: GraduationCap },
      { href: "/admin/wishlist", labelKey: "nav.wishlist" as const, icon: Lightbulb },
      { href: "/admin/food-orders", labelKey: "nav.food_orders" as const, icon: UtensilsCrossed },
      { href: "/admin/faq", labelKey: "nav.faq" as const, icon: HelpCircle },
      { feedbackGroup: true as const },
      { href: "/admin/contributions", labelKey: "nav.contributions" as const, icon: Award },
    ],
  },
  {
    titleKey: "nav.section.insights" as const,
    items: [
      { href: "/admin/reports", labelKey: "nav.reports" as const, icon: BarChart3 },
      { href: "/admin/district-benchmark", labelKey: "nav.district_benchmark" as const, icon: BarChart3 },
      { href: "/admin/field-diary-compliance", labelKey: "nav.field_diary_compliance" as const, icon: NotebookPen },
      { href: "/admin/dc-representation", labelKey: "nav.dc_representation" as const, icon: FileSignature },
    ],
  },
  {
    titleKey: "nav.section.exclusive" as const,
    items: [
      { href: "/admin/feedback-pulse", labelKey: "nav.feedback_pulse" as const, icon: MessageCircle },
      { href: "/admin/analytics", labelKey: "nav.analytics" as const, icon: Activity },
      { href: "/admin/engagement", labelKey: "nav.engagement" as const, icon: TrendingUp },
      { href: "/admin/at-risk-members", labelKey: "nav.at_risk" as const, icon: UserMinus },
      { href: "/admin/digest", labelKey: "nav.digest" as const, icon: Mail },
      { href: "/admin/special-tasks", labelKey: "nav.special_tasks" as const, icon: ClipboardCheck },
      { href: "/admin/special-documents", labelKey: "nav.special_documents" as const, icon: FileText },
      { href: "/admin/why-ministry", labelKey: "nav.why_ministry" as const, icon: Sprout },
      { href: "/admin/pest-training", labelKey: "nav.pest_training" as const, icon: Bug },
      { href: "/admin/logo-vote", labelKey: "nav.logo_vote" as const, icon: Flower2 },
      { href: "/admin/error-logs", labelKey: "nav.error_logs" as const, icon: AlertCircle },
    ],
  },
  {
    titleKey: "nav.section.system" as const,
    items: [
      { href: "/admin/audit-logs", labelKey: "nav.audit_log" as const, icon: ClipboardList },
      { href: "/admin/settings", labelKey: "nav.settings" as const, icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [isFinanceTeam, setIsFinanceTeam] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState({ total: 0, announcements: 0, subscriptions: 0, tasks: 0, draftAnnouncements: 0 });
  const [previewRole, setPreviewRoleState] = useState<PreviewRole | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Preview mode: super-admin-only sidebar simulation, purely client-side (see lib/preview-role.ts)
  useEffect(() => { setPreviewRoleState(getPreviewRole()); }, []);
  const realIsSuperAdmin = user?.role === "super_admin";
  // "member" preview is a redirect-to-/dashboard action, not something simulated within
  // the admin panel itself (most nav items have no role gate and would still show).
  const activePreview = realIsSuperAdmin && previewRole && previewRole !== "super_admin" && previewRole !== "member" ? previewRole : null;
  const effectiveUser = activePreview ? { ...user, ...previewToUserFields(activePreview) } : user;
  function choosePreview(role: PreviewRole) {
    persistPreviewRole(role);
    setPreviewRoleState(role);
    if (role === "member") router.push("/dashboard");
  }

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then((d) => {
        if (!d.user) router.push("/");
        else if (d.user.role !== "admin" && d.user.role !== "super_admin" && !d.is_finance_team) router.push("/dashboard");
        else { setIsAdmin(true); setUser(d.user); setIsFinanceTeam(!!d.is_finance_team); if (d.user.role === "super_admin") fetchErrorCount(); }
      })
      .catch(() => router.push("/"));

    fetchCounts();

    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => { if (d.total !== undefined) setNotifications(d); })
      .catch(() => {});
  }, [router, pathname]);

  function fetchErrorCount() {
    fetch("/api/error-logs?type=unresolved")
      .then((r) => r.json())
      .then((d) => setErrorCount(d.unresolvedCount || 0))
      .catch(() => {});
  }

  function fetchCounts() {
    fetch("/api/users?status=pending")
      .then((r) => r.json())
      .then((d) => setPendingCount(d.users?.length || 0))
      .catch(() => {});
  }

  useEffect(() => {
    const handler = () => { setTimeout(fetchCounts, 500); };
    window.addEventListener("admin-users-changed", handler);
    return () => window.removeEventListener("admin-users-changed", handler);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  const t = useT();

  const [feedbackOpen, setFeedbackOpen] = useState(
    pathname === "/admin/suggestions" || pathname === "/admin/grievances" || pathname === "/admin/service-requests"
  );

  if (!isAdmin) return null;

  // Grievances: state officials + super admin (all), district admins (own district)
  const grievanceAccess = effectiveUser?.role === "super_admin" || effectiveUser?.official_type === "state" || effectiveUser?.official_type === "district";
  const feedbackItems = [
    { href: "/admin/suggestions", labelKey: "nav.suggestions" as const, icon: Lightbulb },
    { href: "/admin/service-requests", labelKey: "nav.service_requests" as const, icon: TicketCheck },
    ...(grievanceAccess ? [{ href: "/admin/grievances", labelKey: "nav.grievances" as const, icon: MessageSquareWarning }] : []),
  ];
  const isFeedbackActive = feedbackItems.some((i) => pathname === i.href);

  function isNavItemVisible(href: string) {
    const superAdminOnly = ["/admin/error-logs", "/admin/special-tasks", "/admin/logo-vote", "/admin/pest-training"];
    if (superAdminOnly.includes(href)) return effectiveUser?.role === "super_admin";
    if (href === "/admin/elections") return effectiveUser?.role === "super_admin" || effectiveUser?.official_type === "state" || effectiveUser?.email === "sivikoomba@gmail.com";
    if (href === "/admin/special-documents") return effectiveUser?.email === "tanhowa19791@gmail.com";
    if (href === "/admin/analytics") return effectiveUser?.email === "tanhowa19791@gmail.com" || effectiveUser?.email === "tanhowaadmin@tanhowa.in";
    if (href === "/admin/engagement") return effectiveUser?.email === "tanhowa19791@gmail.com";
    if (href === "/admin/at-risk-members") return effectiveUser?.email === "tanhowa19791@gmail.com";
    if (href === "/admin/digest") return effectiveUser?.email === "tanhowa19791@gmail.com";
    if (href === "/admin/meetings") return effectiveUser?.role === "super_admin" || effectiveUser?.official_type === "state";
    if (href === "/admin/photo-review") return effectiveUser?.role === "super_admin" || effectiveUser?.official_type === "state";
    if (href === "/admin/adh-pm") return effectiveUser?.role === "super_admin" || effectiveUser?.official_type === "state";
    if (href === "/admin/why-ministry") return effectiveUser?.email === "tanhowa19791@gmail.com";
    if (href === "/admin/history") return effectiveUser?.role === "admin" || effectiveUser?.role === "super_admin";
    if (href === "/admin/feedback-pulse") return effectiveUser?.email === "tanhowa19791@gmail.com";
    if (href === "/admin/vouchers") return effectiveUser?.role === "super_admin" || (!activePreview && isFinanceTeam);
    if (href === "/admin/field-diary-compliance") return effectiveUser?.role === "super_admin" || effectiveUser?.official_type === "state" || effectiveUser?.official_type === "district";
    if (href === "/admin/field-diary-stories") return effectiveUser?.role === "super_admin" || effectiveUser?.official_type === "state" || effectiveUser?.official_type === "district";
    return true;
  }

  function NavLinks({ onItemClick }: { onItemClick?: () => void }) {
    function renderItem(item: { href: string; labelKey: Parameters<typeof t>[0]; icon: typeof LayoutDashboard }) {
      const isActive = pathname === item.href;
      const showBadge = (item.href === "/admin/users" && pendingCount > 0) || (item.href === "/admin/error-logs" && errorCount > 0);
      const badgeCount = item.href === "/admin/users" ? pendingCount : errorCount;
      const badgeColor = item.href === "/admin/error-logs" ? "bg-red-500" : "bg-amber-500";
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
          {showBadge && (
            <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full ${badgeColor} text-white`}>
              {badgeCount}
            </span>
          )}
        </Link>
      );
    }

    const assistantButtonJsx = (
      <button
        key="assistant-action"
        onClick={() => {
          try { sessionStorage.removeItem("tanhowa-assistant-fab-hidden"); } catch { /* ignore */ }
          window.dispatchEvent(new Event("open-tanhowa-assistant"));
          onItemClick?.();
        }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
      >
        <Flower2 size={18} />
        <span className="flex-1 text-left">{t("nav.assistant")}</span>
      </button>
    );

    const feedbackGroupJsx = (
      <div key="feedback-group">
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
      </div>
    );

    return (
      <>
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter((item) =>
            "feedbackGroup" in item || "assistantAction" in item ? true : isNavItemVisible(item.href)
          );
          if (visible.length === 0) return null;
          return (
            <div key={section.titleKey} className="space-y-0.5">
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {t(section.titleKey)}
              </p>
              {visible.map((item) =>
                "feedbackGroup" in item
                  ? feedbackGroupJsx
                  : "assistantAction" in item
                    ? assistantButtonJsx
                    : renderItem(item)
              )}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className="h-screen flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col h-screen sticky top-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <Link href="/admin" className="flex items-center gap-2">
              <Image src="/logo.png" alt="TANHOWA" width={32} height={32} priority className="rounded-full bg-white/95 p-0.5" />
              <div>
                <span className="text-lg font-bold text-sidebar-foreground">TANHOWA</span>
                <span className="text-xs text-sidebar-foreground/60 block -mt-1">{t("nav.admin_panel")}</span>
              </div>
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
          {user?.status && (
            <p className="text-[10px] text-sidebar-foreground/40 capitalize">{user.status}</p>
          )}
          {realIsSuperAdmin && (
            <div className="mt-2 flex items-center gap-1.5">
              <Eye size={12} className="text-sidebar-foreground/50 shrink-0" />
              <select
                value={previewRole || "super_admin"}
                onChange={(e) => choosePreview(e.target.value as PreviewRole)}
                className="flex-1 min-w-0 text-[11px] bg-sidebar-accent/40 border border-sidebar-border rounded-md px-1.5 py-1 text-sidebar-foreground"
              >
                {PREVIEW_ROLES.map((r) => (
                  <option key={r.value} value={r.value} className="text-foreground">{r.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="px-3 pt-2">
          <GlobalSearch />
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <NavLinks />
        </nav>

        <div className="shrink-0 p-3 border-t border-sidebar-border space-y-1">
          <SettingsPopover />
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-lg hover:bg-sidebar-accent/50"
          >
            <ArrowLeft size={16} />
            {t("nav.back_to_dashboard")}
          </Link>
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

      {/* Mobile + Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
          <Link href="/admin" className="flex items-center gap-2">
            <Image src="/logo.png" alt="TANHOWA" width={28} height={28} priority className="rounded-full" />
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
              <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground p-0 flex flex-col">
                <div className="p-4 border-b border-sidebar-border">
                  <div className="flex items-center gap-2">
                    <Image src="/logo.png" alt="TANHOWA" width={32} height={32} className="rounded-full bg-white/95 p-0.5" />
                    <span className="text-lg font-bold">TANHOWA</span>
                  </div>
                  {user?.name && (
                    <p className="mt-1.5 text-xs text-sidebar-foreground/60 truncate">{user.name}</p>
                  )}
                  {user?.status && (
                    <p className="text-[10px] text-sidebar-foreground/40 capitalize">{user.status}</p>
                  )}
                </div>
                <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                  <NavLinks onItemClick={() => setMobileOpen(false)} />
                </nav>
                <div className="shrink-0 p-3 border-t border-sidebar-border space-y-1">
                  <SettingsPopover />
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-lg hover:bg-sidebar-accent/50"
                  >
                    <ArrowLeft size={16} />
                    {t("nav.back_to_dashboard")}
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={() => { setMobileOpen(false); handleLogout(); }}
                    className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
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
          <div className="relative z-10">
            {activePreview && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Eye size={14} className="shrink-0" />
                <span className="flex-1">
                  Previewing sidebar as <strong>{PREVIEW_ROLES.find((r) => r.value === activePreview)?.label}</strong> — page data still loads under your real account, this only simulates nav visibility.
                </span>
                <button
                  onClick={() => choosePreview("super_admin")}
                  className="shrink-0 font-medium underline hover:no-underline"
                >
                  Exit preview
                </button>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell size={18} />
              {t("notif.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {notifications.total === 0 ? (
              <p className="text-center text-muted-foreground py-6">{t("notif.all_caught_up")}</p>
            ) : (
              <>
                {notifications.announcements > 0 && (
                  <Link href="/admin/announcements" onClick={() => setShowNotifications(false)} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-accent/10">
                        <Megaphone size={16} className="text-accent" />
                      </div>
                      <span className="text-sm font-medium">{t("notif.new_announcements")}</span>
                    </div>
                    <Badge variant="secondary">{notifications.announcements}</Badge>
                  </Link>
                )}
                {notifications.subscriptions > 0 && (
                  <Link href="/admin/subscriptions" onClick={() => setShowNotifications(false)} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-amber-500/10">
                        <Wallet size={16} className="text-amber-500" />
                      </div>
                      <span className="text-sm font-medium">{t("notif.subscriptions_due")}</span>
                    </div>
                    <Badge variant="secondary">{notifications.subscriptions}</Badge>
                  </Link>
                )}
                {notifications.tasks > 0 && (
                  <Link href="/admin/todos" onClick={() => setShowNotifications(false)} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-500/10">
                        <ListTodo size={16} className="text-blue-500" />
                      </div>
                      <span className="text-sm font-medium">{t("notif.active_tasks")}</span>
                    </div>
                    <Badge variant="secondary">{notifications.tasks}</Badge>
                  </Link>
                )}
                {notifications.draftAnnouncements > 0 && (
                  <Link href="/admin/announcements" onClick={() => setShowNotifications(false)} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors border-amber-200 bg-amber-50/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-amber-500/10">
                        <Megaphone size={16} className="text-amber-600" />
                      </div>
                      <span className="text-sm font-medium">Draft Announcements — Pending Approval</span>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700 border-amber-300">{notifications.draftAnnouncements}</Badge>
                  </Link>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
