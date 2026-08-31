import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-display font-semibold tracking-wide uppercase select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 transition-[scale,background-color,color,box-shadow,opacity] duration-150 ease-out active:enabled:scale-[0.96]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "bg-transparent text-fg shadow-[0_0_0_1px_var(--color-border-strong)] hover:bg-surface-2",
        ghost: "bg-transparent text-muted hover:bg-surface-2 hover:text-fg",
        danger: "bg-danger text-primary-foreground hover:bg-danger/90",
        live: "bg-danger/15 text-danger shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_45%,transparent)] hover:bg-danger/25",
        good: "bg-good/15 text-good shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-good)_40%,transparent)] hover:bg-good/25",
      },
      size: {
        default: "h-9 rounded-sm px-3.5 text-xs",
        sm: "h-8 rounded-sm px-2.5 text-2xs",
        lg: "h-10 rounded-md px-4 text-sm",
        icon: "size-9 rounded-sm",
        micro: "h-7 rounded-xs px-2 text-micro",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
