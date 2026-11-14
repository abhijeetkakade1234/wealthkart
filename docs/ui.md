# UI spec

Decisions: [ADR 0023](decisions/0023-ui-system.md) (system), [ADR 0025](decisions/0025-visual-identity-gallery.md) (look: "Gallery"). Reference implementation: [`design/gallery.html`](design/gallery.html). Landing page: later.

## 1. Stack

| Concern         | Choice                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Base components | shadcn/ui (Radix + Tailwind), copied into `apps/web/components/ui`, themed with the ADR 0025 tokens |
| Fonts           | `next/font/google`: Instrument Serif, Hanken Grotesk, Geist Mono                                    |
| Illustration    | Cut-paper SVG piece set in `apps/web/components/art` (placeholders until the illustrator delivers)  |
| Charts          | shadcn charts (Recharts), thin lines, accent colour, faint grid                                     |
| Icons           | lucide-react, 1.5px stroke                                                                          |
| Animation       | Framer Motion, subtle only (count-up, fade/slide); no glow, shimmer or gradient effects             |
| URL state       | `nuqs` (type-safe query params; works with static export)                                           |
| Data fetching   | TanStack Query (cache, retries, `keepPreviousData` for pagination)                                  |
| Wallet          | wagmi + viem, Core via EIP-6963 + WalletConnect                                                     |
| Toasts          | sonner                                                                                              |

## 2. Look and feel ("Gallery", ADR 0025)

- **Light, premium, calm.** Near-monochrome interface, a single cobalt accent `#2C4596`; colour otherwise only for meaning (paid / due / late). Full token table in ADR 0025.
- **Type:** Instrument Serif for page titles and big numbers; Hanken Grotesk for everything else; Geist Mono for addresses, times, tx IDs.
- **Shape:** 14px card radius, pill buttons and chips, 1px hairline borders, no gradients, glows or glass.
- **Whitespace is a hard requirement:** 8px scale, generous. App content padding 40px (22px on phones), cards 26–32px inside, table rows ~18px vertical padding, marketing sections 160–180px apart. When crowded, add space, never shrink text.
- **Illustration** (folk-art cut paper, art palette only) appears on:
  | Moment                   | Piece                                                                     |
  | ------------------------ | ------------------------------------------------------------------------- |
  | Landing hero             | Large composition (hands, shared pot, coins, mountain)                    |
  | Circle overview          | Cover banner, a unique composition per circle from its address            |
  | Phone home               | Small piece behind the stake tile                                         |
  | Onboarding, empty states | Spot illustrations                                                        |
  | Member avatars           | Tiny shape (triangle / sun / leaf / pot) coloured from the wallet address |
- **Never** decorate tables, forms or numbers being read for a money decision.
- **Motion:** subtle count-up on balances, fade/slide between routes, progress fill on votes. Respect `prefers-reduced-motion`.
- Addresses: identicon + display name + short address (`0x3f…a1`) + copy button. Amounts: AVAX with fixed decimals, `bigint` only.
- Mobile-first; bottom nav on mobile, sidebar on desktop.
- Primary action = dark ink pill button; secondary = outline pill; status = soft tinted pill with a dot.

## 3. One layout for every app page

```
┌──────────────────────────────────────────────────────────┐
│ AppShell                                                  │
│ ┌──────────┐ ┌──────────────────────────────────────────┐ │
│ │ Sidebar  │ │ TopBar: CircleSwitcher · network · wallet│ │
│ │ (desktop)│ ├──────────────────────────────────────────┤ │
│ │          │ │ PageHeader: title · subtitle · actions   │ │
│ │          │ │ StatsRow (optional): 2–4 StatCards       │ │
│ │          │ │ Toolbar (lists): Search · Filters · Size │ │
│ │          │ │ Content: DataTable | CardGrid | Form     │ │
│ │          │ │ Pagination (lists)                       │ │
│ └──────────┘ └──────────────────────────────────────────┘ │
│ BottomNav (mobile): Home · Pay · Loans · Votes · More      │
└──────────────────────────────────────────────────────────┘
```

