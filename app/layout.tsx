import type { Metadata, Viewport } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import ChatbotWidget from "@/components/chatbot-widget";
import { ErrorBoundary, GlobalErrorCatcher } from "@/components/error-boundary";
import { LanguageProvider } from "@/lib/i18n";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SeasonalTheme } from "@/components/seasonal-theme";
import { Snowflakes } from "@/components/snowflakes";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TANHOWA - Tamil Nadu Horticultural Officers Welfare Association",
  description:
    "TANHOWA - Tamil Nadu Horticultural Officers Welfare Association. Connecting horticultural officers and professionals.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TANHOWA",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#2d6a4f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${poppins.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <LanguageProvider>
          <ErrorBoundary>
            <GlobalErrorCatcher>
              {children}
            </GlobalErrorCatcher>
          </ErrorBoundary>
        </LanguageProvider>
        <SeasonalTheme />
        <Snowflakes />
        <Toaster />
        <ChatbotWidget />
        <SpeedInsights />
      </body>
    </html>
  );
}
