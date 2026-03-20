"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Flower2, ArrowLeft } from "lucide-react";
import Image from "next/image";

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(60);
  const [smsSessionId, setSmsSessionId] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const phone = searchParams.get("phone") || "";
  const sid = searchParams.get("sid") || "";
  const isPhoneMode = !!phone;

  useEffect(() => {
    if (!email && !phone) router.push("/");
  }, [email, phone, router]);

  useEffect(() => {
    if (sid) setSmsSessionId(sid);
  }, [sid]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setCode(newCode);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const otpCode = code.join("");
    if (otpCode.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const endpoint = isPhoneMode ? "/api/auth/verify-mobile-otp" : "/api/auth/verify-otp";
      const body = isPhoneMode
        ? { phone, code: otpCode, sessionId: smsSessionId }
        : { email, code: otpCode };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "account_deleted_incomplete_profile") {
          router.push("/?error=account_deleted_incomplete_profile");
          return;
        }
        setError(data.error || "Verification failed");
        return;
      }

      // Super admin always goes to dashboard — no onboarding required
      if (data.user.role === "super_admin") {
        router.push("/dashboard");
      } else if (data.isNewUser) {
        router.push("/onboarding");
      } else if (data.user.status === "approved") {
        // Check mandatory fields — redirect to onboarding if missing
        const { name, phone: userPhone, occupation } = data.user;
        if (!name || !userPhone || !occupation) {
          router.push("/onboarding");
        } else {
          router.push("/dashboard");
        }
      } else if (data.user.status === "pending") {
        router.push("/pending");
      } else {
        router.push("/onboarding");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setResendCooldown(60);
    setError("");

    try {
      if (isPhoneMode) {
        const res = await fetch("/api/auth/send-mobile-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (res.ok && data.sessionId) {
          setSmsSessionId(data.sessionId);
        }
      } else {
        await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      }
    } catch {
      setError("Failed to resend OTP");
    }
  }

  const displayIdentifier = isPhoneMode ? phone : email;
  const verifyTitle = isPhoneMode ? "Verify Your Mobile" : "Verify Your Email";
  const verifySubtitle = isPhoneMode
    ? "We sent a 6-digit code to"
    : "We sent a 6-digit code to";

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Image src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1920&h=1080&fit=crop" alt="" fill className="object-cover opacity-[0.06]" priority />
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d6a4f]/5 via-[#fefae0]/90 to-[#f4a261]/10" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Flower2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-primary">{verifyTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {verifySubtitle} <span className="font-medium text-foreground">{displayIdentifier}</span>
            </p>
          </div>

          <Card className="border-primary/20 shadow-xl shadow-primary/5">
            <CardContent className="pt-6">
              <form onSubmit={handleVerify} className="space-y-6">
                <div className="flex justify-center gap-2" onPaste={handlePaste}>
                  {code.map((digit, i) => (
                    <Input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      className="w-12 h-14 text-center text-2xl font-bold border-primary/30 focus-visible:ring-primary"
                    />
                  ))}
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90"
                >
                  {loading ? "Verifying..." : "Verify Code"}
                </Button>
              </form>

              <div className="mt-4">
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                >
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : "Resend code"}
                </button>
              </div>
            </CardContent>
          </Card>

          <button
            onClick={() => router.push("/")}
            className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