Shared components (build first, in `apps/web/components/app`):
`AppShell`, `TopBar`, `CircleSwitcher`, `BottomNav`, `PageHeader`, `StatCard`, `StatsRow`, `ListToolbar`, `SearchInput`, `FilterChips`, `DataTable`, `CardGrid`, `Pagination`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `AddressLabel`, `AvaxAmount`, `TxButton` (handles pending/confirmed/failed), `CountdownUTC` (UTC + local time).

## 4. Pagination (every list)

- **URL is the source of truth:** `?page=3&size=20&q=ravi&status=active`. Refresh, back and shared links restore the exact view.
- Page sizes: 10 / 20 / 50, default 20 (10 on mobile).
- Shows "Showing 41–60 of 213" + first / prev / numbered pages with ellipsis / next / last.
- **Changing search or a filter resets to page 1.**
- **Out-of-range page** (e.g. `page=99` after data shrank) → clamps to the last page, without an error.
- `keepPreviousData` keeps the old page visible with a subtle loading bar while the next loads (no flash to a blank table).
- Empty result → `EmptyState` with a "clear search/filters" action.
- Data source: indexer queries with `limit/offset` (or cursor where the source needs it); totals come from the indexer. Lists read directly from contracts (small, e.g. my loans) are paginated client-side with the same component.
- Mobile: same pagination; activity feed may use "Load more" instead.

## 5. Search (debounced)

- `SearchInput` debounces **300 ms**; minimum 2 characters (an address search accepts `0x…` prefixes).
- Updates `?q=` and resets `page=1`. Cancels in-flight requests on new input (TanStack Query keys).
- Shows a spinner in the input while fetching, an "×" to clear, and `/` as the keyboard shortcut to focus.
- Matches on: display name (case-insensitive, normalised), wallet address, and the page-specific fields below.

## 6. Lists per page

| Page             | List                     | Search on             | Filters                                                               | Sort                  |
| ---------------- | ------------------------ | --------------------- | --------------------------------------------------------------------- | --------------------- |
| Home / Portfolio | My circles               | circle name           | role, status (active / exiting / closed)                              | value, name, joined   |
| Members          | Members                  | name, address         | status (active / late / dormant / exiting / default)                  | share %, joined, name |
| Loans            | All loans; my loans tab  | borrower name/address | status (voting / active / repaid / default), type (regular / medical) | amount, date, rate    |
| Votes            | Proposals                | title, proposer       | open / passed / failed / executed, type                               | ending soon, newest   |
| Activity         | Events                   | member, tx hash       | type (payment / loan / vote / fee / exit)                             | newest (default)      |
| Profile          | My history (all circles) | circle, tx hash       | circle, type                                                          | newest                |
| Members heatmap  | Members × months         | name                  | year                                                                  | —                     |

Pages with no list (Create, Join, Pay, Overview, Rules) use the same shell + header, with forms or cards.

## 7. Required states on every page

See §10. Covered by scenarios S-WEB-* and S-UX-* in `testing.md`.

## 8. Buttons and press feedback (ADR 0026)

| Moment   | What the user sees                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hover    | Slightly darker fill; cursor pointer                                                                                                               |
| Press    | Scales to 0.97 for ~120 ms, icon does its micro-animation                                                                                          |
| Working  | Icon swaps to a spinner, label changes to the action in progress ("Paying…", "Sending vote…"), button disabled, width stays fixed (no layout jump) |
| Done     | Check icon draws in for ~1 s, then the button returns to normal or the screen moves on                                                             |
| Failed   | Cross icon, short shake (skipped with reduced motion), then back to normal so the user can retry                                                   |
| Disabled | Lower contrast + tooltip saying why ("You've already paid this month")                                                                             |

- A button can't be clicked twice while working.
- Keyboard: visible focus ring; Enter/Space trigger the same feedback.

## 9. Icons and motion

- **lucide-react only. No emojis anywhere** (UI, toasts, empty states, docs on the site).
- Icon animations on interaction: `Send` nudges right on Pay, `Check` draws its stroke, `RefreshCw` spins on Retry, `Copy` → `Check` on copy, `Vote` / `ThumbsUp` lifts on Vote, `ChevronDown` rotates on open.
- Duration 150–300 ms, ease-out; never loop forever except spinners.
- `prefers-reduced-motion`: animations off, state changes still shown with icon swaps and colour.

