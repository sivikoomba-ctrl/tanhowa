"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Flower2, Mail, Smartphone } from "lucide-react";

const categories = [
  {
    name: "Fruits",
    image: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=800&h=600&fit=crop",
  },
  {
    name: "Vegetables",
    image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&h=600&fit=crop",
  },
  {
    name: "Flowers",
    image: "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=800&h=600&fit=crop",
  },
  {
    name: "Spices",
    image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&h=600&fit=crop",
  },
  {
    name: "Plantation Crops",
    image: "/plantation-crops.jpg",
  },
  {
    name: "Medicinal Plants",
    image: "/medicinal-plants.jpg",
  },
  {
    name: "Aromatic Plants",
    image: "/aromatic-plants.jpg",
  },
  {
    name: "Landscape Gardening",
    image: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&h=600&fit=crop",
  },
];

export default function LandingPage() {
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [showMobileLogin, setShowMobileLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [mobileLoading, setMobileLoading] = useState(false);
  const router = useRouter();

  // Auto-redirect approved members who already have a valid session
  useEffect(() => {
    fetch("/api/users/me")
      .then((res) => {
        if (!res.ok) throw new Error("No session");
        return res.json();
      })
      .then((data) => {
        if (!data.user) return;
        const { status, name, phone, occupation } = data.user;
        if (status === "approved") {
          if (!name || !phone || !occupation) {
            router.push("/onboarding");
          } else {
            router.push("/dashboard");
          }
        } else if (status === "pending") {
          router.push("/pending");
        }
      })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, [router]);

  // Check for OAuth error in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      const messages: Record<string, string> = {
        access_denied: "Google sign-in was cancelled.",
        token_exchange_failed: "Authentication failed. Please try again.",
        userinfo_failed: "Could not retrieve your Google account info.",
        account_creation_failed: "Failed to create your account. Please try again.",
        invalid_state: "Session expired. Please try again.",
        auth_failed: "Something went wrong. Please try again.",
        account_deleted_incomplete_profile: "Your account was removed because your profile was never completed. Please sign in again to create a new account.",
      };
      setError(messages[oauthError] || "Authentication failed. Please try again.");
      // Clean the URL
      window.history.replaceState({}, "", "/");
    }
  }, []);

  function handleGoogleLogin() {
    window.location.href = "/api/auth/google";
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEmailLoading(true);

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
      setEmailLoading(false);
    }
  }

  async function handleMobileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMobileLoading(true);

    try {
      const res = await fetch("/api/auth/send-mobile-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send OTP");
        return;
      }

      router.push(`/verify?phone=${encodeURIComponent(phone)}&sid=${encodeURIComponent(data.sessionId)}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setMobileLoading(false);
    }
  }

  const leftImages = categories.slice(0, 4);
  const rightImages = categories.slice(4, 8);

  // Bento grid heights for left and right columns (alternating tall/short)
  const leftHeights = [240, 160, 160, 240];
  const rightHeights = [160, 240, 240, 160];

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f9f0]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#f6f9f0]">
      {/* Soft gradient overlays for depth */}
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/[0.07] blur-[120px]" />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#f4a261]/[0.06] blur-[120px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#a7c957]/[0.04] blur-[100px]" />

      {/* Main layout */}
      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex-1 flex flex-col lg:flex-row items-stretch">

          {/* Left: Bento mosaic grid */}
          <div className="hidden lg:flex flex-col justify-center py-8 pl-6 xl:pl-10 flex-1 max-w-[380px] xl:max-w-[440px]">
            <div className="grid grid-cols-2 gap-3">
              {leftImages.map((cat, i) => (
                <div
                  key={cat.name}
                  className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1"
                  style={{ height: `${leftHeights[i]}px` }}
                >
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                    sizes="220px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-lg text-white text-sm font-medium border border-white/15">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      {cat.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Center: Login */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 lg:py-6 lg:max-w-lg xl:max-w-xl mx-auto">
            {/* Branding */}
            <div className="text-center mb-8">
              <div className="relative inline-flex items-center justify-center w-24 h-24 mb-4">
                <div className="absolute inset-0 rounded-full border-2 border-primary/10 animate-[spin_20s_linear_infinite]" />
                <div className="absolute inset-3 rounded-full border border-primary/15 animate-[spin_30s_linear_infinite_reverse]" />
                <div className="absolute inset-5 rounded-full bg-primary/10" />
                <Flower2 className="relative w-10 h-10 text-primary" />
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-primary">
                TANHOWA
              </h1>
              <div className="mt-3 flex items-center justify-center gap-3">
                <div className="h-px w-8 bg-gradient-to-r from-transparent to-primary/30" />
                <p className="text-base font-medium text-accent leading-snug">
                  Tamil Nadu Horticultural Officers<br />Welfare Association
                </p>
                <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/30" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Connecting Horticultural Officers across Tamil Nadu
              </p>
            </div>

            {/* Login Card */}
            <Card className="w-full max-w-sm border-primary/15 shadow-2xl shadow-primary/10 backdrop-blur-sm bg-white/85 rounded-2xl">
              <CardContent className="pt-7 pb-7 px-7">
                <h2 className="text-xl font-semibold text-foreground mb-1 text-center">
                  Welcome
                </h2>
                <p className="text-sm text-muted-foreground mb-6 text-center">
                  Sign in to access your account
                </p>

                {error && (
                  <p className="text-sm text-destructive mb-4 text-center">{error}</p>
                )}

                {/* Google Sign-In */}
                <Button
                  onClick={handleGoogleLogin}
                  variant="outline"
                  className="w-full h-12 text-base font-semibold rounded-xl border-primary/30 hover:bg-primary/5 gap-3"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" className="shrink-0">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-primary/15" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-primary/15" />
                </div>

                {/* Email OTP */}
                {!showEmailLogin ? (
                  <Button
                    onClick={() => { setShowEmailLogin(true); setShowMobileLogin(false); }}
                    variant="outline"
                    className="w-full h-12 text-base font-semibold rounded-xl border-primary/30 hover:bg-primary/5 gap-3"
                  >
                    <Mail className="w-5 h-5 shrink-0" />
                    Continue with Email
                  </Button>
                ) : (
                  <form onSubmit={handleEmailSubmit} className="space-y-3">
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12 text-base border-primary/30 focus-visible:ring-primary bg-white rounded-xl"
                    />
                    <Button
                      type="submit"
                      disabled={emailLoading}
                      className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 rounded-xl"
                    >
                      {emailLoading ? "Sending OTP..." : "Send Verification Code"}
                    </Button>
                  </form>
                )}

                {/* Mobile OTP */}
                {!showMobileLogin ? (
                  <Button
                    onClick={() => { setShowMobileLogin(true); setShowEmailLogin(false); }}
                    variant="outline"
                    className="w-full h-12 text-base font-semibold rounded-xl border-primary/30 hover:bg-primary/5 gap-3 mt-3"
                  >
                    <Smartphone className="w-5 h-5 shrink-0" />
                    Continue with Mobile
                  </Button>
                ) : (
                  <form onSubmit={handleMobileSubmit} className="space-y-3 mt-3">
                    <Input
                      type="tel"
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d\+\-\s\(\)]/g, ""))}
                      required
                      className="h-12 text-base border-primary/30 focus-visible:ring-primary bg-white rounded-xl"
                    />
                    <Button
                      type="submit"
                      disabled={mobileLoading}
                      className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 rounded-xl"
                    >
                      {mobileLoading ? "Sending OTP..." : "Send OTP to Mobile"}
                    </Button>
                  </form>
                )}

                <p className="mt-4 text-xs text-muted-foreground text-center">
                  {showEmailLogin
                    ? "We'll send a one-time verification code to your email"
                    : showMobileLogin
                    ? "We'll send a one-time verification code to your mobile"
                    : "Use your Google, email, or mobile number to sign in"}
                </p>
              </CardContent>
            </Card>

            {/* Our Domains divider */}
            <div className="hidden lg:flex items-center gap-4 mt-10">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-primary/20" />
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary/30" />
                <span className="text-[10px] font-bold text-primary/40 uppercase tracking-[0.2em]">Our Domains</span>
                <span className="w-2 h-2 rounded-full bg-primary/30" />
              </div>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-primary/20" />
            </div>
          </div>

          {/* Right: Bento mosaic grid (mirrored heights) */}
          <div className="hidden lg:flex flex-col justify-center py-8 pr-6 xl:pr-10 flex-1 max-w-[380px] xl:max-w-[440px]">
            <div className="grid grid-cols-2 gap-3">
              {rightImages.map((cat, i) => (
                <div
                  key={cat.name}
                  className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1"
                  style={{ height: `${rightHeights[i]}px` }}
                >
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                    sizes="220px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-lg text-white text-sm font-medium border border-white/15">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      {cat.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: Clean grid */}
        <div className="lg:hidden px-5 pb-8">
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="h-px w-10 bg-primary/20" />
            <h2 className="text-lg font-bold text-primary">Our Domains</h2>
            <div className="h-px w-10 bg-primary/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((cat, i) => (
              <div
                key={cat.name}
                className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-500"
                style={{ height: i % 3 === 0 ? 160 : 130 }}
              >
                <Image
                  src={cat.image}
                  alt={cat.name}
                  fill
                  className="object-cover"
                  sizes="50vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-lg text-white text-xs font-medium">
                    <span className="w-1 h-1 rounded-full bg-green-400" />
                    {cat.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} TANHOWA - Tamil Nadu Horticultural Officers Welfare Association
          </p>
        </div>
      </div>
    </div>
  );
}
