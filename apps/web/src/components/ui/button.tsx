import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Base shadcn button, restyled for "Gallery" (ADR 0025): pill shape, ink primary,
 * outline secondary, hairline borders, no shadows or gradients.
 * App code should use the kit `Button` (`@/components/kit`), which adds press,
 * working, done and failed feedback (ADR 0026).
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border text-[14.5px] font-semibold whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-brand/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground hover:border-black hover:bg-black",
        outline: "border-border bg-card text-foreground hover:bg-secondary",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-border",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-secondary",
        destructive: "border-bad bg-bad text-white hover:bg-[#a9311a]",
        link: "h-auto border-transparent px-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 gap-1.5 px-4 text-[13.5px]",
        lg: "h-12 px-7 text-[15px]",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
