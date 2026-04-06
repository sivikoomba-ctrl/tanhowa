"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Flower2,
  LayoutDashboard,
  Users,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { SettingsPopover } from "@/components/settings-popover";
import { GlobalSearch } from "@/components/global-search";

const adminNavItems = [
  { href: "/admin", labelKey: "nav.dashboard" as const, icon: LayoutDashboard },
  { href: "/admin/users", labelKey: "nav.member_approval" as const, icon: Users },
  { href: "/admin/officials", labelKey: "nav.officials" as const, icon: Crown },
  { href: "/admin/teams", labelKey: "nav.teams" as const, icon: UsersRound },
  { href: "/admin/announcements", labelKey: "nav.announcements" as const, icon: Megaphone },
  { href: "/admin/events", labelKey: "nav.events" as const, icon: Calendar },
  { href: "/admin/documents", labelKey: "nav.documents" as const, icon: FileText },
  { href: "/admin/subscriptions", labelKey: "nav.subscriptions" as const, icon: Wallet },
  { href: "/admin/verify-payments", labelKey: "nav.verify_payments" as const, icon: ShieldCheck },
  { href: "/admin/district-dues", labelKey: "nav.district_dues" as const, icon: Calculator },
  { href: "/admin/resolutions", labelKey: "nav.resolutions" as const, icon: Vote },
  { href: "/admin/polls", labelKey: "nav.polls" as const, icon: PieChart },
  { href: "/admin/todos", labelKey: "nav.todos" as const, icon: ListTodo },
  { href: "/admin/vouchers", labelKey: "nav.vouchers" as const, icon: Receipt },
  { href: "/admin/contributions", labelKey: "nav.contributions" as const, icon: Award },
  { href: "/admin/reports", labelKey: "nav.reports" as const, icon: BarChart3 },
  { href: "/admin/district-benchmark", labelKey: "nav.district_benchmark" as const, icon: BarChart3 },
  { href: "/admin/finance", labelKey: "nav.finance" as const, icon: Landmark },
  { href: "/admin/nearby", labelKey: "nav.nearby" as const, icon: Navigation },
  { href: "/admin/wishlist", labelKey: "nav.wishlist" as const, icon: Lightbulb },
  { href: "/admin/trainings", labelKey: "nav.trainings" as const, icon: GraduationCap },
  { href: "/admin/faq", labelKey: "nav.faq" as const, icon: HelpCircle },
  { href: "/admin/food-orders", labelKey: "nav.food_orders" as const, icon: UtensilsCrossed },
  { href: "/admin/special-tasks", labelKey: "nav.special_tasks" as const, icon: ClipboardCheck },
  { href: "/admin/special-documents", labelKey: "nav.special_documents" as const, icon: FileText },
  { href: "/admin/analytics", labelKey: "nav.analytics" as const, icon: Activity },
  { href: "/admin/engagement", labelKey: "nav.engagement" as const, icon: TrendingUp },
  { href: "/admin/audit-logs", labelKey: "nav.audit_log" as const, icon: ClipboardList },
  { href: "/admin/error-logs", labelKey: "nav.error_logs" as const, icon: AlertCircle },
  { href: "/admin/settings", labelKey: "nav.settings" as const, icon: Settings },
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
  const router = useRouter();
  const pathname = usePathname();

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

  const feedbackItems = [
    { href: "/admin/suggestions", labelKey: "nav.suggestions" as const, icon: Lightbulb },
    { href: "/admin/service-requests", labelKey: "nav.service_requests" as const, icon: TicketCheck },
    { href: "/admin/grievances", labelKey: "nav.grievances" as const, icon: MessageSquareWarning },
  ];
  const isFeedbackActive = feedbackItems.some((i) => pathname === i.href);

  function NavLinks({ onItemClick }: { onItemClick?: () => void }) {
    return (
      <>
        {adminNavItems.filter((item) => {
          const superAdminOnly = ["/admin/error-logs", "/admin/special-tasks"];
          if (superAdminOnly.includes(item.href)) return user?.role === "super_admin";
          if (item.href === "/admin/special-documents") return user?.email === "tanhowa19791@gmail.com";
          if (item.href === "/admin/analytics") return user?.email === "tanhowa19791@gmail.com" || user?.email === "tanhowaadmin@tanhowa.in";
          if (item.href === "/admin/engagement") return user?.email === "tanhowa19791@gmail.com";
          if (item.href === "/admin/vouchers") return user?.role === "super_admin" || isFinanceTeam;
          return true;
        }).map((item) => {
          const isActive = pathname === item.href;
          const showBadge = (item.href === "/admin/users" && pendingCount > 0) || (item.href === "/admin/error-logs" && errorCount > 0);
          const badgeCount = item.href === "/admin/users" ? pendingCount : errorCount;
          const badgeColor = item.href === "/admin/error-logs" ? "bg-red-500" : "bg-amber-500";

          // Insert Feedback group before Subscriptions
          if (item.href === "/admin/subscriptions") {
            return (
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
                  <span className="flex-1">{t(item.labelKey)}</span>
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
              {showBadge && (
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full ${badgeColor} text-white`}>
                  {badgeCount}
                </span>
              )}
            </Link>
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
              <Flower2 className="w-7 h-7 text-sidebar-primary" />
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
              <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground p-0 flex flex-col">
                <div className="p-4 border-b border-sidebar-border">
                  <div className="flex items-center gap-2">
                    <Flower2 className="w-7 h-7 text-sidebar-primary" />
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
          <div className="relative z-10">{children}</div>
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
