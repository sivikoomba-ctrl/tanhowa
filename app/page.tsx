"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Flower2 } from "lucide-react";

// Golden ratio constants
const PHI = 1.618;
const GOLDEN_ANGLE = 137.508;

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
    image: "https://images.unsplash.com/photo-1504387103978-e4ee71416c38?w=800&h=600&fit=crop",
  },
  {
    name: "Medicinal Plants",
    image: "https://images.unsplash.com/photo-1515694346937-94d85e39f29a?w=800&h=600&fit=crop",
  },
  {
    name: "Aromatic Plants",
    image: "https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=800&h=600&fit=crop",
  },
  {
    name: "Landscape Gardening",
    image: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&h=600&fit=crop",
  },
];

// Organic leaf shapes - asymmetric border-radius inspired by natural forms
const leafShapes = [
  "62% 38% 50% 50% / 45% 55% 45% 55%",
  "38% 62% 55% 45% / 55% 45% 55% 45%",
  "55% 45% 38% 62% / 40% 60% 40% 60%",
  "45% 55% 62% 38% / 60% 40% 60% 40%",
  "58% 42% 48% 52% / 52% 48% 55% 45%",
  "42% 58% 52% 48% / 48% 52% 48% 52%",
  "50% 50% 40% 60% / 42% 58% 50% 50%",
  "60% 40% 50% 50% / 50% 50% 58% 42%",
];

// Golden angle rotations for each image (subtle, like leaf phyllotaxis)
const rotations = categories.map((_, i) => {
  const raw = ((i + 1) * GOLDEN_ANGLE) % 360;
  return (raw > 180 ? raw - 360 : raw) * 0.04; // Scale to subtle ±7°
});

// Sizes decrease following golden ratio scaling
const baseSizePx = 320;
const imageSizes = categories.map((_, i) =>
  Math.round(baseSizePx / Math.pow(1.05, i))
);

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

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#f6f9f0]">
      {/* Golden spiral SVG background */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M500,500 Q500,200 300,200 Q100,200 100,400 Q100,700 400,700 Q750,700 750,350 Q750,0 375,0 Q0,0 0,500 Q0,1000 500,1000 Q1000,1000 1000,500"
          fill="none"
          stroke="#2d6a4f"
          strokeWidth="3"
        />
        <path
          d="M500,500 Q500,350 400,350 Q300,350 300,450 Q300,600 450,600 Q625,600 625,425 Q625,250 438,250 Q250,250 250,500 Q250,750 500,750 Q750,750 750,500"
          fill="none"
          stroke="#2d6a4f"
          strokeWidth="2"
        />
      </svg>

      {/* Decorative radial dots - fibonacci pattern */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(21)].map((_, i) => {
          const n = i + 1;
          const angle = n * GOLDEN_ANGLE * (Math.PI / 180);
          const r = 6 * Math.sqrt(n);
          const x = 50 + r * Math.cos(angle);
          const y = 50 + r * Math.sin(angle) * 0.65;
          const size = Math.max(3, 10 - i * 0.4);
          return (
            <div
              key={i}
              className="absolute rounded-full bg-primary/[0.06]"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: `${size}px`,
                height: `${size}px`,
                transform: "translate(-50%, -50%)",
              }}
            />
          );
        })}
      </div>

      {/* Soft gradient overlays */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/[0.06] blur-[100px]" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#f4a261]/[0.06] blur-[100px]" />
      <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-[#a7c957]/[0.05] blur-[80px]" />

      {/* Main layout */}
      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex-1 flex flex-col lg:flex-row items-stretch">

          {/* Left: Phyllotaxis image column */}
          <div className="hidden lg:flex flex-col justify-center gap-5 p-5 xl:p-8 flex-1 max-w-[360px] xl:max-w-[420px]">
            {leftImages.map((cat, i) => {
              const indent = i % 2 === 0 ? "ml-0 mr-6" : "ml-8 mr-0";
              return (
                <div
                  key={cat.name}
                  className={`group relative overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-700 hover:-translate-y-1 ${indent}`}
                  style={{
                    borderRadius: leafShapes[i],
                    transform: `rotate(${rotations[i]}deg)`,
                    height: `${imageSizes[i] * 0.618}px`,
                  }}
                >
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-1000"
                    sizes="(max-width: 1280px) 320px, 400px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/15 backdrop-blur-md rounded-full text-white text-sm font-medium border border-white/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      {cat.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center: Golden ratio positioned login */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 lg:py-6 lg:max-w-lg xl:max-w-xl mx-auto">
            {/* Branding */}
            <div className="text-center mb-8" style={{ marginTop: `${(1 - 1 / PHI) * 10}%` }}>
              <div className="relative inline-flex items-center justify-center w-28 h-28 mb-5">
                {/* Fibonacci rings */}
                <div className="absolute inset-0 rounded-full border-2 border-primary/10 animate-[spin_20s_linear_infinite]" />
                <div className="absolute inset-2 rounded-full border border-primary/15 animate-[spin_30s_linear_infinite_reverse]" />
                <div className="absolute inset-4 rounded-full bg-primary/10" />
                <Flower2 className="relative w-12 h-12 text-primary" />
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

            {/* Login Card - golden ratio proportioned */}
            <Card
              className="w-full max-w-sm border-primary/15 shadow-2xl shadow-primary/10 backdrop-blur-sm bg-white/85"
              style={{ borderRadius: "24px 8px 24px 8px" }}
            >
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

          {/* Right: Phyllotaxis image column (opposite offset) */}
          <div className="hidden lg:flex flex-col justify-center gap-5 p-5 xl:p-8 flex-1 max-w-[360px] xl:max-w-[420px]">
            {rightImages.map((cat, i) => {
              const idx = i + 4;
              const indent = i % 2 === 0 ? "ml-6 mr-0" : "ml-0 mr-8";
              return (
                <div
                  key={cat.name}
                  className={`group relative overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-700 hover:-translate-y-1 ${indent}`}
                  style={{
                    borderRadius: leafShapes[idx],
                    transform: `rotate(${rotations[idx]}deg)`,
                    height: `${imageSizes[idx] * 0.618}px`,
                  }}
                >
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-1000"
                    sizes="(max-width: 1280px) 320px, 400px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/15 backdrop-blur-md rounded-full text-white text-sm font-medium border border-white/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      {cat.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile: nature grid */}
        <div className="lg:hidden px-5 pb-8">
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="h-px w-10 bg-primary/20" />
            <h2 className="text-lg font-bold text-primary">Our Domains</h2>
            <div className="h-px w-10 bg-primary/20" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {categories.map((cat, i) => (
              <div
                key={cat.name}
                className="group relative overflow-hidden shadow-md hover:shadow-lg transition-all duration-500"
                style={{ borderRadius: leafShapes[i] }}
              >
                <div className="aspect-[4/3] relative">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover"
                    sizes="50vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/15 backdrop-blur-sm rounded-full text-white text-xs font-medium">
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
