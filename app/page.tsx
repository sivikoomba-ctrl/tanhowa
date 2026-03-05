"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Flower2 } from "lucide-react";

const categories = [
  {
    name: "Fruits",
    image: "https://images.unsplash.com/photo-1553279768-865429fa0078?w=800&h=600&fit=crop",
  },
  {
    name: "Vegetables",
    image: "https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?w=800&h=600&fit=crop",
  },
  {
    name: "Flowers",
    image: "https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=800&h=600&fit=crop",
  },
  {
    name: "Spices",
    image: "https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=800&h=600&fit=crop",
  },
  {
    name: "Plantation Crops",
    image: "https://images.unsplash.com/photo-1501554728187-ce583db33af7?w=800&h=600&fit=crop",
  },
  {
    name: "Medicinal Plants",
    image: "https://images.unsplash.com/photo-1611241893603-3c228ee0ae6f?w=800&h=600&fit=crop",
  },
  {
    name: "Aromatic Plants",
    image: "https://images.unsplash.com/photo-1462275646964-a0e3c11f18a6?w=800&h=600&fit=crop",
  },
  {
    name: "Landscape Gardening",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&h=600&fit=crop",
  },
];

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

  const leftImages = categories.slice(0, 4);
  const rightImages = categories.slice(4, 8);

  // Bento grid heights for left and right columns (alternating tall/short)
  const leftHeights = [240, 160, 160, 240];
  const rightHeights = [160, 240, 240, 160];

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
                Connecting horticultural officers across Tamil Nadu
              </p>
            </div>

            {/* Login Card */}
            <Card className="w-full max-w-sm border-primary/15 shadow-2xl shadow-primary/10 backdrop-blur-sm bg-white/85 rounded-2xl">
              <CardContent className="pt-7 pb-7 px-7">
                <h2 className="text-xl font-semibold text-foreground mb-1 text-center">
                  Welcome
                </h2>
                <p className="text-sm text-muted-foreground mb-6 text-center">
                  Enter your email to sign in or create an account
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 text-base border-primary/30 focus-visible:ring-primary bg-white rounded-xl"
                  />

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 rounded-xl"
                  >
                    {loading ? "Sending OTP..." : "Continue with Email"}
                  </Button>
                </form>

                <p className="mt-4 text-xs text-muted-foreground text-center">
                  We&apos;ll send a one-time verification code to your email
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
