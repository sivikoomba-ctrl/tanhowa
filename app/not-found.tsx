"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f6f9f0] px-6">
      <div className="text-center max-w-sm">
        <div className="relative inline-flex items-center justify-center w-24 h-24 mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-primary/10 animate-[spin_20s_linear_infinite]" />
          <Image
            src="/logo.png"
            alt="TANHOWA"
            width={72}
            height={72}
            priority
            className="relative rounded-full"
          />
        </div>

        <p className="text-7xl font-extrabold text-primary/20 leading-none mb-2">404</p>
        <h1 className="text-xl font-bold text-foreground mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-8">
          This page doesn&apos;t exist or may have been moved. Visit{" "}
          <span className="font-medium text-primary">www.tanhowa.in</span> to access the portal.
        </p>

        <Button asChild className="bg-primary hover:bg-primary/90 rounded-xl h-11 px-6">
          <Link href="/">
            <Home size={16} className="mr-2" />
            Back to Login
          </Link>
        </Button>
      </div>

      <p className="mt-12 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} TANHOWA · Tamil Nadu Horticultural Officers Welfare Association
      </p>
    </div>
  );
}
