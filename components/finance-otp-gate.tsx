"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, Loader2, KeyRound } from "lucide-react";

const SESSION_KEY = "finance_otp_verified";
const SESSION_DURATION = 60 * 60 * 1000; // 1 hour

export function FinanceOtpGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if already verified within the session duration
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (Date.now() - ts < SESSION_DURATION) {
        setVerified(true);
        setChecking(false);
        return;
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    // Super admins and regular admins bypass OTP — only finance team members need it
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.role === "super_admin" || d.user?.role === "admin") {
          sessionStorage.setItem(SESSION_KEY, Date.now().toString());
          setVerified(true);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  async function handleSendOtp() {
    setSending(true);
    try {
      const res = await fetch("/api/auth/finance-otp", { method: "POST" });
      if (res.ok) {
        setOtpSent(true);
        toast.success("OTP sent to your email");
        setTimeout(() => inputRef.current?.focus(), 100);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send OTP");
      }
    } catch {
      toast.error("Failed to send OTP");
    }
    setSending(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/finance-otp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        sessionStorage.setItem(SESSION_KEY, Date.now().toString());
        setVerified(true);
        toast.success("Finance access verified");
      } else {
        const data = await res.json();
        toast.error(data.error || "Invalid OTP");
      }
    } catch {
      toast.error("Verification failed");
    }
    setVerifying(false);
  }

  if (checking) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (verified) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Finance Section Access</h2>
            <p className="text-sm text-muted-foreground mt-1">
              OTP verification required for security
            </p>
          </div>

          {!otpSent ? (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                An OTP will be sent to your registered email address.
              </p>
              <Button onClick={handleSendOtp} disabled={sending} className="bg-primary hover:bg-primary/90">
                {sending ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" />Sending...</>
                ) : (
                  <><KeyRound size={16} className="mr-2" />Send OTP</>
                )}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <Input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-lg tracking-widest font-mono"
                  autoComplete="one-time-code"
                />
              </div>
              <Button type="submit" disabled={verifying || code.length < 6} className="w-full bg-primary hover:bg-primary/90">
                {verifying ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" />Verifying...</>
                ) : (
                  "Verify & Continue"
                )}
              </Button>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sending}
                className="w-full text-xs text-primary hover:underline"
              >
                {sending ? "Sending..." : "Resend OTP"}
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
