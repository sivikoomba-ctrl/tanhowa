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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface UserData {
  name: string;
  email: string;
  role: string;
  phone?: string;
  occupation?: string;
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
  { href: "/dashboard/grievances", label: "Suggestions/Grievances", icon: MessageSquareWarning },
  { href: "/dashboard/subscriptions", label: "Subscriptions", icon: Wallet },
  { href: "/dashboard/todos", label: "To-Do List", icon: ListTodo },
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
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  function NavLinks({ onItemClick }: { onItemClick?: () => void }) {
    return (
      <>
        {navItems.map((item) => {
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
          <Link href="/dashboard" className="flex items-center gap-2">
            <Flower2 className="w-7 h-7 text-sidebar-primary" />
            <span className="text-lg font-bold text-sidebar-foreground">TANHOWA</span>
          </Link>
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
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
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
        </header>

        <main className="flex-1 p-6 bg-background overflow-auto relative">
          <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.03] pointer-events-none" />
          <div className="relative z-10">{children}</div>
        </main>
      </div>

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
