import type { Metadata, Viewport } from "next";
import { Geist_Mono, Hanken_Grotesk, Instrument_Serif } from "next/font/google";
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
      className={`${hanken.variable} ${instrumentSerif.variable} ${geistMono.variable}`}
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