## 10. The eight UI states

Every data-driven component renders through `StateView`, so no screen can forget a state.

| State                      | When                                     | What it shows                                                                                                           |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Loading**                | Data on its way                          | Skeleton shaped like the real content (no spinner-only screens)                                                         |
| **Success**                | Data arrived                             | The content                                                                                                             |
| **Empty**                  | Nothing to show yet                      | Spot illustration + one sentence + the next action ("No loans yet. When someone asks for one, the vote shows up here.") |
| **Error**                  | Couldn't load (network, indexer, RPC)    | What happened + Retry button; rest of the page keeps working                                                            |
| **Failed transaction**     | The chain rejected an action             | What went wrong in plain words + what to do; nothing was charged except gas, if that's true                             |
| **Partial / stale**        | Live source down, cached data shown      | Data with a small "Showing saved data from 4 min ago" note + Refresh                                                    |
| **Offline**                | Device has no internet                   | Banner "You're offline. You can look around, but paying and voting need a connection." Writes disabled                  |
| **Access**                 | No wallet / wrong network / not a member | One clear card: "Connect your Core wallet", "Switch to Avalanche", or "You're not in this circle yet"                   |
| **Pending** (transactions) | Waiting for confirmation                 | `TxTracker`: Confirm in Core → Sending → Confirmed, with a "View on explorer" link                                      |

## 11. Never crash

- `ErrorBoundary` at three levels: app root (full-page friendly error + Reload), each page layout, and each widget (card-sized error with Retry). One broken chart never takes down the page.
- All chain and indexer calls go through one `safeCall` wrapper: timeout, one retry with backoff, fallback RPC, then a typed friendly error. No raw error object ever reaches the UI.
- Global `unhandledrejection` and `error` listeners log the issue and show a toast instead of a white screen.
- Contract custom errors are decoded and mapped through the message catalogue (§12).
- Bad URL params (`?page=abc`, unknown circle) fall back to safe defaults or a "Circle not found" state.

## 12. Toasts, alerts and plain language

- **Toast** (sonner, bottom-right on desktop, top on mobile, one stack): result of something the user just did. Auto-hides in 4 s; errors stay until dismissed.
- **Inline alert** (inside the page, under the header): something on this page needs attention (dues, wrong network, rule change coming in 3 days).
- **Dialog**: only to confirm money or irreversible actions (pay, request exit, vote to dissolve), showing exactly what will happen.
- Layout: z-index scale `base 0 · sticky 10 · dropdown 20 · overlay 30 · dialog 40 · toast 50`; one dialog at a time; sticky bars reserve space; long names truncate with a tooltip.

**Writing rules:** say what happened, then what to do. No jargon, no error codes in the main text (codes go under "Details"). No blame. Short sentences.

**Message catalogue (examples):**

| Technical cause             | Message                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| User rejected in wallet     | "You cancelled this in Core. Nothing was sent."                                                                           |
| Not enough AVAX             | "Not enough AVAX in your wallet. You need 0.52 AVAX (0.50 + about 0.02 network fee)."                                     |
| Wrong network               | "Your wallet is on the wrong network. Switch to Avalanche to continue." [Switch]                                          |
| RPC/indexer down            | "We can't reach the Avalanche network right now. Your money is safe. Try again in a minute." [Retry]                      |
| Tx reverted: already paid   | "You've already paid for December."                                                                                       |
| Tx reverted: vote closed    | "This vote has already ended."                                                                                            |
| Tx reverted: loan above cap | "This loan is bigger than the circle allows for you right now. The most you can ask for is 6.2 AVAX."                     |
| Timeout / dropped tx        | "This is taking longer than usual. It may still go through; we'll update this page when it does."                         |
| Unknown error               | "Something went wrong on our side. Your money is safe. Try again, or share the details with your circle admin." [Details] |
| Success: paid               | "Paid. Your December installment of 0.50 AVAX is in."                                                                     |
| Success: voted              | "Vote counted. 8 of 12 have voted."                                                                                       |
| Copied                      | "Address copied."                                                                                                         |
