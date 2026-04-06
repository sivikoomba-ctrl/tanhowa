"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldX, Flower2, LogOut, Phone } from "lucide-react";
import Image from "next/image";

interface SuspensionDetails {
  reason: string;
  remarks: string;
  suspended_at: string;
}

export default function SuspendedPage() {
  const router = useRouter();
  const [details, setDetails] = useState<SuspensionDetails | null>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.status === "approved") {
          router.push("/dashboard");
        } else if (d.user?.status !== "suspended") {
          router.push("/");
        }
        if (d.user?.suspension_details) {
          setDetails(d.user.suspension_details);
        }
      })
      .catch(() => {});
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  const reasonLabels: Record<string, string> = {
    "non_payment": "Non-payment of subscriptions",
    "disciplinary": "Disciplinary action",
    "voluntary": "Voluntary withdrawal",
    "transfer": "Transfer out of TN Horticulture",
    "retirement": "Retirement",
    "other": "Administrative decision",
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.06]" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0]/90 to-[#f4a261]/10" />
      <Card className="relative z-10 w-full max-w-md text-center border-red-200 shadow-xl">
        <CardContent className="pt-8 pb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <ShieldX className="w-8 h-8 text-red-600" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Flower2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-primary">TANHOWA</h1>
          </div>
          <h2 className="text-xl font-semibold mb-2 text-red-700">Membership Suspended</h2>
          <p className="text-muted-foreground mb-4">
            Your TANHOWA membership has been suspended. Portal access is restricted during the suspension period.
          </p>

          {details && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-left text-sm">
              <p className="text-red-800 font-medium mb-1">Reason: {reasonLabels[details.reason] || details.reason}</p>
              {details.remarks && <p className="text-red-700 text-xs">{details.remarks}</p>}
              {details.suspended_at && (
                <p className="text-red-500 text-xs mt-1">
                  Since: {new Date(details.suspended_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-muted-foreground mb-6">
            If you believe this is an error, please contact the TANHOWA administration.
          </p>

          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" asChild>
              <a href="tel:+919876543210" className="gap-1.5">
                <Phone size={14} /> Contact Admin
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut size={14} /> Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
