import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "xp-btn inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:     "xp-btn-primary",
        destructive: "xp-btn-destructive",
        outline:     "",
        secondary:   "",
        ghost:       "xp-btn-ghost",
        link:        "shadow-none bg-transparent border-transparent text-[#0000ff] underline-offset-4 hover:underline hover:bg-transparent hover:border-transparent",
      },
      size: {
        default: "min-h-[23px] px-3 py-1 text-[11px]",
        sm:      "min-h-[21px] px-2 py-0.5 text-[11px]",
        lg:      "min-h-[25px] px-6 py-1.5 text-[11px]",
        icon:    "h-[23px] w-[23px] !min-w-0 p-0 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
