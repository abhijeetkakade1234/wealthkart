# src/components/analytics

**What's here:** charts and summaries built from chain data (PLAN.md D7, ADR 0034).
**Open this when:** changing the circle charts, the payments heatmap or the portfolio totals.

| File                    | Purpose                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `circle-analytics.tsx`  | Overview section: summary line, charts, heatmap; loading, error and "recent months only"     |
| `circle-charts.tsx`     | Circle value (area), money in each month (stacked bars), value of one share (index line)     |
| `chart-frame.tsx`       | Card around a chart with a Chart/Table toggle, so every chart can be read as numbers         |
| `payments-heatmap.tsx`  | Members × months for one year (`?year=`, paged with `?hpage=`); icon + label in every square |
| `portfolio-summary.tsx` | Home page: value, installments paid, gain, and where your money is, across all circles       |

Data comes from `src/lib/events.ts` (reads logs) and `src/lib/analytics.ts` (pure shaping, unit tested). Colours: series use `--chart-1` / `--chart-2` (validated, see ADR 0034); status colours only for heatmap states. Charts use the shadcn chart wrapper in `src/components/ui/chart.tsx` (Recharts).
