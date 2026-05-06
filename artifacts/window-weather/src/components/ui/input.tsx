import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[22px] w-full rounded-none bg-white px-2 py-1 text-[11px] text-black border border-[#7f9db9] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.15),inset_-1px_-1px_0_rgba(255,255,255,0.6)] placeholder:text-[#888] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#316ac5] disabled:cursor-not-allowed disabled:opacity-50 font-[Tahoma,Geneva,sans-serif]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
