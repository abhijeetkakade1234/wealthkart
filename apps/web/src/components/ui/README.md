# components/ui

**What's here:** shadcn/ui primitives (added with the shadcn CLI), restyled to the "Gallery" look (ADR 0025): pill buttons, 14px/20px radii, hairline borders, the z-index scale from `globals.css`.
**Open this when:** you need a base primitive or are adding a new shadcn component. For app buttons and feedback use `@/components/kit` instead.

**Key files**

| Path           | Purpose                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `button.tsx`   | `buttonVariants`: ink pill primary, outline pill secondary, ghost         |
| `dialog.tsx`   | Confirm dialogs for money or irreversible actions (overlay 30, dialog 40) |
| `tooltip.tsx`  | Tooltips (sits on the toast layer so it shows above dialogs)              |
| `skeleton.tsx` | Skeleton blocks for loading states                                        |
