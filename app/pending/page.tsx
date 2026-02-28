"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Flower2 } from "lucide-react";

export default function PendingPage() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0] to-[#f4a261]/10">
      <Card className="w-full max-w-md text-center border-primary/20 shadow-xl">
        <CardContent className="pt-8 pb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Flower2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-primary">Tanhowa</h1>
          </div>
          <h2 className="text-xl font-semibold mb-2">Awaiting Approval</h2>
          <p className="text-muted-foreground mb-6">
            Your account has been created. An admin will review and approve your membership shortly.
          </p>
          <Button variant="outline" onClick={handleLogout}>
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
