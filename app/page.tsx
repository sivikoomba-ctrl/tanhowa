"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Flower2, Leaf, TreePine, Sprout } from "lucide-react";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send OTP");
        return;
      }

      router.push(`/verify?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0] to-[#f4a261]/10" />

      {/* Decorative floating elements */}
      <div className="absolute top-20 left-10 text-primary/10 animate-pulse">
        <Flower2 size={120} />
      </div>
      <div className="absolute top-40 right-16 text-secondary/20 animate-pulse delay-700">
        <Leaf size={80} />
      </div>
      <div className="absolute bottom-20 left-20 text-primary/8 animate-pulse delay-1000">
        <TreePine size={100} />
      </div>
      <div className="absolute bottom-40 right-10 text-accent/15 animate-pulse delay-500">
        <Sprout size={90} />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          {/* Logo / Brand */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
              <Flower2 className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight text-primary">
              Tanhowa
            </h1>
            <p className="mt-2 text-lg font-medium text-accent">
              Horticulture Community
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Connecting plant enthusiasts, gardeners & professionals
            </p>
          </div>

          {/* Login Card */}
          <Card className="border-primary/20 shadow-xl shadow-primary/5">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold text-foreground mb-1">
                Welcome
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email to sign in or create an account
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 text-base border-primary/30 focus-visible:ring-primary"
                />

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90"
                >
                  {loading ? "Sending OTP..." : "Continue with Email"}
                </Button>
              </form>

              <p className="mt-4 text-xs text-muted-foreground">
                We&apos;ll send a one-time verification code to your email
              </p>
            </CardContent>
          </Card>

          {/* Footer */}
          <p className="mt-8 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Tanhowa Horticulture Community
          </p>
        </div>
      </div>
    </div>
  );
}
