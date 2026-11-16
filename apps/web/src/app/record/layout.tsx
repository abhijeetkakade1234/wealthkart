import type { Metadata } from "next";

import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Repayment record",
  // Per-wallet data: viewable by anyone with the link, never indexed (ADR 0024, 0042).
  robots: { index: false, follow: false },
};

export default function RecordLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
