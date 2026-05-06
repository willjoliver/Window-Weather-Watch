import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-[4px] w-full grow overflow-visible rounded-none bg-white border border-[#7f9db9] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.2)]">
      <SliderPrimitive.Range className="absolute h-full bg-[#316ac5]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-[13px] w-[13px] rounded-none border border-[#7f9db9] bg-gradient-to-b from-white to-[#e8e8e0] shadow-[1px_1px_0_rgba(255,255,255,0.8),-1px_-1px_0_rgba(0,0,0,0.1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#316ac5] disabled:pointer-events-none disabled:opacity-50 cursor-default" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
