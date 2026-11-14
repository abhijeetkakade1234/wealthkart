import type { Metadata } from "next";

import { AppShell } from "@/components/app/app-shell";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "App",
  // Wallet-gated pages are never indexed (ADR 0024).
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
