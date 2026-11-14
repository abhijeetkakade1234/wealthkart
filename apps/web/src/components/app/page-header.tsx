/** Page title block used at the top of every app page (docs/ui.md §3). */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
      <div className="grid gap-2">
        <h1 className="font-display text-[clamp(32px,4vw,44px)] leading-none tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-[14.5px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
