/**
 * Landing page placeholder. The real landing page is designed later (PLAN.md, ADR 0025);
 * this keeps the Gallery look so the build and theme can be checked end to end.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1180px] flex-col px-4 sm:px-10">
      <nav className="flex items-center justify-between py-9">
        <span className="font-display text-[26px] tracking-tight">WealthKart</span>
        <span className="text-sm text-muted-foreground">Coming soon</span>
      </nav>

      <section className="flex flex-1 flex-col justify-center py-24 sm:py-40">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Savings circles on Avalanche
        </p>
        <h1 className="mt-6 max-w-[14ch] font-display text-[clamp(44px,6.2vw,84px)] leading-[0.98] tracking-tight">
          Save together. <em className="text-brand">Borrow</em> by vote.
        </h1>
        <p className="mt-7 max-w-[40ch] text-[17.5px] leading-relaxed text-muted-foreground">
          A private circle for friends: everyone adds AVAX each month, loans are decided by the
          group, and the contract keeps the books. No one holds the money but the circle.
        </p>
      </section>
    </main>
  );
}
