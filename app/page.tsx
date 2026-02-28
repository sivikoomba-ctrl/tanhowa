"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Flower2, Leaf, TreePine, Sprout } from "lucide-react";

const categories = [
  {
    name: "Fruits",
    image: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=400&h=300&fit=crop",
  },
  {
    name: "Vegetables",
    image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=300&fit=crop",
  },
  {
    name: "Flowers",
    image: "https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=400&h=300&fit=crop",
  },
  {
    name: "Spices",
    image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400&h=300&fit=crop",
  },
  {
    name: "Plantation Crops",
    image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop",
  },
  {
    name: "Medicinal Plants",
    image: "https://images.unsplash.com/photo-1515694346937-94d85e39f29a?w=400&h=300&fit=crop",
  },
  {
    name: "Aromatic Plants",
    image: "https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=400&h=300&fit=crop",
  },
  {
    name: "Landscape Gardening",
    image: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=400&h=300&fit=crop",
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
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12">
        {/* Three-column layout: images | login | images */}
        <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center lg:items-stretch gap-6 lg:gap-8 mb-8">
          {/* Left images (first 4 categories) */}
          <div className="hidden lg:grid grid-cols-2 gap-3 flex-1">
            {categories.slice(0, 4).map((cat) => (
              <div
                key={cat.name}
                className="group relative overflow-hidden rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="aspect-[4/3] relative">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                    sizes="25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <h3 className="text-white font-semibold text-sm drop-shadow-lg">
                    {cat.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>

          {/* Center: Branding + Login */}
          <div className="w-full max-w-md text-center shrink-0">
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
                <Flower2 className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-5xl font-extrabold tracking-tight text-primary">
                TANHOWA
              </h1>
              <p className="mt-2 text-lg font-medium text-accent">
                Tamil Nadu Horticultural Officers Welfare Association
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connecting horticultural officers across Tamil Nadu
              </p>
            </div>

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
          </div>

          {/* Right images (last 4 categories) */}
          <div className="hidden lg:grid grid-cols-2 gap-3 flex-1">
            {categories.slice(4, 8).map((cat) => (
              <div
                key={cat.name}
                className="group relative overflow-hidden rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="aspect-[4/3] relative">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                    sizes="25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <h3 className="text-white font-semibold text-sm drop-shadow-lg">
                    {cat.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile: show all images in a grid below */}
        <div className="lg:hidden w-full max-w-md mb-8">
          <h2 className="text-xl font-bold text-primary text-center mb-4">Our Domains</h2>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((cat) => (
              <div
                key={cat.name}
                className="group relative overflow-hidden rounded-xl shadow-lg"
              >
                <div className="aspect-[4/3] relative">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover"
                    sizes="50vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <h3 className="text-white font-semibold text-xs drop-shadow-lg">
                    {cat.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} TANHOWA - Tamil Nadu Horticultural Officers Welfare Association
        </p>
      </div>
    </div>
  );
}
