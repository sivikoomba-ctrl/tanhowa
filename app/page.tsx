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
    image: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=800&h=600&fit=crop",
  },
  {
    name: "Vegetables",
    image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&h=600&fit=crop",
  },
  {
    name: "Flowers",
    image: "https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=800&h=600&fit=crop",
  },
  {
    name: "Spices",
    image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&h=600&fit=crop",
  },
  {
    name: "Plantation Crops",
    image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=600&fit=crop",
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
    <div className="min-h-screen relative overflow-hidden bg-[#f8faf5]">
      {/* Background decorative circles */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/3 blur-3xl" />

      {/* Main layout */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Desktop: Full-width layout */}
        <div className="flex-1 flex flex-col lg:flex-row items-stretch">

          {/* Left image strip - staggered vertical */}
          <div className="hidden lg:flex flex-col gap-4 p-6 flex-1 max-w-[320px] xl:max-w-[380px]">
            <div className="mt-8" />
            {categories.slice(0, 4).map((cat, i) => (
              <div
                key={cat.name}
                className={`group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 ${
                  i % 2 === 0 ? "ml-0 mr-4" : "ml-4 mr-0"
                }`}
              >
                <div className="aspect-[3/2] relative">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                    sizes="(max-width: 1280px) 280px, 350px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium">
                    {cat.name}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Center: Branding + Login */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 lg:py-8 lg:max-w-lg xl:max-w-xl mx-auto">
            {/* Logo */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 mb-5 ring-4 ring-primary/5">
                <Flower2 className="w-12 h-12 text-primary" />
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-primary">
                TANHOWA
              </h1>
              <p className="mt-3 text-lg font-medium text-accent leading-snug">
                Tamil Nadu Horticultural Officers<br />Welfare Association
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Connecting horticultural officers across Tamil Nadu
              </p>
            </div>

            {/* Login Card */}
            <Card className="w-full max-w-sm border-primary/20 shadow-2xl shadow-primary/10 backdrop-blur-sm bg-white/80">
              <CardContent className="pt-6 pb-6">
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
                    className="h-12 text-base border-primary/30 focus-visible:ring-primary bg-white"
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

                <p className="mt-4 text-xs text-muted-foreground text-center">
                  We&apos;ll send a one-time verification code to your email
                </p>
              </CardContent>
            </Card>

            {/* Domains label */}
            <div className="hidden lg:flex items-center gap-3 mt-10">
              <div className="h-px w-12 bg-primary/20" />
              <span className="text-xs font-semibold text-primary/50 uppercase tracking-widest">Our Domains</span>
              <div className="h-px w-12 bg-primary/20" />
            </div>
          </div>

          {/* Right image strip - staggered vertical (opposite offset) */}
          <div className="hidden lg:flex flex-col gap-4 p-6 flex-1 max-w-[320px] xl:max-w-[380px]">
            <div className="mt-16" />
            {categories.slice(4, 8).map((cat, i) => (
              <div
                key={cat.name}
                className={`group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 ${
                  i % 2 === 0 ? "ml-4 mr-0" : "ml-0 mr-4"
                }`}
              >
                <div className="aspect-[3/2] relative">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                    sizes="(max-width: 1280px) 280px, 350px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium">
                    {cat.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile: scrollable image strip */}
        <div className="lg:hidden px-4 pb-6">
          <h2 className="text-xl font-bold text-primary text-center mb-4">Our Domains</h2>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((cat) => (
              <div
                key={cat.name}
                className="group relative overflow-hidden rounded-xl shadow-md"
              >
                <div className="aspect-[4/3] relative">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover"
                    sizes="50vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <span className="inline-block px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs font-medium">
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
