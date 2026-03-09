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
  AlertTriangle,
  Wallet,
  UsersRound,
  ListTodo,
  BarChart3,
  Settings,
  LogOut,
  ArrowLeft,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const adminNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Member Approval", icon: Users },
  { href: "/admin/teams", label: "Teams", icon: UsersRound },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/events", label: "Events", icon: Calendar },
  { href: "/admin/documents", label: "Document Vault", icon: FileText },
  { href: "/admin/grievances", label: "Grievances / Suggestions", icon: MessageSquareWarning },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: Wallet },
  { href: "/admin/todos", label: "To-Do List", icon: ListTodo },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/error-logs", label: "Error Logs", icon: AlertTriangle },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
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
        else if (d.user.role !== "admin") router.push("/dashboard");
        else setIsAdmin(true);
      })
      .catch(() => router.push("/"));

    fetchCounts();
  }, [router, pathname]);

  function fetchCounts() {
    fetch("/api/users?status=pending")
      .then((r) => r.json())
      .then((d) => setPendingCount(d.users?.length || 0))
      .catch(() => {});

    fetch("/api/error-logs?type=unresolved")
      .then((r) => r.json())
      .then((d) => setErrorCount(d.unresolvedCount || 0))
      .catch(() => {});
  }

  useEffect(() => {
    const handler = () => fetchCounts();
    window.addEventListener("admin-users-changed", handler);
    return () => window.removeEventListener("admin-users-changed", handler);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (!isAdmin) return null;

  function NavLinks({ onItemClick }: { onItemClick?: () => void }) {
    return (
      <>
        {adminNavItems.map((item) => {
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
              <span className="flex-1">{item.label}</span>
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
          <Link href="/admin" className="flex items-center gap-2">
            <Flower2 className="w-7 h-7 text-sidebar-primary" />
            <div>
              <span className="text-lg font-bold text-sidebar-foreground">TANHOWA</span>
              <span className="text-xs text-sidebar-foreground/60 block -mt-1">Admin Panel</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <NavLinks />
        </nav>

        <div className="shrink-0 p-3 border-t border-sidebar-border space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-lg hover:bg-sidebar-accent/50"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
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

      {/* Mobile + Content */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
          <Link href="/admin" className="flex items-center gap-2">
            <Flower2 className="w-6 h-6 text-primary" />
            <span className="font-bold text-primary">TANHOWA</span>
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground p-0 flex flex-col">
              <div className="p-4 border-b border-sidebar-border">
                <div className="flex items-center gap-2">
                  <Flower2 className="w-7 h-7 text-sidebar-primary" />
                  <span className="text-lg font-bold">TANHOWA</span>
                </div>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                <NavLinks onItemClick={() => setMobileOpen(false)} />
              </nav>
              <div className="shrink-0 p-3 border-t border-sidebar-border space-y-1">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-lg hover:bg-sidebar-accent/50"
                >
                  <ArrowLeft size={16} />
                  Back to Dashboard
                </Link>
                <Button
                  variant="ghost"
                  onClick={() => { setMobileOpen(false); handleLogout(); }}
                  className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                >
                  <LogOut size={16} />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 p-6 bg-background overflow-auto relative">
          <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.03] pointer-events-none" />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
