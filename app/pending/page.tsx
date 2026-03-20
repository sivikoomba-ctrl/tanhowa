"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Flower2 } from "lucide-react";
import Image from "next/image";

export default function PendingPage() {
  const router = useRouter();

  // Check immediately + poll every 30s
  useEffect(() => {
    function checkStatus() {
      fetch("/api/users/me")
        .then((r) => r.json())
        .then((d) => {
          if (d.user?.status === "approved") {
            clearInterval(interval);
            router.push("/dashboard");
          } else if (d.user?.status === "rejected") {
            clearInterval(interval);
            router.push("/onboarding");
          }
        })
        .catch(() => {});
    }
    checkStatus(); // Check immediately on load
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.06]" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0]/90 to-[#f4a261]/10" />
      <Card className="relative z-10 w-full max-w-md text-center border-primary/20 shadow-xl">
        <CardContent className="pt-8 pb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Flower2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-primary">TANHOWA</h1>
          </div>
          <h2 className="text-xl font-semibold mb-2">Awaiting Approval</h2>
          <p className="text-muted-foreground mb-6">
            Your account has been created and is under review. An admin will either approve or reject your membership. You&apos;ll be notified once a decision is made.
          </p>
          <Button variant="outline" onClick={handleLogout}>
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
