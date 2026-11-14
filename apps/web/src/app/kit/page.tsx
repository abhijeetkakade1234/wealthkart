import type { Metadata } from "next";

import { KitShowcase } from "./showcase";

/**
 * Dev showcase for the interaction kit (ADR 0026): every component in every state,
 * for human review. Not linked from the app and not indexed.
 */
export const metadata: Metadata = {
  title: "Interaction kit",
  robots: { index: false, follow: false },
};

export default function KitPage() {
  return <KitShowcase />;
}
