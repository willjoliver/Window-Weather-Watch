import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-none border px-2 py-0.5 text-[10px] font-normal transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-[#316ac5] text-white border-[#1a4898]",
        secondary:
          "bg-[#ece9d8] text-black border-[#aca899] shadow-[inset_1px_1px_0_rgba(255,255,255,0.8),inset_-1px_-1px_0_rgba(0,0,0,0.1)]",
        destructive:
          "bg-[#cc0000] text-white border-[#8b0000]",
        outline:
          "bg-[#ece9d8] text-black border-[#aca899]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
