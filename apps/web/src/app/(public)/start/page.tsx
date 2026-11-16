import { chainForNetwork } from "@wealthkart/sdk";

import { StartGuide } from "@/components/public/start-guide";
import { START } from "@/content/pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata(START);

/** `/start`: the onboarding guide for people new to crypto (ADR 0054). */
export default function Page() {
  const testnet = Boolean(chainForNetwork(process.env.NEXT_PUBLIC_NETWORK).testnet);
  return <StartGuide page={START} testnet={testnet} />;
}
