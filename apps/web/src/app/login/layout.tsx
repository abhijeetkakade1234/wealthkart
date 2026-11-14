import type { Metadata } from "next";

import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Sign in",
  // Part of the wallet app, never indexed (ADR 0024).
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
