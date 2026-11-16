import type { Metadata, Viewport } from "next";
import {
  Geist_Mono,
  Hanken_Grotesk,
  Instrument_Serif,
  Noto_Sans_Devanagari,
  Noto_Serif_Devanagari,
} from "next/font/google";
import { ErrorBoundary, GlobalErrorHandlers, Toaster } from "@/components/kit";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE_NAME, SITE_URL } from "@/content/site";

import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

/*
 * Devanagari for Hindi and Marathi (ADR 0057). Only the devanagari subset, never preloaded:
 * globals.css adds these to the font stacks only when <html lang> is hi or mr, and the
 * @font-face unicode-range means a browser downloads them only for Devanagari text.
 */
const notoSansDeva = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-sans-deva",
  display: "swap",
  preload: false,
});

const notoSerifDeva = Noto_Serif_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-serif-deva",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "WealthKart: savings circles for friends, on Avalanche",
    template: "%s · WealthKart",
  },
  description:
    "A private circle for friends: everyone adds AVAX each month, loans are decided by the group, and the contract keeps the books.",
  applicationName: SITE_NAME,
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#fafaf8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // `lang` follows the chosen language on the client (LocaleBoot) and is hi/mr in the
      // static HTML of /hi/ and /mr/ pages (scripts/localize-html.mjs), so it may differ.
      suppressHydrationWarning
      className={`${hanken.variable} ${instrumentSerif.variable} ${geistMono.variable} ${notoSansDeva.variable} ${notoSerifDeva.variable}`}
    >
      <body>
        <TooltipProvider>
          <ErrorBoundary preset="app">{children}</ErrorBoundary>
          <Toaster />
          <GlobalErrorHandlers />
          <RegisterServiceWorker />
        </TooltipProvider>
      </body>
    </html>
  );
}
