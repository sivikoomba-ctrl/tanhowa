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
  Receipt,
  Wallet,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface UserData {
  name: string;
  email: string;
  role: string;
  phone?: string;
  occupation?: string;
  official_type?: string | null;
  posting_details?: {
    regular_district?: string;
    regular_block?: string;
  };
}

const navItems = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/members", label: "Members", icon: Users },
  { href: "/dashboard/officials", label: "Officials", icon: Crown },
  { href: "/dashboard/teams", label: "Teams", icon: UsersRound },
  { href: "/dashboard/announcements", label: "Announcements", icon: Megaphone },
  { href: "/dashboard/events", label: "Events", icon: Calendar },
  { href: "/dashboard/resolutions", label: "Resolutions", icon: Vote },
  { href: "/dashboard/documents", label: "Document Vault", icon: FileText },
  { href: "/dashboard/suggestions", label: "Suggestions", icon: Lightbulb },
  { href: "/dashboard/grievances", label: "Grievances", icon: MessageSquareWarning },
  { href: "/dashboard/subscriptions", label: "Subscriptions", icon: Wallet },
  { href: "/dashboard/vouchers", label: "Expense Vouchers", icon: Receipt, officialOnly: true },
  { href: "/dashboard/verify-payments", label: "Verify Payments", icon: ShieldCheck, officialOnly: true },
  { href: "/dashboard/todos", label: "Task List", icon: ListTodo },
  { href: "/dashboard/contributions", label: "Contributions", icon: Award },
];

function getMissingFields(u: UserData): string[] {
  const missing: string[] = [];
  const nameParts = (u.name || "").trim().split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) missing.push("Last Name / Initial (update your First Name and Last Name in Profile)");
  if (!u.phone?.trim()) missing.push("Phone Number");
  if (!u.occupation?.trim()) missing.push("Designation");
  if (!u.posting_details?.regular_district) missing.push("District");
  if (!u.posting_details?.regular_block) missing.push("Block");
  return missing;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState({ total: 0, announcements: 0, subscriptions: 0, tasks: 0 });
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
          if (data.user.status === "pending" && data.user.role !== "super_admin") {
            router.push("/pending");
            return;
          }
          // Redirect truly unnamed users (no name at all) back to onboarding
          if (!data.user.name && data.user.role !== "admin" && data.user.role !== "super_admin") {
            router.push("/onboarding");
            return;
          }
          setUser(data.user);
          // Check for missing mandatory fields
          const missing = getMissingFields(data.user);
          if (missing.length > 0 && data.user.role !== "admin" && data.user.role !== "super_admin") {
            setMissingFields(missing);
            setShowIncomplete(true);
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

    // Silently update location if sharing is enabled
    if (navigator.geolocation) {
      fetch("/api/users/me").then((r) => r.json()).then((d) => {
        if (d.user?.location_sharing) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              fetch("/api/location", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              }).catch(() => {});
            },
            () => {}, // silent fail
            { enableHighAccuracy: false, timeout: 10000 }
          );
        }
      }).catch(() => {});
    }
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  function NavLinks({ onItemClick }: { onItemClick?: () => void }) {
    return (
      <>
        {navItems.filter((item) => !("officialOnly" in item && item.officialOnly) || user?.official_type === "state" || user?.official_type === "district" || user?.role === "admin" || user?.role === "super_admin").map((item) => {
          const isActive = pathname === item.href;
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
              {item.label}
            </Link>
          );
        })}
        {(user?.role === "admin" || user?.role === "super_admin") && (
          <Link
            href="/admin"
            onClick={onItemClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-primary hover:bg-sidebar-accent/50 transition-colors"
          >
            <Shield size={18} />
            Admin Panel
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
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          >
            <LogOut size={16} />
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile Header + Content */}
      <div className="flex-1 flex flex-col">
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
            <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground p-0">
              <div className="p-4 border-b border-sidebar-border">
                <div className="flex items-center gap-2">
                  <Flower2 className="w-7 h-7 text-sidebar-primary" />
                  <span className="text-lg font-bold">TANHOWA</span>
                </div>
                {user?.name && (
                  <p className="mt-1.5 text-xs text-sidebar-foreground/60 truncate">{user.name}</p>
                )}
              </div>
              <nav className="p-3 space-y-1">
                <NavLinks onItemClick={() => setMobileOpen(false)} />
              </nav>
              <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-sidebar-border">
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full justify-start gap-2 text-sidebar-foreground/70"
                >
                  <LogOut size={16} />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </header>

        <main className="flex-1 p-6 bg-background overflow-auto relative">
          <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.03] pointer-events-none" />
          <div className="relative z-10">{children}</div>
        </main>
      </div>

      {/* Notifications Dialog */}
      <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Notifications
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {notifications.total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">You&apos;re all caught up!</p>
            ) : (
              <>
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
                      <p className="text-sm font-medium">New Announcements</p>
                      <p className="text-xs text-muted-foreground">{notifications.announcements} since your last visit</p>
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
                      <p className="text-sm font-medium">Subscriptions Due</p>
                      <p className="text-xs text-muted-foreground">{notifications.subscriptions} pending payment{notifications.subscriptions > 1 ? "s" : ""}</p>
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
                      <p className="text-sm font-medium">Active Tasks</p>
                      <p className="text-xs text-muted-foreground">{notifications.tasks} task{notifications.tasks > 1 ? "s" : ""} assigned to you</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">{notifications.tasks}</Badge>
                  </Link>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Incomplete Profile Dialog */}
      <Dialog open={showIncomplete} onOpenChange={setShowIncomplete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flower2 className="w-5 h-5 text-primary" />
              Welcome back, {user?.name?.split(" ")[0] || "Member"}!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We noticed your profile is missing some important details. Please update the following to help us serve you better:
            </p>
            <div className="rounded-xl border bg-amber-50 p-3 space-y-1.5">
              {missingFields.map((field) => (
                <div key={field} className="flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="font-medium text-amber-800">{field}</span>
                </div>
              ))}
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => {
                setShowIncomplete(false);
                router.push("/dashboard/profile");
              }}
            >
              Update My Profile
            </Button>
            <button
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowIncomplete(false)}
            >
              Remind me later
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
